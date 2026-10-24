import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import type { GameState } from '@engine'
import { anonClient, command, rpc } from './env'

let host: { db: SupabaseClient; uid: string }
let player: { db: SupabaseClient; uid: string }
let roomId: string
let gameId: string
let revision = 0

const game = async (cmd: Record<string, unknown>) => {
  const r = await command(host.db, {
    scope: 'game',
    gameId,
    expectedRevision: revision,
    command: cmd as never,
  })
  if (r.data) revision = r.data.revision
  return r
}
const state = async () =>
  (await host.db.from('game_secrets').select('state').eq('game_id', gameId).single()).data!
    .state as GameState

beforeAll(async () => {
  host = await anonClient()
  player = await anonClient()
  const { data: room } = await rpc<{ id: string; code: string }>(host.db, 'create_room', {
    p_name: 'Vòng đời',
    p_options: {},
  })
  roomId = room.id
  await rpc(player.db, 'join_room', { p_code: room.code, p_name: 'Có máy' })
  for (const n of ['A', 'B', 'C'])
    await rpc(host.db, 'host_add_member', { p_room: roomId, p_name: n })
  await rpc(host.db, 'host_lock', { p_room: roomId })
  gameId = (await command(host.db, { scope: 'room', roomId, command: { type: 'game.ensure' } }))
    .data!.gameId
  await game({ type: 'deck.set', counts: { wolf: 1, villager: 3 } })
  await game({ type: 'deal' })
  await game({ type: 'send' })
  await game({ type: 'start' })
})

describe('hoàn tác, reset, kết thúc, chơi lại', () => {
  it('hoàn tác khôi phục đúng trạng thái và cập nhật public state', async () => {
    const s0 = await state()
    const victim = s0.players.find((p) => p.roleId === 'villager')!
    await game({ type: 'night.act', step: 'wolf', stepIndex: 0, targets: [victim.id] })
    await game({ type: 'night.end' })
    const pub1 = (await player.db.from('games').select('public_state').eq('id', gameId).single())
      .data!.public_state
    expect(pub1.phase).toBe('day')
    expect(pub1.announcements.map((a: { id: string }) => a.id)).toEqual([victim.id])

    expect((await game({ type: 'undo' })).data!.undone).toBe('Trời sáng')
    const pub2 = (await player.db.from('games').select('public_state').eq('id', gameId).single())
      .data!.public_state
    expect(pub2.phase).toBe('night')
    expect(pub2.players.every((p: { alive: boolean }) => p.alive)).toBe(true)
  })

  it('reset về Đêm 1 giữ nguyên vai; có thể hoàn tác reset', async () => {
    const before = await state()
    await game({ type: 'reset' })
    const after = await state()
    expect(after.players.map((p) => p.roleId)).toEqual(before.players.map((p) => p.roleId))
    expect(after.day).toBe(1)
    expect((await game({ type: 'undo' })).data!.undone).toBe('Reset ván')
  })

  it('kết thúc: không thao tác hay hoàn tác được nữa; vai được công bố', async () => {
    await game({ type: 'finish', team: 'none' })
    expect((await game({ type: 'undo' })).status).toBe(409)
    expect((await game({ type: 'reset' })).status).toBe(422)
    const pub = (
      await player.db.from('games').select('public_state,status').eq('id', gameId).single()
    ).data!
    expect(pub.status).toBe('ended')
    expect(pub.public_state.players.every((p: { role: unknown }) => p.role)).toBe(true)
  })

  it('chơi lại tạo ván mới, ván cũ giữ nguyên; người chơi giữ membership', async () => {
    const r = await command(host.db, { scope: 'room', roomId, command: { type: 'game.replay' } })
    expect(r.data!.gameId).not.toBe(gameId)
    const old = await host.db.from('games').select('status').eq('id', gameId).single()
    expect(old.data!.status).toBe('ended')
    const fresh = await host.db
      .from('game_secrets')
      .select('state')
      .eq('game_id', r.data!.gameId)
      .single()
    const s = fresh.data!.state as GameState
    expect(s.status).toBe('setup')
    expect(s.counts).toEqual({ wolf: 1, villager: 3 })
    const room = await player.db
      .from('rooms')
      .select('current_game_id,status')
      .eq('id', roomId)
      .single()
    expect(room.data!.current_game_id).toBe(r.data!.gameId)
    // Lệnh cho ván cũ bị từ chối.
    expect((await game({ type: 'reset' })).error!.code).toBe('OLD_GAME')
    // Người chơi chưa thấy vai của ván mới.
    const a = await player.db.from('assignments').select('role_id').eq('game_id', r.data!.gameId)
    expect(a.data).toEqual([])
  })
})
