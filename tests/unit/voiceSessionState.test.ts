import { describe, expect, it } from 'vitest'
import {
  removeVoiceSession,
  shouldInitiateVoicePeer,
  upsertVoiceSession,
  voiceSessionInScope,
  type VoiceSessionScope,
} from '@/features/remote/voiceSessionState'
import type { VoiceSessionRow } from '@/services/types'

const scope: VoiceSessionScope = { roomId: 'room-1', channel: 'lobby' }

function session(overrides: Partial<VoiceSessionRow> = {}): VoiceSessionRow {
  return {
    session_id: 'session-1',
    room_id: 'room-1',
    game_id: null,
    channel: 'lobby',
    user_id: 'user-1',
    member_id: 'member-1',
    display_name: 'An',
    can_speak: true,
    mic_enabled: false,
    joined_at: '2026-11-06T00:00:00.000Z',
    last_seen: '2026-11-06T00:00:00.000Z',
    ...overrides,
  }
}

describe('voice session state', () => {
  it('chỉ nhận session đúng room, game và channel', () => {
    expect(voiceSessionInScope(session(), scope)).toBe(true)
    expect(voiceSessionInScope(session({ room_id: 'room-2' }), scope)).toBe(false)
    expect(voiceSessionInScope(session({ channel: 'public' }), scope)).toBe(false)
    expect(
      voiceSessionInScope(session({ game_id: 'game-1', channel: 'public' }), {
        roomId: 'room-1',
        gameId: 'game-1',
        channel: 'public',
      }),
    ).toBe(true)
  })

  it('thêm incremental và giữ thứ tự join ổn định', () => {
    const later = session({
      session_id: 'session-2',
      joined_at: '2026-11-06T00:00:01.000Z',
    })
    const earlier = session()
    expect(upsertVoiceSession([later], earlier, scope).map((row) => row.session_id)).toEqual([
      'session-1',
      'session-2',
    ])
  })

  it('cập nhật mic mà không nhân đôi session', () => {
    const current = [session()]
    const next = upsertVoiceSession(current, session({ mic_enabled: true }), scope)
    expect(next).toHaveLength(1)
    expect(next[0]!.mic_enabled).toBe(true)
    expect(current[0]!.mic_enabled).toBe(false)
  })

  it('bỏ qua row ngoài scope và xóa theo session id', () => {
    const current = [session()]
    expect(upsertVoiceSession(current, session({ room_id: 'room-2' }), scope)).toBe(current)
    expect(removeVoiceSession(current, 'session-1')).toEqual([])
    expect(removeVoiceSession(current, 'missing')).toEqual(current)
  })

  it('chỉ một phía chủ động tạo offer khi join đồng thời', () => {
    expect(shouldInitiateVoicePeer('session-1', 'session-2')).toBe(true)
    expect(shouldInitiateVoicePeer('session-2', 'session-1')).toBe(false)
    expect(shouldInitiateVoicePeer('session-1', 'session-1')).toBe(false)
  })
})
