import { describe, expect, it } from 'vitest'
import { DEFAULT_REMOTE_SETTINGS, parsePlayerCommand, remoteProjection } from '@shared/remote.ts'
import { startedGame } from './helpers'

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
})
