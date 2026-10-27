import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameState } from '@engine'
import { anonClient, command, playerCommand, rpc } from './env'

interface Actor {
  db: SupabaseClient
  uid: string
  memberId: string
  roleId?: string
}

let host: { db: SupabaseClient; uid: string }
let roomId: string
let gameId: string
let revision = 0
const players: Actor[] = []

const game = async (commandBody: Record<string, unknown>) => {
  const result = await command(host.db, {
    scope: 'game',
    gameId,
    expectedRevision: revision,
    command: commandBody as never,
  })
  if (result.data) revision = result.data.revision
  return result
}

beforeAll(async () => {
  host = await anonClient()
  const created = await rpc<{ id: string; code: string }>(host.db, 'create_room', {
    p_name: 'Remote actions',
    p_options: { mode: 'remote', nightActionSeconds: 180 },
  })
  roomId = created.data.id
  for (let index = 0; index < 4; index++) {
    const actor = await anonClient()
    const joined = await rpc<{ id: string }>(actor.db, 'join_room', {
      p_code: created.data.code,
      p_name: `P${index + 1}`,
    })
    players.push({ ...actor, memberId: joined.data.id })
    await rpc(actor.db, 'player_set_ready', { p_room: roomId, p_ready: true })
  }
  await rpc(host.db, 'host_lock', { p_room: roomId })
  gameId = (await command(host.db, { scope: 'room', roomId, command: { type: 'game.ensure' } }))
    .data!.gameId
  await game({ type: 'deck.set', counts: { wolf: 2, villager: 2 } })
  await game({ type: 'deal' })
  const assignments = (
    await host.db.from('assignments').select('member_id,role_id').eq('game_id', gameId)
  ).data!
  for (const player of players)
    player.roleId = assignments.find((row) => row.member_id === player.memberId)!.role_id
  await game({ type: 'send' })
  await game({ type: 'start' })
})

describe('remote night actions và RLS', () => {
  it('chỉ actor đọc prompt và dân làng không đọc chat Sói', async () => {
    const wolves = players.filter((player) => player.roleId === 'wolf')
    const villagers = players.filter((player) => player.roleId === 'villager')
    for (const wolf of wolves) {
      const prompts = await wolf.db.from('game_prompts').select('*').eq('game_id', gameId)
      expect(prompts.data).toHaveLength(1)
      expect(prompts.data![0]!.member_id).toBe(wolf.memberId)
    }
    for (const villager of villagers) {
      expect(
        (await villager.db.from('game_prompts').select('*').eq('game_id', gameId)).data,
      ).toEqual([])
      expect(
        (await villager.db.from('chat_channel_memberships').select('*').eq('game_id', gameId)).data,
      ).toEqual([])
    }
    const sent = await playerCommand(wolves[0]!.db, {
      roomId,
      gameId,
      command: { type: 'chat.send', channel: 'wolves', body: 'Chọn cùng một mục tiêu nhé.' },
    })
    expect(sent.status).toBe(200)
    expect(
      (await wolves[1]!.db.from('chat_messages').select('body').eq('game_id', gameId)).data,
    ).toEqual([{ body: 'Chọn cùng một mục tiêu nhé.' }])
    expect(
      (await villagers[0]!.db.from('chat_messages').select('body').eq('game_id', gameId)).data,
    ).toEqual([])
    expect((await host.db.from('chat_messages').select('body').eq('game_id', gameId)).data).toEqual(
      [],
    )
  })

  it('retry không nhân đôi, đổi lựa chọn tăng revision và host tổng hợp vào engine', async () => {
    const wolves = players.filter((player) => player.roleId === 'wolf')
    const victim = players.find((player) => player.roleId === 'villager')!
    for (const [index, wolf] of wolves.entries()) {
      const prompt = (await wolf.db.from('game_prompts').select('*').eq('game_id', gameId).single())
        .data!
      const commandId = randomUUID()
      const body = {
        roomId,
        gameId,
        commandId,
        command: {
          type: 'action.submit' as const,
          promptId: prompt.id,
          phaseSequence: prompt.phase_sequence,
          payload: { targets: [victim.memberId] },
        },
      }
      expect((await playerCommand(wolf.db, body)).status).toBe(200)
      expect((await playerCommand(wolf.db, body)).status).toBe(200)
      const own = await wolf.db.from('game_action_submissions').select('*')
      expect(own.data).toHaveLength(1)
      expect(own.data![0]!.revision).toBe(1)
      if (index === 0) {
        expect(
          (
            await playerCommand(wolf.db, {
              ...body,
              commandId: randomUUID(),
            })
          ).status,
        ).toBe(200)
        expect(
          (await wolf.db.from('game_action_submissions').select('revision').single()).data!
            .revision,
        ).toBe(2)
      }
    }
    const phase = (await host.db.from('remote_phases').select('*').eq('game_id', gameId).single())
      .data!
    expect(phase.submitted_count).toBe(2)
    expect((await game({ type: 'remote.lock' })).status).toBe(200)
    const state = (
      await host.db.from('game_secrets').select('state').eq('game_id', gameId).single()
    ).data!.state as GameState
    expect(state.night!.actions.wolf).toBe(victim.memberId)
    expect(state.night!.step).toBe(1)
  })

  it('khóa quyền chat Sói ngay khi bước Sói kết thúc và từ chối submission cũ', async () => {
    const wolf = players.find((player) => player.roleId === 'wolf')!
    expect(
      (await wolf.db.from('chat_channel_memberships').select('*').eq('game_id', gameId)).data,
    ).toEqual([expect.objectContaining({ can_read: false, can_write: false })])
    const oldPrompt = (
      await host.db
        .from('game_prompts')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at')
        .limit(1)
        .single()
    ).data!
    const stale = await playerCommand(wolf.db, {
      roomId,
      gameId,
      command: {
        type: 'action.submit',
        promptId: oldPrompt.id,
        phaseSequence: oldPrompt.phase_sequence,
        payload: { targets: [] },
      },
    })
    expect(stale.error?.code).toMatch(/PHASE_STALE|NO_PROMPT|PROMPT_LOCKED/)
  })
})

