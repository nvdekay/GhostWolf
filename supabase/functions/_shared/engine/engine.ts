/*
 * Game engine: áp một lệnh lên trạng thái ván, trả về trạng thái mới.
 * Hàm thuần (trừ randomInt được truyền vào); mọi lệnh kiểm tra giai đoạn trước khi đổi dữ liệu.
 */
import { roleDef, seerSeesWolf } from './abilities.ts'
import { DEFAULT_OPTIONS, RULESET_VERSION } from './catalog.ts'
import { countsProblem, dealPlayers, type RandomInt } from './deal.ts'
import { assert, EngineError } from './errors.ts'
import {
  availableTargets,
  computeSteps,
  currentStep,
  stepActors,
  stepInfo,
  targetProblem,
  witchCanHeal,
} from './night.ts'
import type {
  Counts,
  DayStep,
  DeathCause,
  GameState,
  Player,
  RoleDef,
  RuleOptions,
  SeatInput,
  VoteResult,
} from './types.ts'
import { detectWinner, teamWinners, WIN_TITLES } from './win.ts'

export type Command =
  | { type: 'deck.set'; counts: Counts }
  | { type: 'options.set'; options: Partial<RuleOptions> }
  | { type: 'deal' }
  | { type: 'send' }
  | { type: 'start' }
  | {
      type: 'night.act'
      stepIndex: number
      step: string
      targets?: string[]
      heal?: boolean
      poison?: string | null
      note?: string
    }
  | { type: 'night.sleep'; stepIndex: number; step: string }
  | { type: 'night.end' }
  | { type: 'day.goto'; step: Exclude<DayStep, 'after'> }
  | { type: 'vote.tally'; votes: Record<string, number>; chiefVote: string | null }
  | { type: 'vote.clear' }
  | { type: 'vote.revote' }
  | { type: 'vote.eliminate'; target: string; reason?: string }
  | { type: 'vote.skip' }
  | { type: 'effect.resolve'; effectId: number; target: string | null }
  | { type: 'night.start' }
  | { type: 'player.kill'; playerId: string }
  | { type: 'player.revive'; playerId: string }
  | { type: 'player.setChief'; playerId: string | null }
  | { type: 'reset' }
  | { type: 'finish'; team?: 'village' | 'wolf' | 'none' }

export type CommandType = Command['type']

export interface EngineContext {
  randomInt: RandomInt
  /** Người trong phòng — dùng khi chia bài. */
  seats?: SeatInput[]
}

export function createGame(
  name: string,
  options: Partial<RuleOptions>,
  counts: Counts,
  customRoles: RoleDef[],
): GameState {
  return {
    version: 1,
    rulesetVersion: RULESET_VERSION,
    name,
    options: { ...DEFAULT_OPTIONS, ...options },
    status: 'setup',
    counts: { ...counts },
    customRoles,
    players: [],
    day: 0,
    phase: 'setup',
    night: null,
    dayState: null,
    witch: { heal: true, poison: true },
    lastProtect: null,
    lastDeaths: [],
    effects: [],
    nextEffectId: 1,
    tannerVoted: null,
    winner: null,
    log: [],
  }
}

/* — Tiện ích nội bộ (đột biến bản sao s) — */

function tag(s: GameState): string {
  return (s.phase === 'night' ? 'Đêm ' : 'Ngày ') + s.day
}

function log(s: GameState, text: string, pub: boolean) {
  s.log.push({ tag: tag(s), text, pub })
}

function player(s: GameState, id: string): Player {
  const p = s.players.find((x) => x.id === id)
  assert(p, 'NO_PLAYER', 'Không tìm thấy người chơi.')
  return p
}

const KILL_TEXT: Record<DeathCause, string> = {
  wolf: 'trong đêm',
  whitewolf: 'trong đêm',
  poison: 'trong đêm',
  vote: 'theo phiếu bầu',
  hunter: 'bởi phát bắn của Thợ săn',
  lover: 'vì Cặp đôi đã mất',
  gm: 'bởi quản trò',
}

const PRIVATE_CAUSE: Partial<Record<DeathCause, string>> = {
  wolf: 'bị bầy sói cắn',
  whitewolf: 'bị Sói trắng loại',
  poison: 'trúng độc của Phù thủy',
}

