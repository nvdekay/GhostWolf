import type { PlayerCommand, PlayerCommandRequest } from '@shared/remote.ts'
import { sameHostUrl, supabase } from '@/lib/supabase'
import { uuid } from '@/lib/uuid'
import { AppError, networkError } from './errors'

const sessionId = (() => {
  try {
    const current = sessionStorage.getItem('gw.remote.session')
    if (current) return current
    const next = uuid()
    sessionStorage.setItem('gw.remote.session', next)
    return next
  } catch {
    return uuid()
  }
})()

export async function sendPlayerCommand(
  roomId: string,
  gameId: string | undefined,
  command: PlayerCommand,
  commandId = uuid(),
) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new AppError('AUTH_REQUIRED', 'Phiên đăng nhập đã hết. Tải lại trang.')
  const base = sameHostUrl(
    import.meta.env.VITE_FUNCTIONS_URL || `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`,
  )
  const body: PlayerCommandRequest = { roomId, gameId, commandId, sessionId, command }
  let response: Response
  try {
    response = await fetch(`${base}/player-command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw networkError()
  }
  const json = (await response.json().catch(() => ({}))) as {
    data?: unknown
    error?: { code: string; message: string }
  }
  if (!response.ok)
    throw new AppError(
      json.error?.code ?? `HTTP_${response.status}`,
      json.error?.message ?? 'Lệnh không thành công.',
      response.status,
    )
  return json.data
}
