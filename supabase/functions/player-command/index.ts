import { createClient } from 'npm:@supabase/supabase-js@2'
import { parsePlayerCommand, type PlayerCommandRequest } from '../_shared/remote.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-request-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-request-id',
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
const fail = (status: number, code: string, message: string) =>
  json(status, { error: { code, message } })

export async function handlePlayerCommand(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail(405, 'METHOD', 'Chỉ nhận POST.')
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID()
  try {
    const auth = req.headers.get('Authorization') ?? ''
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    })
    const { data: userData, error: userError } = await db.auth.getUser(
      auth.replace(/^Bearer\s+/i, ''),
    )
    if (userError || !userData.user)
      return fail(401, 'AUTH_REQUIRED', 'Phiên đăng nhập không hợp lệ.')
    const body = (await req.json().catch(() => null)) as PlayerCommandRequest | null
    const command = parsePlayerCommand(body?.command)
    if (
      !body ||
      !command ||
      !UUID.test(body.roomId ?? '') ||
      !UUID.test(body.commandId ?? '') ||
      !UUID.test(body.sessionId ?? '') ||
      (body.gameId !== undefined && !UUID.test(body.gameId))
    )
      return fail(400, 'BAD_REQUEST', 'Yêu cầu không hợp lệ.')

    const reject = (status: number, code: string, message: string) => {
      console.warn(
        JSON.stringify({
          fn: 'player-command',
          requestId,
          type: command.type,
          roomId: body.roomId,
          gameId: body.gameId,
          status,
          code,
        }),
      )
      return fail(status, code, message)
    }

    const { error: sessionError } = await db.rpc('require_player_session', {
      p_room: body.roomId,
      p_session: body.sessionId,
    })
    if (sessionError)
      return reject(409, sessionError.details || 'DEVICE_REPLACED', sessionError.message)

    let result: unknown
    if (command.type === 'player.ready') {
      const { data, error } = await db.rpc('player_set_ready', {
        p_room: body.roomId,
        p_ready: command.ready,
      })
      if (error)
        return reject(
          error.code === '42501' ? 403 : 409,
          error.details || 'COMMAND_FAILED',
          error.message,
        )
      result = data
    } else if (command.type === 'player.ackRole') {
      if (!body.gameId) return reject(400, 'NO_GAME', 'Thiếu gameId.')
      const { data, error } = await db.rpc('ack_role', { p_game: body.gameId })
      if (error) return reject(409, error.details || 'COMMAND_FAILED', error.message)
      result = data
    } else if (command.type === 'chat.send') {
      const { data, error } = await db.rpc('send_chat_message', {
        p_room: body.roomId,
        p_game: body.gameId ?? null,
        p_channel: command.channel,
        p_client_message_id: body.commandId,
        p_body: command.body,
        p_reply_to: command.replyTo ?? null,
      })
      if (error)
        return reject(
          error.details === 'RATE_LIMITED' ? 429 : 409,
          error.details || 'COMMAND_FAILED',
          error.message,
        )
      result = data
    } else if (command.type === 'action.submit') {
      if (!body.gameId) return reject(400, 'NO_GAME', 'Thiếu gameId.')
      const { data, error } = await db.rpc('submit_remote_action', {
        p_game: body.gameId,
        p_prompt: command.promptId,
        p_phase_sequence: command.phaseSequence,
        p_client_action_id: body.commandId,
        p_payload: command.payload,
      })
      if (error)
        return reject(
          error.details === 'DEADLINE' ? 410 : 409,
          error.details || 'COMMAND_FAILED',
          error.message,
        )
      result = data
    } else if (command.type === 'vote.submit') {
      if (!body.gameId) return reject(400, 'NO_GAME', 'Thiếu gameId.')
      const { data, error } = await db.rpc('submit_remote_vote', {
        p_game: body.gameId,
        p_phase_sequence: command.phaseSequence,
        p_client_action_id: body.commandId,
        p_candidate: command.candidateId,
      })
      if (error)
        return reject(
          error.details === 'DEADLINE' ? 410 : 409,
          error.details || 'COMMAND_FAILED',
          error.message,
        )
      result = data
    } else {
      return reject(409, 'NOT_AVAILABLE', 'Lệnh chưa khả dụng ở phase hiện tại.')
    }
    console.info(
      JSON.stringify({
        fn: 'player-command',
        requestId,
        type: command.type,
        roomId: body.roomId,
        gameId: body.gameId,
        status: 200,
      }),
    )
    const response = json(200, { ok: true, data: result })
    response.headers.set('x-request-id', requestId)
    return response
  } catch (error) {
    console.error(
      JSON.stringify({
        fn: 'player-command',
        requestId,
        status: 500,
        detail: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
      }),
    )
    return fail(500, 'INTERNAL', 'Máy chủ không xử lý được lệnh.')
  }
}

if (import.meta.main) {
  const port = Number(Deno.env.get('PORT') ?? 0)
  Deno.serve(port ? { port } : {}, handlePlayerCommand)
}