/** Loại một người: Cặp đôi chết theo, xếp hàng hiệu ứng Thợ săn / kế nhiệm Trưởng làng. */
function kill(s: GameState, id: string, cause: DeathCause) {
  const p = player(s, id)
  if (!p.alive) return
  p.alive = false
  p.death = { cause, day: s.day, phase: s.phase === 'night' ? 'night' : 'day' }
  if (s.options.revealOnDeath) p.revealed = true
  s.lastDeaths.push(id)
  log(s, `${p.name} bị loại ${KILL_TEXT[cause]}.`, true)
  if (PRIVATE_CAUSE[cause]) log(s, `${p.name} ${PRIVATE_CAUSE[cause]}.`, false)

  if (p.roleId === 'hunter' && !p.triggered.hunter) {
    p.triggered.hunter = true
    if (cause !== 'poison' || s.options.hunterShootsWhenPoisoned) {
      s.effects.push({ id: s.nextEffectId++, kind: 'hunter', playerId: id })
    } else {
      log(s, `Thợ săn ${p.name} trúng độc nên không được bắn.`, false)
    }
  }
  if (p.chief && s.options.chief && !p.triggered.succession) {
    p.triggered.succession = true
    s.effects.push({ id: s.nextEffectId++, kind: 'succession', playerId: id })
  }
  if (cause === 'vote' && p.roleId === 'tanner') s.tannerVoted = id
  if (p.lover) {
    const partner = s.players.find((x) => x.lover && x.id !== id && x.alive)
    if (partner) kill(s, partner.id, 'lover')
  }
}

function settle(s: GameState) {
  if (s.effects.length === 0 && !s.winner) s.winner = detectWinner(s)
}

function freshDay(): GameState['dayState'] {
  return { step: 'announce', voteOnly: null, result: null, resolved: false }
}

function beginNight(s: GameState, day: number) {
  s.day = day
  s.phase = 'night'
  s.dayState = null
  s.lastDeaths = []
  s.night = { steps: [], step: 0, actions: {} }
  s.night.steps = computeSteps(s)
}

const ids = (xs: string[] | undefined) => [...new Set(xs ?? [])]

/* — Kiểm tra trạng thái — */

function requireStatus(s: GameState, ...allowed: GameState['status'][]) {
  assert(allowed.includes(s.status), 'BAD_STATUS', statusMessage(s))
}

function statusMessage(s: GameState): string {
  switch (s.status) {
    case 'setup':
      return 'Ván chưa chia vai.'
    case 'dealt':
      return 'Vai đã chia nhưng chưa gửi.'
    case 'sent':
      return 'Vai đã gửi, ván chưa bắt đầu.'
    case 'playing':
      return 'Ván đang diễn ra.'
    case 'ended':
      return 'Ván đã kết thúc.'
  }
}

/** Lệnh trong ván: đang chơi, chưa có người thắng (chỉ còn kết thúc/hoàn tác). */
function requirePlaying(s: GameState) {
  requireStatus(s, 'playing')
  assert(!s.winner, 'HAS_WINNER', 'Đã có phe chiến thắng. Xem kết quả hoặc hoàn tác.')
}

function requireNoEffects(s: GameState) {
  assert(
    s.effects.length === 0,
    'EFFECT_PENDING',
    'Còn hiệu ứng cần quản trò xử lý trước (Thợ săn, Trưởng làng…).',
  )
}

function requireDay(s: GameState) {
  assert(s.phase === 'day' && s.dayState, 'NOT_DAY', 'Lệnh này chỉ dùng ban ngày.')
  return s.dayState
}

/* — Phiếu bầu — */

export function voteCandidates(s: GameState): Player[] {
  const only = s.dayState?.voteOnly
  return s.players.filter((p) => p.alive && (!only || only.includes(p.id)))
}

export function eligibleVoters(s: GameState): Player[] {
  return s.players.filter((p) => p.alive && p.canVote)
}

export function votingChief(s: GameState): Player | undefined {
  return s.options.chief ? s.players.find((p) => p.chief && p.alive && p.canVote) : undefined
}

