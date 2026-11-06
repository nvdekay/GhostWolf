import type { VoiceChannel, VoiceSessionRow } from '@/services/types'

export interface VoiceSessionScope {
  roomId: string
  gameId?: string
  channel: VoiceChannel
}

export function voiceSessionInScope(row: VoiceSessionRow, scope: VoiceSessionScope) {
  return (
    row.room_id === scope.roomId &&
    row.channel === scope.channel &&
    row.game_id === (scope.gameId ?? null)
  )
}

export function upsertVoiceSession(
  current: VoiceSessionRow[],
  row: VoiceSessionRow,
  scope: VoiceSessionScope,
) {
  if (!voiceSessionInScope(row, scope)) return current
  const index = current.findIndex((item) => item.session_id === row.session_id)
  const next = index < 0 ? [...current, row] : current.map((item, i) => (i === index ? row : item))
  return next.sort(
    (left, right) =>
      left.joined_at.localeCompare(right.joined_at) ||
      left.session_id.localeCompare(right.session_id),
  )
}

export function removeVoiceSession(current: VoiceSessionRow[], sessionId: string) {
  return current.filter((item) => item.session_id !== sessionId)
}

/** One deterministic side creates the first offer, avoiding redundant glare on simultaneous join. */
export function shouldInitiateVoicePeer(localSessionId: string, remoteSessionId: string) {
  return localSessionId < remoteSessionId
}
