import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameState } from '@engine'
import { anonClient, command, playerCommand, rpc } from './env'

interface Actor {
  db: SupabaseClient
  uid: string
  memberId: string
  alive?: boolean
}

let host: { db: SupabaseClient; uid: string }
let roomId: string
let gameId: string
let revision = 0
const players: Actor[] = []
let wolfActor: Actor

const game = async (body: Record<string, unknown>) => {
  const result = await command(host.db, {
    scope: 'game',
    gameId,
    expectedRevision: revision,
    command: body as never,
  })
  if (result.data) revision = result.data.revision
  return result
}

beforeAll(async () => {
  host = await anonClient()
  const created = await rpc<{ id: string; code: string }>(host.db, 'create_room', {
    p_name: 'Remote vote',
    p_options: { mode: 'remote', allowVoteChange: true },
  })
  roomId = created.data.id
  for (let index = 0; index < 4; index++) {
    const actor = await anonClient()
    const joined = await rpc<{ id: string }>(actor.db, 'join_room', {
      p_code: created.data.code,
      p_name: `V${index + 1}`,
    })
    players.push({ ...actor, memberId: joined.data.id })
    await rpc(actor.db, 'player_set_ready', { p_room: roomId, p_ready: true })
  }
  await rpc(host.db, 'host_lock', { p_room: roomId })
  gameId = (await command(host.db, { scope: 'room', roomId, command: { type: 'game.ensure' } }))
    .data!.gameId
  await game({ type: 'deck.set', counts: { wolf: 1, villager: 3 } })
  await game({ type: 'deal' })
  await game({ type: 'send' })
  await game({ type: 'start' })
  const state = (await host.db.from('game_secrets').select('state').eq('game_id', gameId).single())
    .data!.state as GameState
  wolfActor = players.find(
    (actor) => state.players.find((player) => player.id === actor.memberId)?.roleId === 'wolf',
  )!
  const victim = state.players.find((player) => player.roleId === 'villager')!
  expect(
    (
      await playerCommand(wolfActor.db, {
        roomId,
        gameId,
        command: { type: 'chat.send', channel: 'wolves', body: 'Tin bí mật trước khi chết.' },
      })
    ).status,
  ).toBe(200)
  await game({ type: 'night.act', step: 'wolf', stepIndex: 0, targets: [victim.id] })
  await game({ type: 'night.end' })
  for (const actor of players) actor.alive = actor.memberId !== victim.id
})

describe('remote discussion, vote và kết quả', () => {
  it('mở chat lúc thảo luận và khóa ngay khi sang vote', async () => {
    expect((await game({ type: 'day.goto', step: 'discuss' })).status).toBe(200)
    expect(
      (
        await game({
          type: 'remote.extend',
          seconds: 30,
          reason: 'Cần thêm thời gian thảo luận',
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await host.db
          .from('moderation_events')
          .select('kind,reason')
          .eq('game_id', gameId)
          .eq('kind', 'extend_deadline')
          .single()
      ).data,
    ).toEqual({ kind: 'extend_deadline', reason: 'Cần thêm thời gian thảo luận' })
    const alive = players.find((player) => player.alive)!
    const dead = players.find((player) => !player.alive)!
    expect(
      (
        await playerCommand(alive.db, {
          roomId,
          gameId,
          command: { type: 'chat.send', channel: 'public', body: 'Tôi nghi Sói.' },
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await playerCommand(dead.db, {
          roomId,
          gameId,
          command: { type: 'chat.send', channel: 'public', body: 'Tin từ người chết.' },
        })
      ).error?.code,
    ).toBe('DEAD_PLAYER')
    expect((await game({ type: 'day.goto', step: 'vote' })).status).toBe(200)
    expect(
      (
        await playerCommand(alive.db, {
          roomId,
          gameId,
          command: { type: 'chat.send', channel: 'public', body: 'Tin gửi muộn.' },
        })
      ).error?.code,
    ).toBe('CHAT_CLOSED')
  })

  it('giữ phiếu riêng, cho đổi, khóa và công khai đúng tổng', async () => {
    const alive = players.filter((player) => player.alive)
    const dead = players.find((player) => !player.alive)!
    const state = (
      await host.db.from('game_secrets').select('state').eq('game_id', gameId).single()
    ).data!.state as GameState
    const wolfId = state.players.find((player) => player.roleId === 'wolf')!.id
    const alternate = state.players.find((player) => player.alive && player.id !== wolfId)!.id
    const phase = (await host.db.from('remote_phases').select('*').eq('game_id', gameId).single())
      .data!

    expect((await dead.db.from('game_prompts').select('*').eq('game_id', gameId)).data).toEqual([])
    for (const [index, actor] of alive.entries()) {
      const prompt = (
        await actor.db
          .from('game_prompts')
          .select('*')
          .eq('game_id', gameId)
          .eq('phase_sequence', phase.sequence)
          .single()
      ).data!
      if (index === 0) {
        await playerCommand(actor.db, {
          roomId,
          gameId,
          command: { type: 'vote.submit', phaseSequence: phase.sequence, candidateId: alternate },
        })
      }
      expect(
        (
          await playerCommand(actor.db, {
            roomId,
            gameId,
            command: {
              type: 'vote.submit',
              phaseSequence: phase.sequence,
              candidateId: index === alive.length - 1 ? null : wolfId,
            },
          })
        ).status,
      ).toBe(200)
      const own = await actor.db
        .from('game_action_submissions')
        .select('*')
        .eq('prompt_id', prompt.id)
        .single()
      expect(own.data).not.toBeNull()
    }
    expect((await host.db.from('game_action_submissions').select('*')).data).toEqual([])
    expect((await game({ type: 'remote.lock' })).status).toBe(200)
    const publicState = (
      await alive[0]!.db.from('games').select('public_state').eq('id', gameId).single()
    ).data!.public_state
    expect(publicState.voteResult.tally[wolfId]).toBe(2)
    expect(publicState.voteResult.abstain).toBe(1)

    expect((await game({ type: 'vote.eliminate', target: wolfId })).status).toBe(200)
    expect(
      (
        await wolfActor.db
          .from('chat_messages')
          .select('body')
          .eq('game_id', gameId)
          .eq('channel', 'wolves')
      ).data,
    ).toEqual([])
    expect(
      (
        await playerCommand(wolfActor.db, {
          roomId,
          gameId,
          command: { type: 'chat.send', channel: 'wolves', body: 'Không được gửi.' },
        })
      ).error?.code,
    ).toBe('CHAT_CLOSED')
    expect((await game({ type: 'finish' })).status).toBe(200)
    const ended = (
      await alive[0]!.db.from('games').select('status,public_state').eq('id', gameId).single()
    ).data!
    expect(ended.status).toBe('ended')
    expect(ended.public_state.result.team).toBe('village')
  })
})
