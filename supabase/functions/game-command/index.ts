// Edge Function: lệnh của quản trò cho ván. Engine chạy ở đây — backend là nguồn dữ liệu có thẩm quyền.
// Luồng: xác thực JWT → kiểm tra quản trò → nạp trạng thái → engine → commit_game (transaction, revision, idempotency).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  COMMAND_LABELS,
  parseGameCommand,
  type CommandErrorBody,
  type CommandRequest,
  type CommandResponse,
} from '../_shared/commands.ts'
import {
  aggregateRemoteAction,
  DEFAULT_REMOTE_SETTINGS,
  remoteProjection,
  type RemoteSubmission,
  type RoomOptions,
} from '../_shared/remote.ts'
import {
  applyCommand,
  assignmentRows,
  createGame,
  cryptoRandomInt,
  EngineError,
  publicView,
  suggestCounts,
  type GameState,
  type RoleDef,
  type SeatInput,
} from '../_shared/engine/index.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-request-id',
}

/**
 * Một dòng JSON cho mỗi request. Chỉ ghi định danh và kết quả: không bao giờ ghi JWT, key,
 * thân lệnh (vai, mục tiêu, phiếu) hay trạng thái ván.
 */
interface RequestLog {
  requestId: string
  scope?: string
  command?: string
  commandId?: string
  roomId?: string
  gameId?: string
  status?: number
  code?: string
  ms?: number
  /** Chỉ cho lỗi 5xx: thông báo DB / tên lỗi, đã cắt ngắn. */
  detail?: string
}
const logLine = (level: 'info' | 'warn' | 'error', entry: RequestLog) =>
  console[level](JSON.stringify({ level, fn: 'game-command', ...entry }))

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

const fail = (status: number, code: string, message: string) =>
  json(status, { error: { code, message } })

class HttpError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface RoomRow {
  id: string
  name: string
  host_id: string
  status: 'open' | 'locked' | 'closed'
  options: RoomOptions
  current_game_id: string | null
}

async function must<T>(
  p: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  what: string,
): Promise<T> {
  const { data, error } = await p
  if (error) throw new HttpError(500, 'DB_ERROR', `${what}: ${error.message}`)
  if (data === null) throw new HttpError(404, 'NOT_FOUND', what)
  return data
}

async function loadRoom(db: SupabaseClient, roomId: string, userId: string): Promise<RoomRow> {
  const room = await must<RoomRow>(
    db
      .from('rooms')
      .select('id,name,host_id,status,options,current_game_id')
      .eq('id', roomId)
      .maybeSingle(),
    'Không tìm thấy phòng',
  )
  if (room.host_id !== userId)
    throw new HttpError(403, 'NOT_HOST', 'Chỉ quản trò của phòng mới làm được việc này.')
  if (room.status === 'closed') throw new HttpError(409, 'ROOM_CLOSED', 'Phòng đã đóng.')
  return room
}

async function loadSeats(db: SupabaseClient, roomId: string): Promise<SeatInput[]> {
  const rows = await must<{ id: string; name: string; seat: number; device: boolean }[]>(
    db
      .from('room_members')
      .select('id,name,seat,device')
      .eq('room_id', roomId)
      .eq('status', 'active')
      .order('seat'),
    'Không đọc được danh sách người chơi',
  )
  return rows
}

async function loadCustomRoles(db: SupabaseClient, ownerId: string): Promise<RoleDef[]> {
  const rows = await must<
    { id: string; name: string; team: RoleDef['team']; short: string; wakes: boolean }[]
  >(
    db.from('custom_roles').select('id,name,team,short,wakes').eq('owner_id', ownerId),
    'Không đọc được vai tùy chỉnh',
  )
  return rows.map((r) => ({
    id: 'custom:' + r.id,
    name: r.name,
    team: r.team,
    icon: 'sparkles',
    short: r.short || 'Vai tùy chỉnh do nhóm tự đặt luật.',
    skill: r.short || 'Quản trò xử lý theo luật của nhóm.',
    wake: r.wakes ? 'Mỗi đêm, sau các vai gốc' : 'Không thức dậy',
    gm: true,
    custom: true,
    wakes: r.wakes,
    note: 'Vai do nhóm tạo. Quản trò xử lý kỹ năng thủ công.',
  }))
}