export function tallyVotes(
  s: GameState,
  votes: Record<string, number>,
  chiefVote: string | null,
): VoteResult {
  const candidates = new Set(voteCandidates(s).map((p) => p.id))
  const maxRaw = eligibleVoters(s).length
  let sum = 0
  const tally: Record<string, number> = {}
  for (const [id, v] of Object.entries(votes)) {
    assert(Number.isInteger(v) && v >= 0, 'VOTE_INVALID', 'Số phiếu không hợp lệ.')
    if (v === 0) continue
    assert(candidates.has(id), 'VOTE_TARGET', 'Có phiếu cho người không thuộc danh sách được bầu.')
    tally[id] = v
    sum += v
  }
  assert(sum <= maxRaw, 'VOTE_OVER', `Tổng phiếu (${sum}) vượt số người có quyền bầu (${maxRaw}).`)
  if (chiefVote) {
    assert(votingChief(s), 'VOTE_CHIEF', 'Không có Trưởng làng còn quyền bầu.')
    assert(
      (tally[chiefVote] ?? 0) >= 1,
      'VOTE_CHIEF',
      'Phiếu Trưởng làng phải nằm trong số phiếu đếm tay của người đó.',
    )
    tally[chiefVote] = (tally[chiefVote] ?? 0) + 1
  }
  const max = Math.max(0, ...Object.values(tally))
  assert(max > 0, 'VOTE_EMPTY', 'Chưa có phiếu nào.')
  const top = Object.keys(tally).filter((id) => tally[id] === max)
  return { tally, top, max, abstain: maxRaw - sum }
}

/* — Áp lệnh — */

