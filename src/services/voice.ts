import { sameHostUrl, supabase } from '@/lib/supabase'
import { FALLBACK_ICE_SERVERS, parseIceServers, type VoiceIcePayload } from '@shared/voice-ice.ts'
import { AppError, fromPostgrest, networkError } from './errors'
import type { VoiceChannel, VoiceSessionRow, VoiceSignalRow } from './types'

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw fromPostgrest(error)
  return data as T
}

export const joinVoice = (
  roomId: string,
  gameId: string | undefined,
  channel: VoiceChannel,
  sessionId: string,
) =>
  rpc<VoiceSessionRow>('join_voice', {
    p_room: roomId,
    p_game: gameId ?? null,
    p_channel: channel,
    p_session: sessionId,
    p_mic_enabled: false,
  })

export const heartbeatVoice = (sessionId: string, micEnabled: boolean) =>
  rpc<VoiceSessionRow>('heartbeat_voice', {
    p_session: sessionId,
    p_mic_enabled: micEnabled,
  })

export const leaveVoice = (sessionId: string) => rpc<void>('leave_voice', { p_session: sessionId })

export const sendVoiceSignal = (
  sessionId: string,
  targetSession: string,
  kind: VoiceSignalRow['kind'],
  payload: Record<string, unknown>,
) =>
  rpc<number>('send_voice_signal', {
    p_session: sessionId,
    p_target: targetSession,
    p_kind: kind,
    p_payload: payload,
  })

export async function loadVoiceSessions(
  roomId: string,
  gameId: string | undefined,
  channel: VoiceChannel,
): Promise<VoiceSessionRow[]> {
  let query = supabase
    .from('voice_sessions')
    .select('*')
    .eq('room_id', roomId)
    .eq('channel', channel)
    .gte('last_seen', new Date(Date.now() - 60_000).toISOString())
    .order('joined_at')
  query = gameId ? query.eq('game_id', gameId) : query.is('game_id', null)
  const { data, error } = await query
  if (error) throw fromPostgrest(error)
  return (data ?? []) as VoiceSessionRow[]
}

export async function loadVoiceSignals(sessionId: string): Promise<VoiceSignalRow[]> {
  const { data, error } = await supabase
    .from('voice_signals')
    .select('*')
    .eq('target_session', sessionId)
    .order('id')
  if (error) throw fromPostgrest(error)
  return (data ?? []) as VoiceSignalRow[]
}

export async function deleteVoiceSignal(id: number, sessionId: string) {
  const { error } = await supabase
    .from('voice_signals')
    .delete()
    .eq('id', id)
    .eq('target_session', sessionId)
  if (error) throw fromPostgrest(error)
}

export function fallbackVoiceIceServers(): RTCIceServer[] {
  return FALLBACK_ICE_SERVERS
}

export async function loadVoiceIceServers(
  roomId: string,
  sessionId: string,
): Promise<VoiceIcePayload> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new AppError('AUTH_REQUIRED', 'Phiên đăng nhập đã hết. Tải lại trang.')
  const base = sameHostUrl(
    import.meta.env.VITE_FUNCTIONS_URL || `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`,
  )
  const abort = new AbortController()
  const timer = window.setTimeout(() => abort.abort(), 5_000)
  let response: Response
  try {
    response = await fetch(`${base}/voice-ice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ roomId, sessionId }),
      signal: abort.signal,
    })
  } catch {
    throw networkError()
  } finally {
    window.clearTimeout(timer)
  }
  const json = (await response.json().catch(() => ({}))) as Partial<VoiceIcePayload> & {
    error?: { code?: string; message?: string }
  }
  if (!response.ok)
    throw new AppError(
      json.error?.code ?? `HTTP_${response.status}`,
      json.error?.message ?? 'Không lấy được cấu hình voice.',
      response.status,
    )
  return {
    iceServers: parseIceServers(json.iceServers),
    expiresAt: typeof json.expiresAt === 'string' ? json.expiresAt : null,
    relay: json.relay === true,
  }
}