async function createGameRow(
  db: SupabaseClient,
  roomId: string,
  state: GameState,
): Promise<string> {
  const { data, error } = await db.rpc('create_game', {
    p_room: roomId,
    p_state: state,
    p_public: publicView(state),
  })
  if (error) throw new HttpError(500, 'DB_ERROR', error.message)
  return data as string
}

async function roomCommand(
  db: SupabaseClient,
  userId: string,
  req: Extract<CommandRequest, { scope: 'room' }>,
) {
  const room = await loadRoom(db, req.roomId, userId)
  const current = room.current_game_id
    ? await must<{ id: string; status: string; revision: number }>(
        db.from('games').select('id,status,revision').eq('id', room.current_game_id).maybeSingle(),
        'Không tìm thấy ván',
      )
    : null

  if (req.command.type === 'game.ensure') {
    if (room.status !== 'locked')
      throw new HttpError(409, 'ROOM_OPEN', 'Chốt phòng trước khi chọn bộ vai.')
    if (current && current.status !== 'ended')
      return { gameId: current.id, revision: current.revision, duplicate: true }
    const seats = await loadSeats(db, room.id)
    const state = createGame(
      room.name,
      room.options,
      suggestCounts(seats.length).counts,
      await loadCustomRoles(db, userId),
    )
    return { gameId: await createGameRow(db, room.id, state), revision: 0, duplicate: false }
  }

  // game.replay: ván mới với cùng nhóm và bộ vai; ván cũ giữ nguyên làm lịch sử.
  if (!current || current.status !== 'ended')
    throw new HttpError(409, 'NOT_ENDED', 'Ván hiện tại chưa kết thúc.')
  const prev = await must<{ state: GameState }>(
    db.from('game_secrets').select('state').eq('game_id', current.id).maybeSingle(),
    'Không đọc được ván cũ',
  )
  const state = createGame(
    room.name,
    room.options,
    prev.state.counts,
    await loadCustomRoles(db, userId),
  )
  if (room.status === 'open') {
    const { error } = await db.from('rooms').update({ status: 'locked' }).eq('id', room.id)
    if (error) throw new HttpError(500, 'DB_ERROR', error.message)
  }
  return { gameId: await createGameRow(db, room.id, state), revision: 0, duplicate: false }
}

