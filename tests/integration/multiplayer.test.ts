import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import type { GameState } from '@engine'
import { anonClient, command, rpc } from './env'

type Client = { db: SupabaseClient; uid: string }

let host: Client
let players: Client[]
let roomId: string
let code: string
let gameId: string
let revision = 0
const memberIds: string[] = []

const game = (cmd: Record<string, unknown>, extra: { commandId?: string; expectedRevision?: number } = {}) =>
  command(host.db, {
    scope: 'game',
    gameId,
    expectedRevision: extra.expectedRevision ?? revision,
    command: cmd as never,
    commandId: extra.commandId,
  }).then((r) => {
    if (r.data) revision = r.data.revision
    return r
  })

beforeAll(async () => {
  host = await anonClient()
  players = await Promise.all(Array.from({ length: 5 }, () => anonClient()))
})

describe('phòng và lobby', () => {
  it('quản trò tạo phòng với mã 6 ký tự', async () => {
    const { data, error } = await rpc<{ id: string; code: string; status: string }>(host.db, 'create_room', {
      p_name: 'Ván kiểm thử',
      p_options: { chief: true },
    })
    expect(error).toBeNull()
    expect(data.code).toMatch(/^[A-Z0-9]{6}$/)
    roomId = data.id
    code = data.code
  })

  it('người chơi vào phòng; báo lỗi mã sai, tên rỗng, tên trùng', async () => {
    expect((await rpc(players[0]!.db, 'join_room', { p_code: 'ZZZZZZ', p_name: 'A' })).error?.code).toBe('ROOM_NOT_FOUND')
    expect((await rpc(players[0]!.db, 'join_room', { p_code: code, p_name: '   ' })).error?.code).toBe('NAME_REQUIRED')
    for (const [i, p] of players.entries()) {
      const { data, error } = await rpc<{ id: string; seat: number }>(p.db, 'join_room', { p_code: code, p_name: 'Người ' + i })
      expect(error).toBeNull()
      memberIds.push(data.id)
    }
    const dup = await anonClient()
    expect((await rpc(dup.db, 'join_room', { p_code: code, p_name: 'người 0' })).error?.code).toBe('NAME_TAKEN')
    expect((await rpc(host.db, 'join_room', { p_code: code, p_name: 'Host' })).error?.code).toBe('IS_HOST')
  })

  it('vào lại (refresh) giữ nguyên danh tính và ghế', async () => {
    const { data } = await rpc<{ id: string }>(players[1]!.db, 'join_room', { p_code: code, p_name: 'Tên khác' })
    expect(data.id).toBe(memberIds[1])
  })

  it('người chơi không sửa được dữ liệu phòng trực tiếp', async () => {
    await players[0]!.db.from('rooms').update({ name: 'hack' }).eq('id', roomId)
    const { data } = await host.db.from('rooms').select('name').eq('id', roomId).single()
    expect(data!.name).toBe('Ván kiểm thử')
    expect((await rpc(players[0]!.db, 'host_lock', { p_room: roomId })).error?.code).toBe('NOT_HOST')
  })

  it('kick: người bị mời ra không đọc được phòng, thấy trạng thái của mình', async () => {
    expect((await rpc(host.db, 'host_kick', { p_member: memberIds[4] })).error).toBeNull()
    const kicked = players[4]!
    const rooms = await kicked.db.from('rooms').select('id').eq('id', roomId)
    expect(rooms.data).toEqual([])
    const me = await kicked.db.from('room_members').select('status').eq('id', memberIds[4]).single()
    expect(me.data!.status).toBe('kicked')
  })

  it('thêm người không có điện thoại, chốt phòng, khóa không cho vào thêm', async () => {
    const { data } = await rpc<{ id: string; device: boolean }>(host.db, 'host_add_member', { p_room: roomId, p_name: 'Bà Tư' })
    expect(data.device).toBe(false)
    expect((await rpc(host.db, 'host_lock', { p_room: roomId })).error).toBeNull()
    const late = await anonClient()
    expect((await rpc(late.db, 'join_room', { p_code: code, p_name: 'Muộn' })).error?.code).toBe('ROOM_LOCKED')
  })
})