describe('remote timeout có audit', () => {
  it('không khóa khi còn thiếu và cho host bỏ lượt hộ có ghi nhận AFK', async () => {
    const timeoutHost = await anonClient()
    const created = await rpc<{ id: string; code: string }>(timeoutHost.db, 'create_room', {
      p_name: 'Remote timeout',
      p_options: { mode: 'remote' },
    })
    const actors: Actor[] = []
    for (let index = 0; index < 4; index++) {
      const actor = await anonClient()
      const joined = await rpc<{ id: string }>(actor.db, 'join_room', {
        p_code: created.data.code,
        p_name: `T${index + 1}`,
      })
      actors.push({ ...actor, memberId: joined.data.id })
      await rpc(actor.db, 'player_set_ready', { p_room: created.data.id, p_ready: true })
    }
    await rpc(timeoutHost.db, 'host_lock', { p_room: created.data.id })
    const ensured = await command(timeoutHost.db, {
      scope: 'room',
      roomId: created.data.id,
      command: { type: 'game.ensure' },
    })
    const timeoutGame = ensured.data!.gameId
    let rev = 0
    const runTimeout = async (body: Record<string, unknown>) => {
      const result = await command(timeoutHost.db, {
        scope: 'game',
        gameId: timeoutGame,
        expectedRevision: rev,
        command: body as never,
      })
      if (result.data) rev = result.data.revision
      return result
    }
    await runTimeout({ type: 'deck.set', counts: { wolf: 1, villager: 3 } })
    await runTimeout({ type: 'deal' })
    await runTimeout({ type: 'send' })
    await runTimeout({ type: 'start' })
    const prompt = (
      await timeoutHost.db.from('game_prompts').select('*').eq('game_id', timeoutGame).single()
    ).data!
    const premature = await runTimeout({ type: 'remote.lock' })
    expect(premature.status).toBe(409)
    expect(premature.error?.code).toBe('WAITING_ACTORS')
    expect(
      (
        await runTimeout({
          type: 'remote.timeout',
          promptId: prompt.id,
          reason: 'Mất kết nối',
        })
      ).status,
    ).toBe(200)
    expect(rev).toBe(4)
    expect((await runTimeout({ type: 'remote.lock' })).status).toBe(200)
    expect(
      (
        await timeoutHost.db
          .from('moderation_events')
          .select('kind,reason,target_member_id')
          .eq('game_id', timeoutGame)
          .single()
      ).data,
    ).toEqual({ kind: 'timeout', reason: 'Mất kết nối', target_member_id: prompt.member_id })
    expect(
      (
        await timeoutHost.db
          .from('room_members')
          .select('afk_count')
          .eq('id', prompt.member_id)
          .single()
      ).data,
    ).toEqual({ afk_count: 1 })
  })
})