async function gameCommand(
  db: SupabaseClient,
  userId: string,
  req: Extract<CommandRequest, { scope: 'game' }>,
): Promise<CommandResponse> {
  const command = parseGameCommand(req.command)
  if (!command) throw new HttpError(400, 'BAD_COMMAND', 'Lệnh không hợp lệ.')
  const game = await must<{ id: string; room_id: string; revision: number }>(
    db.from('games').select('id,room_id,revision').eq('id', req.gameId).maybeSingle(),
    'Không tìm thấy ván',
  )
  const room = await loadRoom(db, game.room_id, userId)
  if (room.current_game_id !== game.id)
    throw new HttpError(409, 'OLD_GAME', 'Ván này đã được thay bằng ván mới.')
  if (command.type === 'remote.timeout') {
    if (room.options.mode !== 'remote')
      throw new HttpError(409, 'LOCAL_ROOM', 'Phòng cùng chỗ không có lượt remote.')
    const { error } = await db.rpc('host_timeout_remote_prompt', {
      p_game: game.id,
      p_prompt: command.promptId,
      p_actor_user: userId,
      p_client_action_id: req.commandId,
      p_reason: command.reason,
    })
    if (error)
      throw new HttpError(
        error.details === 'PHASE_STALE' || error.details === 'PROMPT_LOCKED' ? 409 : 500,
        error.details || 'DB_ERROR',
        error.message,
      )
    return { gameId: game.id, revision: game.revision, duplicate: false }
  }
  const { state: prev } = await must<{ state: GameState }>(
    db.from('game_secrets').select('state').eq('game_id', game.id).maybeSingle(),
    'Không đọc được trạng thái ván',
  )

  let next: GameState
  let label: string | null = null
  let historyState: GameState | null = null
  let popHistory = false
  let assignments: unknown[] | null = null

  if (command.type === 'undo') {
    if (prev.status !== 'playing')
      throw new HttpError(409, 'NO_UNDO', 'Chỉ hoàn tác được trong lúc chơi.')
    const { data: last, error } = await db
      .from('game_history')
      .select('state,label')
      .eq('game_id', game.id)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new HttpError(500, 'DB_ERROR', error.message)
    if (!last) throw new HttpError(409, 'NO_UNDO', 'Chưa có thao tác để hoàn tác.')
    next = last.state as GameState
    label = last.label as string
    popHistory = true
  } else {
    const needsRoomLocked = ['deal', 'send', 'start'].includes(command.type)
    if (needsRoomLocked && room.status !== 'locked')
      throw new HttpError(409, 'ROOM_OPEN', 'Chốt phòng trước khi chia vai.')
    const base = structuredClone(prev)
    if (command.type === 'deck.set' || command.type === 'deal')
      base.customRoles = await loadCustomRoles(db, userId)
    const seats = command.type === 'deal' ? await loadSeats(db, room.id) : undefined
    if (command.type === 'remote.lock') {
      if (room.options.mode !== 'remote')
        throw new HttpError(409, 'LOCAL_ROOM', 'Phòng cùng chỗ không có lượt remote.')
      const phase = await must<{ sequence: number; status: string }>(
        db.from('remote_phases').select('sequence,status').eq('game_id', game.id).maybeSingle(),
        'Không tìm thấy lượt remote',
      )
      if (phase.status !== 'open') throw new HttpError(409, 'PHASE_LOCKED', 'Lượt đã khóa.')
      const prompts = await must<{ id: string; member_id: string }[]>(
        db
          .from('game_prompts')
          .select('id,member_id')
          .eq('game_id', game.id)
          .eq('phase_sequence', phase.sequence),
        'Không đọc được prompt',
      )
      const promptIds = prompts.map((prompt) => prompt.id)
      const rows = promptIds.length
        ? await must<
            { prompt_id: string; member_id: string; payload: RemoteSubmission['payload'] }[]
          >(
            db
              .from('game_action_submissions')
              .select('prompt_id,member_id,payload')
              .in('prompt_id', promptIds),
            'Không đọc được hành động',
          )
        : []
      const actions = aggregateRemoteAction(
        base,
        rows.map((row) => ({ memberId: row.member_id, payload: row.payload })),
      )
      if (rows.length < prompts.length)
        throw new HttpError(
          409,
          'WAITING_ACTORS',
          'Còn người chưa gửi. Hãy chờ hoặc ghi nhận bỏ lượt hộ trước khi khóa.',
        )
      if (actions.length === 0)
        throw new HttpError(409, 'NOT_LOCKABLE', 'Phase này không có hành động để khóa.')
      next = actions.reduce(
        (state, action) => applyCommand(state, action, { randomInt: cryptoRandomInt }),
        base,
      )
    } else {
      next = applyCommand(base, command, { randomInt: cryptoRandomInt, seats })
    }
    if (command.type === 'deal') assignments = assignmentRows(next)
    if (prev.status === 'dealt' && next.status === 'setup') assignments = []
    if (prev.status === 'playing' && command.type !== 'finish') {
      historyState = prev
      label = COMMAND_LABELS[command.type] ?? command.type
    }
  }

  const { data, error } = await db.rpc('commit_game', {
    p_game: game.id,
    p_expected_revision: req.expectedRevision,
    p_command_id: req.commandId,
    p_state: next,
    p_public: publicView(next),
    p_label: label,
    p_history_state: historyState,
    p_pop_history: popHistory,
    p_assignments: assignments,
    p_remote:
      room.options.mode === 'remote'
        ? remoteProjection(next, { ...DEFAULT_REMOTE_SETTINGS, ...room.options })
        : null,
  })
  if (error) {
    if (error.details === 'REVISION_CONFLICT')
      throw new HttpError(409, 'REVISION_CONFLICT', error.message)
    if (error.details === 'RATE_LIMITED') throw new HttpError(429, 'RATE_LIMITED', error.message)
    throw new HttpError(500, 'DB_ERROR', error.message)
  }
  const r = data as { revision: number; duplicate: boolean }
  return {
    gameId: game.id,
    revision: r.revision,
    duplicate: r.duplicate,
    ...(popHistory && label ? { undone: label } : {}),
  }
}