export function applyCommand(prev: GameState, cmd: Command, ctx: EngineContext): GameState {
  const s: GameState = structuredClone(prev)

  switch (cmd.type) {
    case 'deck.set': {
      requireStatus(s, 'setup', 'dealt')
      const bad = countsProblem(cmd.counts)
      assert(!bad, 'DECK_INVALID', bad ?? '')
      for (const [id, c] of Object.entries(cmd.counts)) if (c > 0) roleDef(s, id)
      s.counts = Object.fromEntries(Object.entries(cmd.counts).filter(([, c]) => c > 0))
      // Đổi bộ vai sau khi chia thì phải chia lại.
      if (s.status === 'dealt') {
        s.status = 'setup'
        s.players = []
      }
      return s
    }

    case 'options.set': {
      requireStatus(s, 'setup', 'dealt')
      const keys = Object.keys(s.options) as (keyof RuleOptions)[]
      for (const k of keys) if (typeof cmd.options[k] === 'boolean') s.options[k] = cmd.options[k]
      return s
    }

    case 'deal': {
      requireStatus(s, 'setup', 'dealt')
      assert(ctx.seats && ctx.seats.length > 0, 'NO_SEATS', 'Phòng chưa có người chơi.')
      s.players = dealPlayers(s.counts, ctx.seats, s.customRoles, ctx.randomInt)
      s.status = 'dealt'
      return s
    }

    case 'send': {
      requireStatus(s, 'dealt')
      s.status = 'sent'
      return s
    }

    case 'start': {
      requireStatus(s, 'sent')
      s.status = 'playing'
      beginNight(s, 1)
      log(s, `Ván bắt đầu với ${s.players.length} người chơi.`, true)
      return s
    }

    case 'night.act':
    case 'night.sleep':
      return nightStep(s, cmd)

    case 'night.end': {
      requirePlaying(s)
      assert(s.phase === 'night' && s.night, 'NOT_NIGHT', 'Không phải ban đêm.')
      assert(s.night.step >= s.night.steps.length, 'NIGHT_UNFINISHED', 'Còn vai chưa gọi xong.')
      const a = s.night.actions
      s.lastProtect = a.guard ?? null
      s.phase = 'day'
      s.dayState = freshDay()
      s.lastDeaths = []
      const bitten = a.wolf && a.wolf !== a.guard && !a.witchHeal ? a.wolf : null
      if (a.wolf && !bitten) log(s, `${player(s, a.wolf).name} bị cắn nhưng được cứu.`, false)
      if (bitten) kill(s, bitten, 'wolf')
      if (a.whitewolf) kill(s, a.whitewolf, 'whitewolf')
      if (a.witchPoison) kill(s, a.witchPoison, 'poison')
      for (const id of a.gmKills ?? []) kill(s, id, 'gm')
      if (s.lastDeaths.length === 0) log(s, 'Đêm qua không ai bị loại.', true)
      s.night = null
      settle(s)
      return s
    }

    case 'day.goto': {
      requirePlaying(s)
      const d = requireDay(s)
      assert(!d.resolved, 'DAY_RESOLVED', 'Ngày đã có kết quả bỏ phiếu.')
      const order: DayStep[] = ['announce', 'discuss', 'vote']
      const from = order.indexOf(d.step)
      const to = order.indexOf(cmd.step)
      // docs/ruleset.md: ngày chỉ đi tới bước kế tiếp — không quay lại, không bỏ qua.
      assert(to >= from, 'DAY_BACK', 'Không quay lại bước trước trong ngày.')
      assert(to <= from + 1, 'DAY_SKIP', 'Không thể bỏ qua bước trong ngày.')
      if (to === from) return s
      requireNoEffects(s)
      d.step = cmd.step
      return s
    }

    case 'vote.tally': {
      requirePlaying(s)
      requireNoEffects(s)
      const d = requireDay(s)
      assert(d.step === 'vote' && !d.resolved, 'NOT_VOTE', 'Chưa tới bước bỏ phiếu.')
      d.result = tallyVotes(s, cmd.votes, cmd.chiefVote)
      return s
    }

    case 'vote.clear': {
      requirePlaying(s)
      const d = requireDay(s)
      assert(d.step === 'vote' && !d.resolved, 'NOT_VOTE', 'Chưa tới bước bỏ phiếu.')
      d.result = null
      return s
    }

    case 'vote.revote': {
      requirePlaying(s)
      const d = requireDay(s)
      assert(d.result && d.result.top.length > 1, 'NO_TIE', 'Chỉ bầu lại khi hòa phiếu.')
      const names = d.result.top.map((id) => player(s, id).name).join(', ')
      d.voteOnly = d.result.top
      d.result = null
      log(s, `Hòa phiếu, bỏ phiếu lại giữa ${names}.`, true)
      return s
    }

    case 'vote.eliminate': {
      requirePlaying(s)
      requireNoEffects(s)
      const d = requireDay(s)
      assert(d.step === 'vote' && !d.resolved && d.result, 'NO_RESULT', 'Chưa có kết quả bỏ phiếu.')
      assert(d.result.top.includes(cmd.target), 'NOT_TOP', 'Chỉ loại người có nhiều phiếu nhất.')
      const reason = cmd.reason?.trim()
      if (d.result.top.length > 1)
        assert(reason, 'NEED_REASON', 'Hòa phiếu: cần ghi lý do quyết định.')
      const p = player(s, cmd.target)
      if (reason) log(s, `Quyết định khi hòa phiếu: loại ${p.name} (${reason}).`, true)
      if (p.roleId === 'idiot' && !p.triggered.idiot) {
        p.triggered.idiot = true
        p.revealed = true
        p.canVote = false
        log(s, `${p.name} là Thằng ngốc: lật thẻ, ở lại làng nhưng mất quyền bỏ phiếu.`, true)
      } else {
        s.lastDeaths = []
        kill(s, p.id, 'vote')
      }
      d.resolved = true
      d.step = 'after'
      d.result = null
      d.voteOnly = null
      settle(s)
      return s
    }

    case 'vote.skip': {
      requirePlaying(s)
      requireNoEffects(s)
      const d = requireDay(s)
      assert(d.step === 'vote' && !d.resolved, 'NOT_VOTE', 'Chưa tới bước bỏ phiếu.')
      d.resolved = true
      d.step = 'after'
      d.result = null
      d.voteOnly = null
      log(s, 'Hôm nay không ai bị loại.', true)
      return s
    }

    case 'effect.resolve': {
      requirePlaying(s)
      const e = s.effects[0]
      assert(
        e && e.id === cmd.effectId,
        'EFFECT_ORDER',
        'Hiệu ứng này đã được xử lý hoặc chưa tới lượt.',
      )
      const source = player(s, e.playerId)
      s.effects.shift()
      if (e.kind === 'hunter') {
        if (cmd.target) {
          const t = player(s, cmd.target)
          assert(
            t.alive && t.id !== source.id,
            'BAD_TARGET',
            'Thợ săn chỉ bắn người còn sống khác.',
          )
          log(s, `Thợ săn ${source.name} bắn ${t.name}.`, true)
          kill(s, t.id, 'hunter')
        } else {
          log(s, `Thợ săn ${source.name} không bắn ai.`, true)
        }
      } else {
        source.chief = false
        if (cmd.target) {
          const t = player(s, cmd.target)
          assert(t.alive, 'BAD_TARGET', 'Người kế nhiệm phải còn sống.')
          s.players.forEach((x) => (x.chief = x.id === t.id))
          log(s, `${source.name} chỉ định ${t.name} làm Trưởng làng.`, true)
        } else {
          log(s, `Trưởng làng ${source.name} không chỉ định người kế nhiệm.`, true)
        }
      }
      settle(s)
      return s
    }

    case 'night.start': {
      requirePlaying(s)
      requireNoEffects(s)
      const d = requireDay(s)
      assert(
        d.resolved,
        'DAY_UNRESOLVED',
        'Cần bỏ phiếu (hoặc chọn không loại ai) trước khi sang đêm.',
      )
      beginNight(s, s.day + 1)
      log(s, 'Màn đêm buông xuống.', true)
      return s
    }

    case 'player.kill': {
      requirePlaying(s)
      const p = player(s, cmd.playerId)
      assert(p.alive, 'DEAD', 'Người này đã bị loại.')
      if (s.phase === 'night' && s.night) {
        const list = s.night.actions.gmKills ?? []
        assert(!list.includes(p.id), 'DUP', 'Đã đánh dấu người này.')
        s.night.actions.gmKills = [...list, p.id]
        log(s, `Quản trò đánh dấu ${p.name} bị loại, công bố lúc trời sáng.`, false)
      } else {
        kill(s, p.id, 'gm')
        settle(s)
      }
      return s
    }

    case 'player.revive': {
      requirePlaying(s)
      const p = player(s, cmd.playerId)
      assert(!p.alive, 'ALIVE', 'Người này còn sống.')
      p.alive = true
      p.death = null
      s.lastDeaths = s.lastDeaths.filter((id) => id !== p.id)
      s.effects = s.effects.filter((e) => e.playerId !== p.id)
      if (s.tannerVoted === p.id) s.tannerVoted = null
      log(s, `${p.name} được quản trò hồi sinh (sửa nhầm).`, false)
      return s
    }

    case 'player.setChief': {
      requirePlaying(s)
      assert(s.options.chief, 'NO_CHIEF', 'Ván này không dùng Trưởng làng.')
      if (cmd.playerId) {
        const p = player(s, cmd.playerId)
        assert(p.alive, 'DEAD', 'Trưởng làng phải còn sống.')
        s.players.forEach((x) => (x.chief = x.id === p.id))
        log(s, `${p.name} được bầu làm Trưởng làng.`, true)
      } else {
        s.players.forEach((x) => (x.chief = false))
        log(s, 'Bỏ chức Trưởng làng.', true)
      }
      return s
    }

    case 'reset': {
      requireStatus(s, 'playing')
      s.players = s.players.map((p) => ({
        ...p,
        alive: true,
        death: null,
        lover: false,
        chief: false,
        charmed: false,
        revealed: false,
        canVote: true,
        triggered: {},
      }))
      Object.assign(s, {
        witch: { heal: true, poison: true },
        lastProtect: null,
        effects: [],
        tannerVoted: null,
        winner: null,
        log: [],
      } satisfies Partial<GameState>)
      beginNight(s, 1)
      log(s, 'Ván được reset về Đêm 1.', true)
      return s
    }

    case 'finish': {
      requireStatus(s, 'playing')
      if (cmd.team) {
        const t = cmd.team
        s.winner = {
          team: t,
          title: t === 'none' ? 'Kết thúc không phân thắng bại' : WIN_TITLES[t],
          reason: 'Quản trò công bố kết thúc ván.',
          winners: t === 'none' ? [] : teamWinners(s, t),
          manual: true,
        }
      } else {
        assert(s.winner, 'NO_WINNER', 'Chưa có phe chiến thắng.')
      }
      requireNoEffects(s)
      s.status = 'ended'
      log(s, `Kết thúc ván: ${s.winner.title}.`, true)
      return s
    }
  }
}

