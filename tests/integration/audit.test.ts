// Regression cho các lỗi tìm thấy trong audit (RT-01, SEC-01, SEC-02, …).
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { anonClient, command, rpc, serviceClient } from './env'

type Client = { db: SupabaseClient; uid: string }

/** Phòng đã chốt với 4 người không có điện thoại. */
async function lockedRoom(host: Client, name = 'Audit') {
  const { data: room } = await rpc<{ id: string; code: string }>(host.db, 'create_room', {
    p_name: name,
    p_options: {},
  })
  for (const n of ['A', 'B', 'C', 'D'])
    await rpc(host.db, 'host_add_member', { p_room: room.id, p_name: n })
  expect((await rpc(host.db, 'host_lock', { p_room: room.id })).error).toBeNull()
  return room
}

async function liveGames(host: Client, roomId: string) {
  const { data: games } = await host.db
    .from('games')
    .select('id,status')
    .eq('room_id', roomId)
    .neq('status', 'ended')
  const { data: room } = await host.db
    .from('rooms')
    .select('current_game_id')
    .eq('id', roomId)
    .single()
  return { games: games!, current: room!.current_game_id as string }
}

describe('RT-01: tạo ván đồng thời chỉ sinh một ván hiện hành', () => {
  it('nhiều game.ensure cùng lúc trả về cùng một ván', async () => {
    const host = await anonClient()
    const room = await lockedRoom(host)
    const rs = await Promise.all(
      Array.from({ length: 8 }, () =>
        command(host.db, { scope: 'room', roomId: room.id, command: { type: 'game.ensure' } }),
      ),
    )
    rs.forEach((r) => expect(r.status).toBe(200))
    expect(new Set(rs.map((r) => r.data!.gameId)).size).toBe(1)
    const { games, current } = await liveGames(host, room.id)
    expect(games.map((g) => g.id)).toEqual([current])
  })

  it('nhiều game.replay cùng lúc sau khi ván kết thúc chỉ tạo một ván mới', async () => {
    // Race không xảy ra mọi lần: lặp vài vòng để test ổn định khi chưa sửa.
    for (let round = 0; round < 4; round++) {
      const host = await anonClient()
      const room = await lockedRoom(host)
      const gameId = (
        await command(host.db, { scope: 'room', roomId: room.id, command: { type: 'game.ensure' } })
      ).data!.gameId
      let revision = 0
      for (const cmd of [
        { type: 'deck.set', counts: { wolf: 1, villager: 3 } },
        { type: 'deal' },
        { type: 'send' },
        { type: 'start' },
        { type: 'finish', team: 'none' },
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
      const rs = await Promise.all(
        Array.from({ length: 8 }, () =>
          command(host.db, { scope: 'room', roomId: room.id, command: { type: 'game.replay' } }),
        ),
      )
      const created = rs.filter((r) => r.status === 200).map((r) => r.data!.gameId)
      expect(created.length).toBeGreaterThan(0)
      expect(new Set(created).size).toBe(1)
      const { games, current } = await liveGames(host, room.id)
      expect(games.map((g) => g.id)).toEqual([current])
      expect(current).toBe(created[0])
    }
  }, 60_000)
})

describe('SEC-02: người bị mời ra không tự vào lại được', () => {
  it('cùng JWT, phòng vẫn mở → bị từ chối; người tự rời vẫn vào lại được', async () => {
    const host = await anonClient()
    const kicked = await anonClient()
    const leaver = await anonClient()
    const { data: room } = await rpc<{ id: string; code: string }>(host.db, 'create_room', {
      p_name: 'Kick',
      p_options: {},
    })
    const { data: m } = await rpc<{ id: string }>(kicked.db, 'join_room', {
      p_code: room.code,
      p_name: 'Bị mời ra',
    })
    expect((await rpc(host.db, 'host_kick', { p_member: m.id })).error).toBeNull()
    const again = await rpc(kicked.db, 'join_room', { p_code: room.code, p_name: 'Tên mới' })
    expect(again.error?.code).toBe('KICKED')
    const { data: members } = await host.db
      .from('room_members')
      .select('id')
      .eq('room_id', room.id)
      .eq('status', 'active')
    expect(members).toEqual([])

    await rpc(leaver.db, 'join_room', { p_code: room.code, p_name: 'Tự rời' })
    expect((await rpc(leaver.db, 'leave_room', { p_room: room.id })).error).toBeNull()
    expect(
      (await rpc(leaver.db, 'join_room', { p_code: room.code, p_name: 'Tự rời' })).error,
    ).toBeNull()
  })
})

describe('SEC-01: Edge Function từ chối số lượng phi lý trước khi vào engine', () => {
  it('deck.set / vote.tally với số cực lớn, số âm → 400, ván không đổi', async () => {
    const host = await anonClient()
    const room = await lockedRoom(host)
    const gameId = (
      await command(host.db, { scope: 'room', roomId: room.id, command: { type: 'game.ensure' } })
    ).data!.gameId
    for (const c of [Number.MAX_SAFE_INTEGER, 1e9, -1, 31]) {
      const r = await command(host.db, {
        scope: 'game',
        gameId,
        expectedRevision: 0,
        command: { type: 'deck.set', counts: { villager: c } } as never,
      })
      expect(r.status).toBe(400)
      expect(r.error?.code).toBe('BAD_COMMAND')
    }
    const r = await command(host.db, {
      scope: 'game',
      gameId,
      expectedRevision: 0,
      command: { type: 'vote.tally', votes: { x: Number.MAX_SAFE_INTEGER } } as never,
    })
    expect(r.status).toBe(400)
    const { data } = await host.db.from('games').select('revision').eq('id', gameId).single()
    expect(data!.revision).toBe(0)
  })
})

describe('DB-01: ràng buộc toàn vẹn (kể cả khi ghi bằng service role)', () => {
  it('current_game_id phải thuộc chính phòng; vai chỉ gán cho thành viên cùng phòng', async () => {
    const svc = serviceClient()
    const a = await anonClient()
    const b = await anonClient()
    const roomA = await lockedRoom(a, 'A')
    const roomB = await lockedRoom(b, 'B')
    const gameB = (
      await command(b.db, { scope: 'room', roomId: roomB.id, command: { type: 'game.ensure' } })
    ).data!.gameId
    const bad = await svc.from('rooms').update({ current_game_id: gameB }).eq('id', roomA.id)
    expect(bad.error?.details).toBe('BAD_CURRENT_GAME')

    const { data: memberA } = await svc
      .from('room_members')
      .select('id')
      .eq('room_id', roomA.id)
      .limit(1)
      .single()
    const ins = await svc
      .from('assignments')
      .insert({ game_id: gameB, member_id: memberA!.id, role_id: 'villager', role: {} })
    expect(ins.error?.details).toBe('BAD_ASSIGNMENT')
  })

  it('seat, number, revision phải hợp lệ', async () => {
    const svc = serviceClient()
    const host = await anonClient()
    const room = await lockedRoom(host)
    const gid = (
      await command(host.db, { scope: 'room', roomId: room.id, command: { type: 'game.ensure' } })
    ).data!.gameId
    const seat = await svc.from('room_members').update({ seat: 0 }).eq('room_id', room.id)
    expect(seat.error?.code).toBe('23514')
    expect((await svc.from('games').update({ number: 0 }).eq('id', gid)).error?.code).toBe('23514')
    expect((await svc.from('games').update({ revision: -1 }).eq('id', gid)).error?.code).toBe(
      '23514',
    )
  })
})

describe('OPS-01: giới hạn nghiệp vụ và dọn dữ liệu', () => {
  it('phòng tối đa 30 người (thêm tay và tự vào)', async () => {
    const host = await anonClient()
    const { data: room } = await rpc<{ id: string; code: string }>(host.db, 'create_room', {
      p_name: 'Đông',
      p_options: {},
    })
    for (let i = 0; i < 30; i++)
      expect(
        (await rpc(host.db, 'host_add_member', { p_room: room.id, p_name: 'P' + i })).error,
      ).toBeNull()
    expect(
      (await rpc(host.db, 'host_add_member', { p_room: room.id, p_name: 'P30' })).error?.code,
    ).toBe('ROOM_FULL')
    const late = await anonClient()
    expect(
      (await rpc(late.db, 'join_room', { p_code: room.code, p_name: 'Muộn' })).error?.code,
    ).toBe('ROOM_FULL')
  })

  it('mỗi quản trò tối đa 10 phòng chưa đóng', async () => {
    const host = await anonClient()
    const ids: string[] = []
    for (let i = 0; i < 10; i++) {
      const { data, error } = await rpc<{ id: string }>(host.db, 'create_room', {
        p_name: 'R' + i,
        p_options: {},
      })
      expect(error).toBeNull()
      ids.push(data.id)
    }
    const over = await rpc(host.db, 'create_room', { p_name: 'R10', p_options: {} })
    expect(over.error?.code).toBe('TOO_MANY_ROOMS')
    await rpc(host.db, 'host_close', { p_room: ids[0] })
    expect((await rpc(host.db, 'create_room', { p_name: 'R10', p_options: {} })).error).toBeNull()
  })

  it('giới hạn tần suất lệnh trên một ván → 429', async () => {
    const host = await anonClient()
    const room = await lockedRoom(host)
    const gameId = (
      await command(host.db, { scope: 'room', roomId: room.id, command: { type: 'game.ensure' } })
    ).data!.gameId
    let revision = 0
    let limited = 0
    for (let i = 0; i < 70; i++) {
      const r = await command(host.db, {
        scope: 'game',
        gameId,
        expectedRevision: revision,
        command: { type: 'deck.set', counts: { wolf: 1, villager: 3 } },
      })
      if (r.status === 429) {
        expect(r.error?.code).toBe('RATE_LIMITED')
        limited++
      } else revision = r.data!.revision
    }
    expect(revision).toBe(60)
    expect(limited).toBe(10)
  }, 60_000)

  it('gw_cleanup chỉ xóa phòng đã đóng lâu; client không gọi được', async () => {
    const svc = serviceClient()
    const host = await anonClient()
    const old = await lockedRoom(host, 'Cũ')
    const active = await lockedRoom(host, 'Đang chơi')
    await rpc(host.db, 'host_close', { p_room: old.id })
    await svc
      .from('rooms')
      .update({ closed_at: new Date(Date.now() - 40 * 864e5).toISOString() })
      .eq('id', old.id)
    expect((await rpc(host.db, 'gw_cleanup', {})).error).not.toBeNull()
    const { data, error } = await rpc<{ rooms: number }>(svc, 'gw_cleanup', {})
    expect(error).toBeNull()
    expect(data.rooms).toBeGreaterThanOrEqual(1)
    expect((await svc.from('rooms').select('id').eq('id', old.id)).data).toEqual([])
    expect((await svc.from('rooms').select('id').eq('id', active.id)).data).toHaveLength(1)
  })
})

describe('RT-03: kênh presence private', () => {
  const subscribe = async (c: Client, roomId: string) => {
    const token = (await c.db.auth.getSession()).data.session!.access_token
    await c.db.realtime.setAuth(token)
    return new Promise<string>((res) => {
      const ch = c.db.channel(`room:${roomId}`, {
        config: { private: true, presence: { key: 'host' } },
      })
      ch.subscribe((s) => {
        if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
          void c.db.removeChannel(ch)
          res(s)
        }
      })
    })
  }

  it('người ngoài phòng bị từ chối; thành viên vào được', async () => {
    const host = await anonClient()
    const member = await anonClient()
    const outsider = await anonClient()
    const { data: room } = await rpc<{ id: string; code: string }>(host.db, 'create_room', {
      p_name: 'Presence',
      p_options: {},
    })
    await rpc(member.db, 'join_room', { p_code: room.code, p_name: 'M' })
    expect(await subscribe(outsider, room.id)).toBe('CHANNEL_ERROR')
    expect(await subscribe(member, room.id)).toBe('SUBSCRIBED')
  })
})
