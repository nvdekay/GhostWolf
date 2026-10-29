import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { anonClient, command, rpc, serviceClient } from './env'

interface Totals {
  roomsCreated: number
  remoteRoomsCreated: number
  membersJoined: number
  gamesStarted: number
  gamesEnded: number
}
interface Overview {
  totals: Totals
  now: { openRooms: number; playingGames: number }
  series: { day: string }[]
  remote: { funnel_24h: unknown }
}
interface Detail {
  room: { id: string; status: string; mode: string }
  members: { id: string; name: string; status: string; mutedUntil: string | null }[]
  games: { id: string; status: string; phase: string | null; players: number; alive: number }[]
  events: { source: string; kind: string; reason: string }[]
}

const admin = serviceClient()
const overview = async () => (await rpc<Overview>(admin, 'admin_overview', { p_days: 7 })).data

let host: { db: SupabaseClient; uid: string }
let player: { db: SupabaseClient; uid: string }
let room: { id: string; code: string }
let memberId: string

beforeAll(async () => {
  host = await anonClient()
  player = await anonClient()
})

describe('admin console', () => {
  it('chỉ service role gọi được các hàm admin_*', async () => {
    const calls: [string, Record<string, unknown>][] = [
      ['admin_overview', { p_days: 7 }],
      ['admin_list_rooms', {}],
      ['admin_room_detail', { p_room: randomUUID() }],
      ['admin_list_chat', {}],
      ['admin_list_audit', {}],
      ['admin_system_status', {}],
      ['admin_close_room', { p_room: randomUUID() }],
      ['admin_kick_member', { p_member: randomUUID() }],
      ['admin_mute_member', { p_member: randomUUID(), p_until: null }],
      ['admin_delete_chat', { p_message: randomUUID() }],
      ['admin_run_cleanup', {}],
    ]
    for (const [fn, args] of calls) {
      const { error } = await host.db.rpc(fn, args)
      expect(error, fn).not.toBeNull()
    }
    const { error } = await host.db.from('admin_actions').select('*')
    expect(error).not.toBeNull()
  })

  it('đếm phòng, thành viên và ván theo ngày, mỗi ván chỉ một lần', async () => {
    const before = await overview()
    const created = await rpc<{ id: string; code: string }>(host.db, 'create_room', {
      p_name: 'Admin stats',
      p_options: { mode: 'remote' },
    })
    room = created.data
    // Phòng remote: mọi người tự vào bằng máy riêng và phải sẵn sàng trước khi chốt phòng.
    for (const [index, actor] of [
      player,
      ...(await Promise.all([1, 2, 3].map(anonClient))),
    ].entries()) {
      const joined = await rpc<{ id: string }>(actor.db, 'join_room', {
        p_code: room.code,
        p_name: `Người chơi ${index + 1}`,
      })
      if (index === 0) memberId = joined.data.id
      await rpc(actor.db, 'player_set_ready', { p_room: room.id, p_ready: true })
    }
    const mid = await overview()
    expect(mid.totals.roomsCreated - before.totals.roomsCreated).toBe(1)
    expect(mid.totals.remoteRoomsCreated - before.totals.remoteRoomsCreated).toBe(1)
    expect(mid.totals.membersJoined - before.totals.membersJoined).toBe(4)
    expect(mid.series).toHaveLength(7)
    expect(mid.remote.funnel_24h).toBeDefined()

    await rpc(host.db, 'host_lock', { p_room: room.id })
    const gameId = (
      await command(host.db, { scope: 'room', roomId: room.id, command: { type: 'game.ensure' } })
    ).data!.gameId
    let revision = 0
    for (const cmd of [
      { type: 'deck.set', counts: { wolf: 1, villager: 3 } },
      { type: 'deal' },
      { type: 'send' },
      { type: 'start' },
    ]) {
      const r = await command(host.db, {
        scope: 'game',
        gameId,
        expectedRevision: revision,
        command: cmd as never,
      })
      expect(r.error).toBeUndefined()
      revision = r.data!.revision
    }
    // Hoàn tác về trước khi bắt đầu rồi bắt đầu lại: vẫn chỉ một ván.
    await admin.from('games').update({ status: 'sent' }).eq('id', gameId)
    await admin.from('games').update({ status: 'playing' }).eq('id', gameId)
    const after = await overview()
    expect(after.totals.gamesStarted - before.totals.gamesStarted).toBe(1)
    expect(after.now.playingGames).toBeGreaterThanOrEqual(1)
  })

  it('danh sách và chi tiết phòng không lộ bí mật ván', async () => {
    const list = await rpc<{ items: { id: string; game: { status: string } | null }[] }>(
      admin,
      'admin_list_rooms',
      { p_status: 'active', p_q: room.code },
    )
    expect(list.error).toBeNull()
    expect(list.data.items.map((r) => r.id)).toEqual([room.id])
    expect(list.data.items[0]!.game?.status).toBe('playing')

    const { data, error } = await rpc<Detail>(admin, 'admin_room_detail', { p_room: room.id })
    expect(error).toBeNull()
    expect(data.room.mode).toBe('remote')
    expect(data.members).toHaveLength(4)
    expect(data.games[0]).toMatchObject({ status: 'playing', phase: 'night', players: 4, alive: 4 })
    expect(JSON.stringify(data)).not.toMatch(/roleId|"role"|wolf|villager|targets/)
    expect((await rpc(admin, 'admin_list_rooms', { p_status: 'bogus' })).error?.code).toBe(
      'BAD_ARGS',
    )
  })

  it('kiểm duyệt chat: chỉ kênh công khai, xóa tin và tắt chat có ghi nhật ký', async () => {
    const sent = await rpc<{ id: string }>(player.db, 'send_chat_message', {
      p_room: room.id,
      p_game: null,
      p_channel: 'lobby',
      p_client_message_id: randomUUID(),
      p_body: 'Tin cần xóa',
      p_reply_to: null,
    })
    expect(sent.error).toBeNull()
    const chat = await rpc<{ items: { id: string; body: string; senderName: string }[] }>(
      admin,
      'admin_list_chat',
      { p_room: room.id },
    )
    expect(chat.data.items[0]).toMatchObject({ id: sent.data.id, body: 'Tin cần xóa' })

    expect(
      (await rpc(admin, 'admin_delete_chat', { p_message: sent.data.id, p_reason: 'spam' })).error,
    ).toBeNull()
    const row = await admin.from('chat_messages').select('body,deleted_at').eq('id', sent.data.id)
    expect(row.data![0]).toMatchObject({ body: '' })
    expect(row.data![0]!.deleted_at).not.toBeNull()
    expect((await rpc(admin, 'admin_delete_chat', { p_message: sent.data.id })).error?.code).toBe(
      'ALREADY_DELETED',
    )

    const until = new Date(Date.now() + 10 * 60_000).toISOString()
    expect(
      (await rpc(admin, 'admin_mute_member', { p_member: memberId, p_until: until, p_reason: 'x' }))
        .error,
    ).toBeNull()
    const muted = await rpc(player.db, 'send_chat_message', {
      p_room: room.id,
      p_game: null,
      p_channel: 'lobby',
      p_client_message_id: randomUUID(),
      p_body: 'Bị tắt chat',
      p_reply_to: null,
    })
    expect(muted.error).not.toBeNull()
    expect(
      (await rpc(admin, 'admin_mute_member', { p_member: memberId, p_until: null })).error,
    ).toBeNull()

    const audit = await rpc<{ items: { source: string; kind: string; roomCode: string }[] }>(
      admin,
      'admin_list_audit',
      { p_source: 'admin', p_limit: 3 },
    )
    expect(audit.data.items.map((e) => e.kind)).toEqual([
      'unmute_member',
      'mute_member',
      'delete_message',
    ])
    expect(audit.data.items[0]!.roomCode).toBe(room.code)
  })

  it('mời người chơi ra và đóng phòng giống thao tác của quản trò', async () => {
    expect(
      (await rpc(admin, 'admin_kick_member', { p_member: memberId, p_reason: 'quấy rối' })).error,
    ).toBeNull()
    expect((await rpc(admin, 'admin_kick_member', { p_member: memberId })).error?.code).toBe(
      'NOT_ACTIVE',
    )
    const kicked = await rpc(player.db, 'join_room', { p_code: room.code, p_name: 'Quay lại' })
    expect(kicked.error).not.toBeNull()

    expect(
      (await rpc(admin, 'admin_close_room', { p_room: room.id, p_reason: 'vi phạm' })).error,
    ).toBeNull()
    expect((await rpc(admin, 'admin_close_room', { p_room: room.id })).error?.code).toBe(
      'ROOM_CLOSED',
    )
    const { data } = await rpc<Detail>(admin, 'admin_room_detail', { p_room: room.id })
    expect(data.room.status).toBe('closed')
    expect(data.members.filter((m) => m.status === 'active')).toEqual([])
    expect(data.events.filter((e) => e.source === 'admin').map((e) => e.kind)).toEqual(
      expect.arrayContaining(['close_room', 'kick_member', 'delete_message']),
    )
    // Quản trò không còn thấy phòng như đang mở.
    const hostView = await host.db.from('rooms').select('status').eq('id', room.id).single()
    expect(hostView.data?.status).toBe('closed')
  })

  it('bảo trì: chạy dọn dẹp tay được ghi lại cùng trạng thái cron', async () => {
    const run = await rpc<Record<string, number>>(admin, 'admin_run_cleanup', {})
    expect(run.error).toBeNull()
    const status = await rpc<{
      cron: { scheduled: boolean }
      lastManualCleanup: { result: { deleted: unknown } }
      tables: Record<string, number>
    }>(admin, 'admin_system_status', {})
    expect(status.error).toBeNull()
    expect(status.data.cron.scheduled).toBe(true)
    expect(status.data.lastManualCleanup.result.deleted).toEqual(run.data)
    expect(status.data.tables.rooms).toBeGreaterThan(0)
  })
})