const SAFE_ID = /^[0-9a-zA-Z-]{8,64}$/

export async function handleGameCommand(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const started = performance.now()
  const incoming = req.headers.get('x-request-id') ?? ''
  const entry: RequestLog = { requestId: SAFE_ID.test(incoming) ? incoming : crypto.randomUUID() }
  const res = await handle(req, entry)
  entry.status = res.status
  entry.ms = Math.round(performance.now() - started)
  if (!res.ok)
    entry.code = (
      (await res
        .clone()
        .json()
        .catch(() => null)) as CommandErrorBody | null
    )?.error.code
  logLine(res.status >= 500 ? 'error' : res.ok ? 'info' : 'warn', entry)
  res.headers.set('x-request-id', entry.requestId)
  return res
}

if (import.meta.main) {
  const port = Number(Deno.env.get('PORT') ?? 0)
  Deno.serve(port ? { port } : {}, handleGameCommand)
}

async function handle(req: Request, entry: RequestLog): Promise<Response> {
  if (req.method !== 'POST') return fail(405, 'METHOD', 'Chỉ nhận POST.')
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const auth = req.headers.get('Authorization') ?? ''
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser(
      auth.replace(/^Bearer\s+/i, ''),
    )
    if (userErr || !userData.user)
      return fail(401, 'AUTH_REQUIRED', 'Phiên đăng nhập không hợp lệ.')

    const body = (await req.json().catch(() => null)) as CommandRequest | null
    // Chỉ định danh: không ghi thân lệnh (vai, mục tiêu, phiếu).
    if (body) {
      entry.scope = String(body.scope).slice(0, 16)
      entry.command = String(body.command?.type).slice(0, 32)
      if (UUID.test(body.commandId ?? '')) entry.commandId = body.commandId
      if (body.scope === 'room' && UUID.test(body.roomId)) entry.roomId = body.roomId
      if (body.scope === 'game' && UUID.test(body.gameId)) entry.gameId = body.gameId
    }
    if (!body || !UUID.test(body.commandId ?? ''))
      return fail(400, 'BAD_REQUEST', 'Thiếu commandId.')
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    })

    if (
      body.scope === 'room' &&
      UUID.test(body.roomId) &&
      ['game.ensure', 'game.replay'].includes(body.command?.type)
    ) {
      return json(200, await roomCommand(db, userData.user.id, body))
    }
    if (
      body.scope === 'game' &&
      UUID.test(body.gameId) &&
      Number.isInteger(body.expectedRevision)
    ) {
      return json(200, await gameCommand(db, userData.user.id, body))
    }
    return fail(400, 'BAD_REQUEST', 'Yêu cầu không hợp lệ.')
  } catch (e) {
    if (e instanceof EngineError) return fail(422, e.code, e.message)
    if (e instanceof HttpError) {
      // Lỗi DB: ghi thông báo để điều tra (không chứa dữ liệu bí mật của ván).
      if (e.status >= 500)
        logLine('error', {
          requestId: entry.requestId,
          code: e.code,
          detail: e.message.slice(0, 200),
        })
      return fail(e.status, e.code, e.message)
    }
    logLine('error', {
      requestId: entry.requestId,
      code: 'INTERNAL',
      detail: e instanceof Error ? e.name : typeof e,
    })
    return fail(500, 'INTERNAL', 'Lỗi máy chủ. Thử lại.')
  }
}