describe('chia và gửi vai', () => {
  it('tạo ván (idempotent khi gọi lặp)', async () => {
    const a = await command(host.db, { scope: 'room', roomId, command: { type: 'game.ensure' } })
    const b = await command(host.db, { scope: 'room', roomId, command: { type: 'game.ensure' } })
    expect(a.error).toBeUndefined()
    expect(b.data!.gameId).toBe(a.data!.gameId)
    gameId = a.data!.gameId
  })

  it('chỉ quản trò gửi được lệnh ván', async () => {
    const r = await command(players[0]!.db, { scope: 'game', gameId, expectedRevision: 0, command: { type: 'deal' } })
    expect(r.status).toBe(403)
  })

  it('chia bài idempotent theo commandId; revision cũ bị từ chối', async () => {
    expect((await game({ type: 'deck.set', counts: { wolf: 1, seer: 1, villager: 3 } })).error).toBeUndefined()
    const id = randomUUID()
    const first = await game({ type: 'deal' }, { commandId: id })
    const again = await command(host.db, { scope: 'game', gameId, expectedRevision: first.data!.revision - 1, command: { type: 'deal' }, commandId: id })
    expect(again.data!.duplicate).toBe(true)
    expect(again.data!.revision).toBe(first.data!.revision)
    const stale = await game({ type: 'deal' }, { expectedRevision: 0 })
    expect(stale.status).toBe(409)
    expect(stale.error!.code).toBe('REVISION_CONFLICT')
  })

  it('trước khi gửi, người chơi không đọc được vai; không ai ngoài quản trò đọc trạng thái bí mật', async () => {
    const a = await players[0]!.db.from('assignments').select('role_id').eq('game_id', gameId)
    expect(a.data).toEqual([])
    const s = await players[0]!.db.from('game_secrets').select('state').eq('game_id', gameId)
    expect(s.data).toEqual([])
    const h = await host.db.from('assignments').select('role_id').eq('game_id', gameId)
    expect(h.data).toHaveLength(5)
  })

  it('sau khi gửi, mỗi người chỉ đọc được vai của chính mình', async () => {
    expect((await game({ type: 'send' })).error).toBeUndefined()
    for (const [i, p] of players.slice(0, 4).entries()) {
      const { data } = await p.db.from('assignments').select('member_id,role_id').eq('game_id', gameId)
      expect(data).toHaveLength(1)
      expect(data![0]!.member_id).toBe(memberIds[i])
    }
    const pub = await players[0]!.db.from('games').select('public_state').eq('id', gameId).single()
    const json = JSON.stringify(pub.data!.public_state)
    for (const role of ['"wolf"', '"seer"', '"villager"']) expect(json).not.toContain(role)
  })

  it('không xáo lại hoặc mở lại phòng sau khi gửi', async () => {
    expect((await game({ type: 'deal' })).status).toBe(422)
    expect((await rpc(host.db, 'host_unlock', { p_room: roomId })).error?.code).toBe('ROLES_SENT')
  })

  it('xác nhận đã xem idempotent; quản trò xác nhận thay người không có điện thoại', async () => {
    const t1 = await rpc<string>(players[0]!.db, 'ack_role', { p_game: gameId })
    const t2 = await rpc<string>(players[0]!.db, 'ack_role', { p_game: gameId })
    expect(t1.error).toBeNull()
    expect(t2.data).toBe(t1.data)
    const rows = await host.db.from('assignments').select('member_id,viewed_at').eq('game_id', gameId)
    const manual = rows.data!.find((r) => !memberIds.includes(r.member_id))!
    expect((await rpc(host.db, 'host_ack_role', { p_game: gameId, p_member: manual.member_id })).error).toBeNull()
    expect((await rpc(host.db, 'host_ack_role', { p_game: gameId, p_member: memberIds[1] })).error?.code).toBe('NO_ASSIGNMENT')
  })
})

describe('ván và realtime', () => {
  it('bắt đầu, thao tác đêm sai bước bị từ chối, hoàn tác khôi phục', async () => {
    expect((await game({ type: 'start' })).error).toBeUndefined()
    const { data } = await host.db.from('game_secrets').select('state').eq('game_id', gameId).single()
    const state = data!.state as GameState
    expect(state.phase).toBe('night')
    const steps = state.night!.steps
    expect((await game({ type: 'night.act', step: steps[0], stepIndex: 5 })).error?.code).toBe('STEP_STALE')

    const wolf = state.players.find((p) => p.roleId === 'wolf')!
    const victim = state.players.find((p) => p.roleId === 'villager')!
    const wolfIdx = steps.indexOf('wolf')
    expect(wolfIdx).toBe(0)
    expect((await game({ type: 'night.act', step: 'wolf', stepIndex: 0, targets: [wolf.id] })).error?.code).toBe('BAD_TARGET')
    expect((await game({ type: 'night.act', step: 'wolf', stepIndex: 0, targets: [victim.id] })).error).toBeUndefined()
    const undo = await game({ type: 'undo' })
    expect(undo.data!.undone).toBe('Xác nhận lượt gọi')
    const after = await host.db.from('game_secrets').select('state').eq('game_id', gameId).single()
    expect((after.data!.state as GameState).night!.step).toBe(0)
  })

  it('người chơi nhận thay đổi công khai qua realtime, không nhận trạng thái bí mật', async () => {
    const p = players[0]!.db
    const got: string[] = []
    const ch = p
      .channel('t-' + randomUUID())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, () => got.push('games'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_secrets', filter: `game_id=eq.${gameId}` }, () =>
        got.push('secrets'),
      )
    await new Promise<void>((resolve, reject) =>
      ch.subscribe((status) => (status === 'SUBSCRIBED' ? resolve() : status === 'CHANNEL_ERROR' && reject(new Error(status)))),
    )
    const { data } = await host.db.from('game_secrets').select('state').eq('game_id', gameId).single()
    const state = data!.state as GameState
    const victim = state.players.find((x) => x.roleId === 'villager')!
    await game({ type: 'night.act', step: 'wolf', stepIndex: 0, targets: [victim.id] })
    await new Promise((r) => setTimeout(r, 2500))
    await p.removeChannel(ch)
    expect(got).toContain('games')
    expect(got).not.toContain('secrets')
  })

  it('đóng phòng: mã hết hiệu lực, người chơi không đọc được dữ liệu phòng nữa', async () => {
    expect((await rpc(host.db, 'host_close', { p_room: roomId })).error).toBeNull()
    const late = await anonClient()
    expect((await rpc(late.db, 'join_room', { p_code: code, p_name: 'X' })).error?.code).toBe('ROOM_NOT_FOUND')
    const { data } = await host.db.from('rooms').select('status').eq('id', roomId).single()
    expect(data!.status).toBe('closed')
    expect((await players[0]!.db.from('games').select('id').eq('id', gameId)).data).toEqual([])
    const me = await players[0]!.db.from('room_members').select('status').eq('id', memberIds[0]).single()
    expect(me.data!.status).toBe('closed')
    expect((await game({ type: 'night.end' })).error?.code).toBe('ROOM_CLOSED')
  })
})
