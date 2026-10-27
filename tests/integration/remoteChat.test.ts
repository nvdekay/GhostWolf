import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anonClient, rpc } from './env'

let host: { db: SupabaseClient; uid: string }
let player: { db: SupabaseClient; uid: string }
let outsider: { db: SupabaseClient; uid: string }
let room: { id: string; code: string }
let memberId: string

beforeAll(async () => {
  host = await anonClient()
  player = await anonClient()
  outsider = await anonClient()
  const created = await rpc<{ id: string; code: string }>(host.db, 'create_room', {
    p_name: 'Remote room',
    p_options: { mode: 'remote', discussionSeconds: 120 },
  })
  room = created.data
  const joined = await rpc<{ id: string }>(player.db, 'join_room', {
    p_code: room.code,
    p_name: 'Remote player',
  })
  memberId = joined.data.id
})

describe('remote ready và chat', () => {
  it('chuẩn hóa settings và chỉ thành viên remote được ready', async () => {
    const options = (await host.db.from('rooms').select('options').eq('id', room.id).single()).data!
      .options
    expect(options).toMatchObject({
      mode: 'remote',
      discussionSeconds: 120,
      nightActionSeconds: 45,
      voteSeconds: 60,
      allowVoteChange: true,
    })
    expect(
      (await rpc(player.db, 'player_set_ready', { p_room: room.id, p_ready: true })).error,
    ).toBeNull()
    const member = await host.db.from('room_members').select('ready').eq('id', memberId).single()
    expect(member.data!.ready).toBe(true)

    const local = await rpc<{ id: string; code: string }>(host.db, 'create_room', {
      p_name: 'Local room',
      p_options: {},
    })
    const localPlayer = await anonClient()
    await rpc(localPlayer.db, 'join_room', { p_code: local.data.code, p_name: 'Local' })
    expect(
      (await rpc(localPlayer.db, 'player_set_ready', { p_room: local.data.id, p_ready: true }))
        .error?.code,
    ).toBe('LOCAL_ROOM')
  })

  it('chat retry idempotent và người ngoài không đọc được', async () => {
    const messageId = randomUUID()
    const args = {
      p_room: room.id,
      p_game: null,
      p_channel: 'lobby',
      p_client_message_id: messageId,
      p_body: 'Xin chào phòng',
      p_reply_to: null,
    }
    expect((await rpc(player.db, 'send_chat_message', args)).error).toBeNull()
    expect((await rpc(player.db, 'send_chat_message', args)).error).toBeNull()
    const own = await player.db.from('chat_messages').select('*').eq('room_id', room.id)
    expect(own.data).toHaveLength(1)
    expect(own.data![0]!.sender_member_id).toBe(memberId)
    const leaked = await outsider.db.from('chat_messages').select('*').eq('room_id', room.id)
    expect(leaked.data).toEqual([])
  })

  it('rate limit và moderation chạy ở server', async () => {
    for (let i = 0; i < 4; i++) {
      const sent = await rpc(player.db, 'send_chat_message', {
        p_room: room.id,
        p_game: null,
        p_channel: 'lobby',
        p_client_message_id: randomUUID(),
        p_body: `Tin ${i}`,
        p_reply_to: null,
      })
      expect(sent.error).toBeNull()
    }
    const limited = await rpc(player.db, 'send_chat_message', {
      p_room: room.id,
      p_game: null,
      p_channel: 'lobby',
      p_client_message_id: randomUUID(),
      p_body: 'Quá nhanh',
      p_reply_to: null,
    })
    expect(limited.error?.code).toBe('RATE_LIMITED')

    const message = (
      await host.db
        .from('chat_messages')
        .select('id')
        .eq('room_id', room.id)
        .order('created_at')
        .limit(1)
        .single()
    ).data!
    expect(
      (await rpc(host.db, 'host_delete_chat', { p_message: message.id, p_reason: 'test' })).error,
    ).toBeNull()
    const deleted = await player.db
      .from('chat_messages')
      .select('body,deleted_at')
      .eq('id', message.id)
      .single()
    expect(deleted.data!.body).toBe('')
    expect(deleted.data!.deleted_at).toBeTruthy()
    const audit = await host.db.from('moderation_events').select('kind').eq('room_id', room.id)
    expect(audit.data).toEqual([{ kind: 'delete_message' }])
  })
})
