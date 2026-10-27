import { describe, expect, it } from 'vitest'
import {
  aggregateRemoteAction,
  aggregateRemoteVote,
  DEFAULT_REMOTE_SETTINGS,
  parsePlayerCommand,
  remoteProjection,
} from '@shared/remote.ts'
import { run, startedGame } from './helpers'

describe('remote contracts', () => {
  it('parses player commands without accepting identity fields or oversized chat', () => {
    expect(parsePlayerCommand({ type: 'player.ready', ready: true })).toEqual({
      type: 'player.ready',
      ready: true,
    })
    expect(
      parsePlayerCommand({ type: 'chat.send', channel: 'public', body: 'x'.repeat(501) }),
    ).toBeNull()
    expect(
      parsePlayerCommand({ type: 'vote.submit', phaseSequence: 2, candidateId: 'bad' }),
    ).toBeNull()
  })

  it('projects only the current actors and valid targets for a night prompt', () => {
    const state = startedGame(['guard', 'wolf', 'villager', 'seer'])
    const projection = remoteProjection(state, { ...DEFAULT_REMOTE_SETTINGS, mode: 'remote' })
    expect(projection).toMatchObject({
      kind: 'night_action',
      step: 'guard',
      requiredCount: 1,
    })
    expect(projection.prompts.map((p) => p.memberId)).toEqual(['p0'])
    expect(projection.prompts[0]!.payload.targets).toHaveLength(4)
  })

  it('keeps local rooms on the existing defaults', () => {
    expect(DEFAULT_REMOTE_SETTINGS.mode).toBe('local')
    expect(DEFAULT_REMOTE_SETTINGS.revealIndividualVotes).toBe(false)
    expect(DEFAULT_REMOTE_SETTINGS.revealWolfChatAfterGame).toBe(true)
  })

  it('aggregates wolf consensus and turns a tie into a safe timeout', () => {
    const state = startedGame(['wolf', 'whitewolf', 'villager', 'villager'])
    expect(
      aggregateRemoteAction(state, [
        { memberId: 'p0', payload: { targets: ['p2'] } },
        { memberId: 'p1', payload: { targets: ['p2'] } },
      ]),
    ).toEqual([{ type: 'night.act', step: 'wolf', stepIndex: 0, targets: ['p2'] }])
    expect(
      aggregateRemoteAction(state, [
        { memberId: 'p0', payload: { targets: ['p2'] } },
        { memberId: 'p1', payload: { targets: ['p3'] } },
      ]),
    ).toEqual([{ type: 'night.act', step: 'wolf', stepIndex: 0, targets: [], timeout: true }])
  })

  it('acknowledges a seer result in the same remote lock', () => {
    const initial = startedGame(['seer', 'wolf', 'villager', 'villager'])
    const state = run(initial, {
      type: 'night.act',
      step: 'wolf',
      stepIndex: 0,
      targets: ['p2'],
    })
    expect(
      aggregateRemoteAction(state, [{ memberId: 'p0', payload: { targets: ['p1'] } }]),
    ).toEqual([
      { type: 'night.act', step: 'seer', stepIndex: 1, targets: ['p1'] },
      { type: 'night.sleep', step: 'seer', stepIndex: 1 },
    ])
  })

  it('projects private seer knowledge, lovers and charmed notices without public data', () => {
    const state = startedGame(['cupid', 'seer', 'piper', 'wolf'])
    state.night!.actions.cupid = ['p0', 'p1']
    state.night!.actions.seer = 'p3'
    state.night!.actions.piper = ['p0', 'p1']
    const projection = remoteProjection(state, { ...DEFAULT_REMOTE_SETTINGS, mode: 'remote' })
    expect(projection.knowledge).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ memberId: 'p0', kind: 'lover' }),
        expect.objectContaining({ memberId: 'p1', kind: 'seer' }),
        expect.objectContaining({ memberId: 'p3', kind: 'wolf_pack' }),
      ]),
    )
    expect(projection.notices.map((notice) => [notice.memberId, notice.kind])).toEqual([
      ['p0', 'charmed'],
      ['p1', 'charmed'],
    ])
  })

  it('aggregates private votes and adds the chief weight in the engine', () => {
    const state = startedGame(['wolf', 'villager', 'villager', 'villager'])
    state.phase = 'day'
    state.night = null
    state.dayState = { step: 'vote', voteOnly: null, result: null, resolved: false }
    state.players[0]!.chief = true
    expect(
      aggregateRemoteVote(state, [
        { memberId: 'p0', payload: { targets: ['p2'] } },
        { memberId: 'p1', payload: { targets: ['p2'] } },
        { memberId: 'p2', payload: { targets: [] } },
      ]),
    ).toEqual({ type: 'vote.tally', votes: { p2: 2 }, chiefVote: 'p2' })
    expect(aggregateRemoteVote(state, [])).toEqual({ type: 'vote.skip' })
  })

  it('projects and aggregates a queued hunter effect for the affected player', () => {
    const state = startedGame(['hunter', 'wolf', 'villager', 'villager'])
    state.phase = 'day'
    state.night = null
    state.dayState = { step: 'announce', voteOnly: null, result: null, resolved: false }
    state.effects = [{ id: 7, kind: 'hunter', playerId: 'p0' }]
    state.players[0]!.alive = false
    const projection = remoteProjection(state, { ...DEFAULT_REMOTE_SETTINGS, mode: 'remote' })
    expect(projection).toMatchObject({
      kind: 'effect_resolution',
      requiredCount: 1,
      prompts: [{ memberId: 'p0', kind: 'hunter' }],
    })
    expect(
      aggregateRemoteAction(state, [{ memberId: 'p0', payload: { targets: ['p2'] } }]),
    ).toEqual([{ type: 'effect.resolve', effectId: 7, target: 'p2' }])
  })
})