function nightStep(
  s: GameState,
  cmd: Extract<Command, { type: 'night.act' | 'night.sleep' }>,
): GameState {
  requirePlaying(s)
  const key = currentStep(s)
  const n = s.night
  assert(
    key && n && cmd.stepIndex === n.step && cmd.step === key,
    'STEP_STALE',
    'Bước gọi vai đã thay đổi. Tải lại bàn.',
  )
  const info = stepInfo(s, key)
  const actorsAlive = stepActors(s, key).length > 0
  const a = n.actions

  if (cmd.type === 'night.sleep') {
    assert(key === 'seer' && a.seer, 'NO_SEER', 'Chỉ dùng sau khi Tiên tri đã soi.')
    n.step++
    return s
  }

  const targets = ids(cmd.targets)
  if (!actorsAlive) {
    assert(
      targets.length === 0 && !cmd.heal && !cmd.poison,
      'ACTOR_DEAD',
      'Vai này đã bị loại, không được hành động.',
    )
    log(s, `${info.title.replace('Gọi ', '')} đã bị loại, gọi cho có.`, false)
    n.step++
    return s
  }

  const check = (id: string, mode: 'main' | 'poison' = 'main') => {
    const problem = targetProblem(s, key, player(s, id), mode)
    if (problem) throw new EngineError('BAD_TARGET', problem)
  }
  const names = (xs: string[]) => xs.map((id) => player(s, id).name).join(' và ')
  const available = availableTargets(s, key).length
  const need = (min: number, max: number) => {
    const lo = Math.min(min, available)
    assert(
      targets.length >= lo && targets.length <= max,
      'PICK_COUNT',
      info.hint || 'Số người chọn không hợp lệ.',
    )
    targets.forEach((id) => check(id))
  }

  switch (key) {
    case 'cupid':
      need(2, 2)
      targets.forEach((id) => (player(s, id).lover = true))
      a.cupid = [targets[0]!, targets[1]!]
      log(s, `Cupid ghép đôi ${names(targets)}.`, false)
      break
    case 'guard':
      need(0, 1)
      a.guard = targets[0] ?? null
      log(s, targets[0] ? `Bảo vệ che chở ${names(targets)}.` : 'Bảo vệ không chọn ai.', false)
      break
    case 'wolf':
      need(1, 1)
      a.wolf = targets[0] ?? null
      log(s, targets[0] ? `Bầy sói chọn ${names(targets)}.` : 'Bầy sói không còn ai để cắn.', false)
      break
    case 'whitewolf':
      need(0, 1)
      a.whitewolf = targets[0] ?? null
      log(
        s,
        targets[0] ? `Sói trắng chọn loại ${names(targets)}.` : 'Sói trắng không loại ai.',
        false,
      )
      break
    case 'witch': {
      assert(targets.length === 0, 'PICK_COUNT', 'Phù thủy dùng bình cứu/bình độc.')
      const parts: string[] = []
      if (cmd.heal) {
        assert(witchCanHeal(s), 'NO_HEAL', 'Không dùng được bình cứu lúc này.')
        a.witchHeal = true
        s.witch.heal = false
        parts.push('dùng bình cứu cho ' + player(s, a.wolf!).name)
      }
      if (cmd.poison) {
        assert(s.witch.poison, 'NO_POISON', 'Bình độc đã dùng.')
        check(cmd.poison, 'poison')
        a.witchPoison = cmd.poison
        s.witch.poison = false
        parts.push('đầu độc ' + player(s, cmd.poison).name)
      }
      log(
        s,
        parts.length ? 'Phù thủy ' + parts.join(', ') + '.' : 'Phù thủy không dùng bình.',
        false,
      )
      break
    }
    case 'seer': {
      assert(!a.seer, 'DONE', 'Tiên tri đã soi đêm nay.')
      need(1, 1)
      const t = player(s, targets[0]!)
      a.seer = t.id
      log(
        s,
        `Tiên tri soi ${t.name}: ${seerSeesWolf(s, t.roleId) ? 'Ma sói' : 'không phải Ma sói'}.`,
        false,
      )
      // Tiên tri nhận kết quả rồi mới "đi ngủ" bằng night.sleep.
      return s
    }
    case 'piper':
      need(2, 2)
      targets.forEach((id) => (player(s, id).charmed = true))
      a.piper = targets
      log(
        s,
        targets.length ? `Người thổi sáo mê hoặc ${names(targets)}.` : 'Không còn ai để mê hoặc.',
        false,
      )
      break
    default: {
      assert(targets.length === 0, 'PICK_COUNT', 'Vai tùy chỉnh do quản trò xử lý thủ công.')
      const note = cmd.note?.trim()
      a.notes = { ...a.notes, [key]: note ?? '' }
      log(s, `${info.title.replace('Gọi ', '')}: quản trò xử lý${note ? ` — ${note}` : ''}.`, false)
    }
  }
  n.step++
  return s
}

/** Kết quả soi của đêm hiện tại (chỉ dành cho máy quản trò). */
export function seerResult(s: GameState): { name: string; wolf: boolean } | null {
  const id = s.night?.actions.seer
  if (!id) return null
  const p = player(s, id)
  return { name: p.name, wolf: seerSeesWolf(s, p.roleId) }
}

/** Người sẽ bị loại khi trời sáng theo lựa chọn hiện tại (máy quản trò). */
export function predictedDeaths(s: GameState): string[] {
  const a = s.night?.actions
  if (!a) return []
  const out: string[] = []
  if (a.wolf && a.wolf !== a.guard && !a.witchHeal) out.push(a.wolf)
  for (const id of [a.whitewolf, a.witchPoison, ...(a.gmKills ?? [])])
    if (id && !out.includes(id)) out.push(id)
  return out
}
