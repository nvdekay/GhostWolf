import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anonClient, rpc } from './env'

interface Actor {
  db: SupabaseClient
  uid: string
}

let host: Actor
let player: Actor
let listener: Actor
let outsider: Actor
let room: { id: string; code: string }
let playerMember: string

beforeAll(async () => {
  host = await anonClient()
  player = await anonClient()
  listener = await anonClient()
  outsider = await anonClient()
  room = (
    await rpc<{ id: string; code: string }>(host.db, 'create_room', {
      p_name: 'Voice lobby',
      p_options: { mode: 'remote' },
    })
  ).data
  playerMember = (
    await rpc<{ id: string }>(player.db, 'join_room', {
      p_code: room.code,
      p_name: 'Người nói',
    })
  ).data.id
  await rpc(listener.db, 'join_room', { p_code: room.code, p_name: 'Người nghe' })
})

describe('voice signaling và RLS', () => {
  it('chỉ participant đọc session và chỉ target đọc signaling', async () => {
    const hostSession = randomUUID()
    const playerSession = randomUUID()
    expect(
      (
        await rpc(host.db, 'join_voice', {
          p_room: room.id,
          p_game: null,
          p_channel: 'lobby',
          p_session: hostSession,
          p_mic_enabled: false,
        })
      ).error,
    ).toBeNull()
    expect(
      (
        await rpc(player.db, 'join_voice', {
          p_room: room.id,
          p_game: null,
          p_channel: 'lobby',
          p_session: playerSession,
          p_mic_enabled: false,
        })
      ).error,
    ).toBeNull()

    const visible = await player.db.from('voice_sessions').select('session_id,display_name')
    expect(visible.data).toHaveLength(2)
    expect(visible.data).toEqual(
      expect.arrayContaining([
        { session_id: hostSession, display_name: 'Quản trò' },
        { session_id: playerSession, display_name: 'Người nói' },
      ]),
    )
    expect((await outsider.db.from('voice_sessions').select('*')).data).toEqual([])
    expect(
      (
        await outsider.db.from('voice_sessions').insert({
          session_id: randomUUID(),
          room_id: room.id,
          channel: 'lobby',
          user_id: outsider.uid,
          display_name: 'Giả mạo',
        })
      ).error,
    ).not.toBeNull()

    expect(
      (
        await rpc(player.db, 'send_voice_signal', {
          p_session: playerSession,
          p_target: hostSession,
          p_kind: 'offer',
          p_payload: { type: 'offer', sdp: 'test-sdp' },
        })
      ).error,
    ).toBeNull()
    expect((await host.db.from('voice_signals').select('kind,payload')).data).toEqual([
      { kind: 'offer', payload: { type: 'offer', sdp: 'test-sdp' } },
    ])
    expect((await player.db.from('voice_signals').select('*')).data).toEqual([])
    expect((await outsider.db.from('voice_signals').select('*')).data).toEqual([])

    await host.db.from('voice_signals').delete().eq('target_session', hostSession)
    expect((await host.db.from('voice_signals').select('*')).data).toEqual([])
  })

  it('mute ở server buộc mic tắt nhưng người chơi vẫn nghe được', async () => {
    const session = randomUUID()
    expect(
      (
        await rpc(host.db, 'host_mute_member', {
          p_member: playerMember,
          p_until: new Date(Date.now() + 60_000).toISOString(),
          p_reason: 'voice test',
        })
      ).error,
    ).toBeNull()
    const joined = await rpc<{ can_speak: boolean; mic_enabled: boolean }>(
      player.db,
      'join_voice',
      {
        p_room: room.id,
        p_game: null,
        p_channel: 'lobby',
        p_session: session,
        p_mic_enabled: true,
      },
    )
    expect(joined.error).toBeNull()
    expect(joined.data).toMatchObject({ can_speak: false, mic_enabled: false })
    const heartbeat = await rpc<{ can_speak: boolean; mic_enabled: boolean }>(
      player.db,
      'heartbeat_voice',
      { p_session: session, p_mic_enabled: true },
    )
    expect(heartbeat.data).toMatchObject({ can_speak: false, mic_enabled: false })
    await rpc(host.db, 'host_mute_member', {
      p_member: playerMember,
      p_until: null,
      p_reason: 'voice test done',
    })
  })

  it('người ngoài và phòng local không thể vào voice', async () => {
    expect(
      (
        await rpc(outsider.db, 'join_voice', {
          p_room: room.id,
          p_game: null,
          p_channel: 'lobby',
          p_session: randomUUID(),
          p_mic_enabled: false,
        })
      ).error?.code,
    ).toBe('VOICE_CLOSED')
    const local = await rpc<{ id: string }>(host.db, 'create_room', {
      p_name: 'No voice',
      p_options: { mode: 'local' },
    })
    expect(
      (
        await rpc(host.db, 'join_voice', {
          p_room: local.data.id,
          p_game: null,
          p_channel: 'lobby',
          p_session: randomUUID(),
          p_mic_enabled: false,
        })
      ).error?.code,
    ).toBe('VOICE_CLOSED')
  })
})
