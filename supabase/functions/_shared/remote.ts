import {
  availableTargets,
  currentStep,
  stepActors,
  stepInfo,
  witchCanHeal,
  type GameState,
  type RuleOptions,
} from './engine/index.ts'

export type RoomMode = 'local' | 'remote'

export interface RemoteSettings {
  mode: RoomMode
  discussionSeconds: number
  nightActionSeconds: number
  voteSeconds: number
  allowVoteChange: boolean
  revealIndividualVotes: boolean
  autoAdvance: boolean
  revealWolfChatAfterGame: boolean
}

export type RoomOptions = RuleOptions & RemoteSettings

export const DEFAULT_REMOTE_SETTINGS: RemoteSettings = {
  mode: 'local',
  discussionSeconds: 300,
  nightActionSeconds: 45,
  voteSeconds: 60,
  allowVoteChange: true,
  revealIndividualVotes: false,
  autoAdvance: false,
  revealWolfChatAfterGame: true,
}

export type RemotePhaseKind =
  | 'lobby'
  | 'role_confirmation'
  | 'night_action'
  | 'night_review'
  | 'day_announcement'
  | 'effect_resolution'
  | 'day_discussion'
  | 'day_voting'
  | 'vote_result'
  | 'game_result'

export interface PromptTarget {
  id: string
  name: string
}

export interface PromptPayload {
  title: string
  instructions: string
  min: number
  max: number
  targets: PromptTarget[]
  wolfVictim?: PromptTarget | null
  healAvailable?: boolean
  poisonAvailable?: boolean
}

export interface PromptProjection {
  memberId: string
  kind: string
  payload: PromptPayload
}

export interface RemoteProjection {
  kind: RemotePhaseKind
  step: string | null
  durationSeconds: number | null
  prompts: PromptProjection[]
  wolfMembers: string[]
  requiredCount: number
}

export type PlayerCommand =
  | { type: 'player.ready'; ready: boolean }
  | { type: 'player.ackRole' }
  | {
      type: 'action.submit'
      promptId: string
      phaseSequence: number
      payload: { targets?: string[]; heal?: boolean; poison?: string | null }
    }
  | {
      type: 'vote.submit'
      phaseSequence: number
      candidateId: string | null
    }
  | {
      type: 'chat.send'
      channel: 'lobby' | 'public' | 'wolves'
      body: string
      replyTo?: string
    }

export interface PlayerCommandRequest {
  roomId: string
  gameId?: string
  commandId: string
  sessionId: string
  command: PlayerCommand
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export function parsePlayerCommand(value: unknown): PlayerCommand | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null
  switch (value.type) {
    case 'player.ready':
      return typeof value.ready === 'boolean' ? (value as unknown as PlayerCommand) : null
    case 'player.ackRole':
      return { type: 'player.ackRole' }
    case 'action.submit': {
      if (
        !UUID.test(String(value.promptId ?? '')) ||
        !Number.isInteger(value.phaseSequence) ||
        !isRecord(value.payload)
      )
        return null
      const payload = value.payload
      if (
        payload.targets !== undefined &&
        (!Array.isArray(payload.targets) ||
          payload.targets.length > 4 ||
          !payload.targets.every((id) => UUID.test(String(id))))
      )
        return null
      if (payload.heal !== undefined && typeof payload.heal !== 'boolean') return null
      if (
        payload.poison !== undefined &&
        payload.poison !== null &&
        !UUID.test(String(payload.poison))
      )
        return null
      return value as unknown as PlayerCommand
    }
    case 'vote.submit':
      return Number.isInteger(value.phaseSequence) &&
        (value.candidateId === null || UUID.test(String(value.candidateId)))
        ? (value as unknown as PlayerCommand)
        : null
    case 'chat.send':
      return ['lobby', 'public', 'wolves'].includes(String(value.channel)) &&
        typeof value.body === 'string' &&
        value.body.trim().length > 0 &&
        value.body.length <= 500 &&
        (value.replyTo === undefined || UUID.test(String(value.replyTo)))
        ? (value as unknown as PlayerCommand)
        : null
    default:
      return null
  }
}

function publicTarget(p: GameState['players'][number]): PromptTarget {
  return { id: p.id, name: p.name }
}

/**
 * Chiếu state engine thành state điều phối remote. Hàm thuần này không chứa database/realtime;
 * Edge Function ghi projection trong cùng transaction với state engine.
 */
export function remoteProjection(s: GameState, settings: RemoteSettings): RemoteProjection {
  const empty = (
    kind: RemotePhaseKind,
    durationSeconds: number | null = null,
  ): RemoteProjection => ({
    kind,
    step: null,
    durationSeconds,
    prompts: [],
    wolfMembers: [],
    requiredCount: 0,
  })

  if (s.status === 'ended') return empty('game_result')
  if (s.status === 'setup' || s.status === 'dealt') return empty('lobby')
  if (s.status === 'sent') return empty('role_confirmation')

  if (s.effects.length > 0) {
    const effect = s.effects[0]!
    const source = s.players.find((p) => p.id === effect.playerId)
    if (!source?.device) return { ...empty('effect_resolution'), step: effect.kind }
    const targets = s.players
      .filter((p) => p.alive && (effect.kind !== 'hunter' || p.id !== source.id))
      .map(publicTarget)
    return {
      kind: 'effect_resolution',
      step: effect.kind,
      durationSeconds: settings.nightActionSeconds,
      prompts: [
        {
          memberId: source.id,
          kind: effect.kind,
          payload: {
            title: effect.kind === 'hunter' ? 'Phát súng cuối' : 'Chọn Trưởng làng kế nhiệm',
            instructions:
              effect.kind === 'hunter'
                ? 'Chọn một người còn sống để bắn, hoặc bỏ lượt.'
                : 'Chọn một người còn sống kế nhiệm, hoặc bỏ lượt.',
            min: 0,
            max: 1,
            targets,
          },
        },
      ],
      wolfMembers: [],
      requiredCount: 1,
    }
  }

  if (s.phase === 'night') {
    const step = currentStep(s)
    if (!step) return empty('night_review')
    const info = stepInfo(s, step)
    const actors = stepActors(s, step).filter((p) => p.device)
    const targets = availableTargets(s, step).map(publicTarget)
    const wolfMembers = step === 'wolf' ? actors.map((p) => p.id) : []
    const victim = s.night?.actions.wolf
      ? s.players.find((p) => p.id === s.night!.actions.wolf)
      : undefined
    const payload: PromptPayload = {
      title: info.title.replace('Gọi ', ''),
      instructions: info.hint || info.script,
      min: info.pick[0],
      max: info.pick[1],
      targets,
      ...(step === 'witch'
        ? {
            wolfVictim: victim ? publicTarget(victim) : null,
            healAvailable: witchCanHeal(s),
            poisonAvailable: s.witch.poison,
          }
        : {}),
    }
    const prompts = actors.map((actor) => ({ memberId: actor.id, kind: step, payload }))
    return {
      kind: 'night_action',
      step,
      durationSeconds: settings.nightActionSeconds,
      prompts,
      wolfMembers,
      requiredCount: prompts.length,
    }
  }

  const dayStep = s.dayState?.step
  if (dayStep === 'announce') return empty('day_announcement')
  if (dayStep === 'discuss') return empty('day_discussion', settings.discussionSeconds)
  if (dayStep === 'vote') {
    if (s.dayState?.result) return empty('vote_result')
    return {
      ...empty('day_voting', settings.voteSeconds),
      requiredCount: s.players.filter((p) => p.alive && p.canVote && p.device).length,
    }
  }
  return empty('vote_result')
}
