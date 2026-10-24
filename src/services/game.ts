/*
 * Gửi lệnh ván tới Edge Function `game-command`.
 * - Mỗi ván có một hàng đợi: lệnh chạy tuần tự với revision mới nhất (không tự ghi đè nhau).
 * - commandId sinh một lần cho mỗi thao tác; retry khi lỗi mạng dùng lại id → server không xử lý trùng.
 */
import type { CommandRequest, CommandResponse, GameCommand, RoomCommand } from '@shared/commands.ts'
import { supabase } from '@/lib/supabase'
import { uuid } from '@/lib/uuid'
import { AppError, networkError } from './errors'

const known = new Map<string, number>()
const chains = new Map<string, Promise<unknown>>()

/** Store realtime báo revision mới nhất đã thấy. */
export function noteRevision(gameId: string, revision: number) {
  if ((known.get(gameId) ?? -1) < revision) known.set(gameId, revision)
}

async function post(body: CommandRequest): Promise<CommandResponse> {
  const { data: s } = await supabase.auth.getSession()
  const token = s.session?.access_token
  if (!token) throw new AppError('AUTH_REQUIRED', 'Phiên đăng nhập đã hết. Tải lại trang.')
  const base =
    import.meta.env.VITE_FUNCTIONS_URL || `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  const url = `${base}/game-command`
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
    } catch {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
        continue
      }
      throw networkError()
    }
    const json = (await res.json().catch(() => ({}))) as CommandResponse & {
      error?: { code: string; message: string }
    }
    if (!res.ok)
      throw new AppError(
        json.error?.code ?? 'HTTP_' + res.status,
        json.error?.message ?? 'Lệnh không thành công.',
        res.status,
      )
    return json
  }
}

export function sendGameCommand(gameId: string, command: GameCommand): Promise<CommandResponse> {
  const commandId = uuid()
  const run = async () => {
    const res = await post({
      scope: 'game',
      gameId,
      commandId,
      expectedRevision: known.get(gameId) ?? 0,
      command,
    })
    noteRevision(gameId, res.revision)
    return res
  }
  const prev = chains.get(gameId) ?? Promise.resolve()
  const next = prev.then(run, run)
  chains.set(
    gameId,
    next.catch(() => {}),
  )
  return next
}

export async function sendRoomCommand(
  roomId: string,
  command: RoomCommand,
): Promise<CommandResponse> {
  const res = await post({ scope: 'room', roomId, commandId: uuid(), command })
  noteRevision(res.gameId, res.revision)
  return res
}
