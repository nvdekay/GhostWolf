import { supabase } from '@/lib/supabase'
import { fromPostgrest } from './errors'
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

export function voiceIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
  ]
  const urls = (import.meta.env.VITE_TURN_URLS as string | undefined)
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (urls?.length) {
    servers.push({
      urls,
      username: (import.meta.env.VITE_TURN_USERNAME as string | undefined) ?? '',
      credential: (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined) ?? '',
    })
  }
  return servers
}
