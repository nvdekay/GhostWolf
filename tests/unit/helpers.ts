import { applyCommand, createGame, type Command, type GameState, type RuleOptions } from '@engine'
import { freshPlayer } from '../../supabase/functions/_shared/engine/deal.ts'

export const rng = (max: number) => Math.floor(Math.random() * max)

/** Ván đã gửi vai với vai cố định theo ghế: roles[i] là vai của người p{i}. */
export function startedGame(roles: string[], options: Partial<RuleOptions> = {}): GameState {
  const counts: Record<string, number> = {}
  roles.forEach((r) => (counts[r] = (counts[r] ?? 0) + 1))
  const g = createGame('Ván test', options, counts, [])
  g.players = roles.map((r, i) =>
    freshPlayer({ id: 'p' + i, name: 'P' + i, seat: i + 1, device: true }, r),
  )
  g.status = 'sent'
  return applyCommand(g, { type: 'start' }, { randomInt: rng })
}

export function run(g: GameState, ...cmds: Command[]): GameState {
  return cmds.reduce((s, c) => applyCommand(s, c, { randomInt: rng }), g)
}

/** Thực hiện bước đêm hiện tại (kiểm tra đúng tên bước). */
export function act(
  g: GameState,
  step: string,
  extra: Omit<Extract<Command, { type: 'night.act' }>, 'type' | 'step' | 'stepIndex'> = {},
) {
  const n = g.night!
  if (n.steps[n.step] !== step)
    throw new Error(`Bước hiện tại là ${n.steps[n.step]}, không phải ${step}`)
  let s = run(g, { type: 'night.act', step, stepIndex: n.step, ...extra })
  if (step === 'seer') s = run(s, { type: 'night.sleep', step, stepIndex: n.step })
  return s
}

export const P = (g: GameState, i: number) => g.players[i]!
