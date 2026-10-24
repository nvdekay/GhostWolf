// Edge Function: lệnh của quản trò cho ván. Engine chạy ở đây — backend là nguồn dữ liệu có thẩm quyền.
// Luồng: xác thực JWT → kiểm tra quản trò → nạp trạng thái → engine → commit_game (transaction, revision, idempotency).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  COMMAND_LABELS,
  parseGameCommand,
  type CommandRequest,
  type CommandResponse,
} from '../_shared/commands.ts'
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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } })

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
  options: Record<string, boolean>
  current_game_id: string | null
}

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p
  if (error) throw new HttpError(500, 'DB_ERROR', `${what}: ${error.message}`)
  if (data === null) throw new HttpError(404, 'NOT_FOUND', what)
  return data
}

async function loadRoom(db: SupabaseClient, roomId: string, userId: string): Promise<RoomRow> {
  const room = await must<RoomRow>(
    db.from('rooms').select('id,name,host_id,status,options,current_game_id').eq('id', roomId).maybeSingle(),
    'Không tìm thấy phòng',
  )
  if (room.host_id !== userId) throw new HttpError(403, 'NOT_HOST', 'Chỉ quản trò của phòng mới làm được việc này.')
  if (room.status === 'closed') throw new HttpError(409, 'ROOM_CLOSED', 'Phòng đã đóng.')
  return room
}

async function loadSeats(db: SupabaseClient, roomId: string): Promise<SeatInput[]> {
  const rows = await must<{ id: string; name: string; seat: number; device: boolean }[]>(
    db.from('room_members').select('id,name,seat,device').eq('room_id', roomId).eq('status', 'active').order('seat'),
    'Không đọc được danh sách người chơi',
  )
  return rows
}

async function loadCustomRoles(db: SupabaseClient, ownerId: string): Promise<RoleDef[]> {
  const rows = await must<{ id: string; name: string; team: RoleDef['team']; short: string; wakes: boolean }[]>(
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

async function createGameRow(db: SupabaseClient, roomId: string, state: GameState): Promise<string> {
  const { data, error } = await db.rpc('create_game', { p_room: roomId, p_state: state, p_public: publicView(state) })
  if (error) throw new HttpError(500, 'DB_ERROR', error.message)
  return data as string
}

async function roomCommand(db: SupabaseClient, userId: string, req: Extract<CommandRequest, { scope: 'room' }>) {
  const room = await loadRoom(db, req.roomId, userId)
  const current = room.current_game_id
    ? await must<{ id: string; status: string; revision: number }>(
        db.from('games').select('id,status,revision').eq('id', room.current_game_id).maybeSingle(),
        'Không tìm thấy ván',
      )
    : null

  if (req.command.type === 'game.ensure') {
    if (room.status !== 'locked') throw new HttpError(409, 'ROOM_OPEN', 'Chốt phòng trước khi chọn bộ vai.')
    if (current && current.status !== 'ended') return { gameId: current.id, revision: current.revision, duplicate: true }
    const seats = await loadSeats(db, room.id)
    const state = createGame(room.name, room.options, suggestCounts(seats.length).counts, await loadCustomRoles(db, userId))
    return { gameId: await createGameRow(db, room.id, state), revision: 0, duplicate: false }
  }

  // game.replay: ván mới với cùng nhóm và bộ vai; ván cũ giữ nguyên làm lịch sử.
  if (!current || current.status !== 'ended') throw new HttpError(409, 'NOT_ENDED', 'Ván hiện tại chưa kết thúc.')
  const prev = await must<{ state: GameState }>(
    db.from('game_secrets').select('state').eq('game_id', current.id).maybeSingle(),
    'Không đọc được ván cũ',
  )
  const state = createGame(room.name, room.options, prev.state.counts, await loadCustomRoles(db, userId))
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
  if (room.current_game_id !== game.id) throw new HttpError(409, 'OLD_GAME', 'Ván này đã được thay bằng ván mới.')
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
    if (prev.status !== 'playing') throw new HttpError(409, 'NO_UNDO', 'Chỉ hoàn tác được trong lúc chơi.')
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
    if (needsRoomLocked && room.status !== 'locked') throw new HttpError(409, 'ROOM_OPEN', 'Chốt phòng trước khi chia vai.')
    const base = structuredClone(prev)
    if (command.type === 'deck.set' || command.type === 'deal') base.customRoles = await loadCustomRoles(db, userId)
    const seats = command.type === 'deal' ? await loadSeats(db, room.id) : undefined
    next = applyCommand(base, command, { randomInt: cryptoRandomInt, seats })
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
  })
  if (error) {
    if (error.details === 'REVISION_CONFLICT') throw new HttpError(409, 'REVISION_CONFLICT', error.message)
    throw new HttpError(500, 'DB_ERROR', error.message)
  }
  const r = data as { revision: number; duplicate: boolean }
  return { gameId: game.id, revision: r.revision, duplicate: r.duplicate, ...(popHistory && label ? { undone: label } : {}) }
}

const port = Number(Deno.env.get('PORT') ?? 0)

Deno.serve(port ? { port } : {}, async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail(405, 'METHOD', 'Chỉ nhận POST.')
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const auth = req.headers.get('Authorization') ?? ''
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
    if (userErr || !userData.user) return fail(401, 'AUTH_REQUIRED', 'Phiên đăng nhập không hợp lệ.')

    const body = (await req.json().catch(() => null)) as CommandRequest | null
    if (!body || !UUID.test(body.commandId ?? '')) return fail(400, 'BAD_REQUEST', 'Thiếu commandId.')
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

    if (body.scope === 'room' && UUID.test(body.roomId) && ['game.ensure', 'game.replay'].includes(body.command?.type)) {
      return json(200, await roomCommand(db, userData.user.id, body))
    }
    if (body.scope === 'game' && UUID.test(body.gameId) && Number.isInteger(body.expectedRevision)) {
      return json(200, await gameCommand(db, userData.user.id, body))
    }
    return fail(400, 'BAD_REQUEST', 'Yêu cầu không hợp lệ.')
  } catch (e) {
    if (e instanceof EngineError) return fail(422, e.code, e.message)
    if (e instanceof HttpError) return fail(e.status, e.code, e.message)
    console.error(e)
    return fail(500, 'INTERNAL', 'Lỗi máy chủ. Thử lại.')
  }
})
