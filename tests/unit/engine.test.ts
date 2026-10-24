import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createGame,
  dealPlayers,
  deckProblem,
  detectWinner,
  EngineError,
  PRESETS,
  publicView,
  suggestCounts,
  type GameState,
} from '@engine'
import { act, P, rng, run, startedGame } from './helpers'

const seats = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: 'm' + i, name: 'N' + i, seat: i + 1, device: true }))

const expectError = (fn: () => unknown, code: string) => {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(EngineError)
    expect((e as EngineError).code).toBe(code)
    return
  }
  throw new Error('Mong đợi lỗi ' + code)
}

describe('chia bài', () => {
  it('chia đúng số thẻ của từng vai', () => {
    for (const [n, counts] of Object.entries(PRESETS)) {
      const players = dealPlayers(counts, seats(Number(n)), [], rng)
      const got: Record<string, number> = {}
      players.forEach((p) => (got[p.roleId] = (got[p.roleId] ?? 0) + 1))
      expect(got).toEqual(counts)
    }
  })

  it('mỗi vai rơi vào mỗi ghế với tần suất đều (Fisher–Yates)', () => {
    const counts = { wolf: 1, villager: 3 }
    const hits = [0, 0, 0, 0]
    const N = 20000
    for (let i = 0; i < N; i++) {
      const ps = dealPlayers(counts, seats(4), [], rng)
      hits[ps.findIndex((p) => p.roleId === 'wolf')]!++
    }
    hits.forEach((h) => expect(Math.abs(h / N - 0.25)).toBeLessThan(0.02))
  })

  it('từ chối bộ vai thiếu/thừa thẻ hoặc không có Ma sói', () => {
    expect(deckProblem({ wolf: 1, villager: 2 }, 4, [])).toMatch(/Thiếu 1/)
    expect(deckProblem({ wolf: 1, villager: 4 }, 4, [])).toMatch(/Thừa 1/)
    expect(deckProblem({ whitewolf: 1, villager: 3 }, 4, [])).toMatch(/Ma sói/)
    expect(deckProblem({ wolf: 1, villager: 3 }, 4, [])).toBeNull()
  })

  it('gợi ý cho số người không có preset, không vượt số người', () => {
    for (const n of [4, 5, 7, 9, 13, 25]) {
      const { counts } = suggestCounts(n)
      expect(deckProblem(counts, n, [])).toBeNull()
    }
  })

  it('không chia lại hoặc đổi bộ vai sau khi gửi', () => {
    let g = createGame('x', {}, { wolf: 1, villager: 3 }, [])
    g = applyCommand(g, { type: 'deal' }, { randomInt: rng, seats: seats(4) })
    g = applyCommand(g, { type: 'send' }, { randomInt: rng })
    expectError(
      () => applyCommand(g, { type: 'deal' }, { randomInt: rng, seats: seats(4) }),
      'BAD_STATUS',
    )
    expectError(
      () =>
        applyCommand(g, { type: 'deck.set', counts: { wolf: 2, villager: 2 } }, { randomInt: rng }),
      'BAD_STATUS',
    )
  })
})

describe('đêm', () => {
  it('thứ tự gọi theo mock và chỉ cho vai có trong ván', () => {
    const g = startedGame([
      'cupid',
      'guard',
      'wolf',
      'witch',
      'seer',
      'piper',
      'whitewolf',
      'villager',
    ])
    expect(g.night!.steps).toEqual(['cupid', 'guard', 'wolf', 'witch', 'seer', 'piper'])
    const g2 = startedGame(['wolf', 'villager', 'villager', 'villager'])
    expect(g2.night!.steps).toEqual(['wolf'])
  })

  it('Sói trắng chỉ có lượt riêng vào đêm chẵn', () => {
    let g = startedGame(['whitewolf', 'wolf', 'villager', 'villager', 'villager', 'villager'])
    expect(g.night!.steps).toEqual(['wolf'])
    g = act(g, 'wolf', { targets: ['p2'] })
    g = run(
      g,
      { type: 'night.end' },
      { type: 'day.goto', step: 'discuss' },
      { type: 'day.goto', step: 'vote' },
      { type: 'vote.skip' },
      { type: 'night.start' },
    )
    expect(g.night!.steps).toEqual(['wolf', 'whitewolf'])
  })

  it('không cho vượt bước, làm lại bước, hay xác nhận bước cũ', () => {
    let g = startedGame(['guard', 'wolf', 'villager', 'villager'])
    expectError(
      () => run(g, { type: 'night.act', step: 'wolf', stepIndex: 1, targets: ['p2'] }),
      'STEP_STALE',
    )
    expectError(() => run(g, { type: 'night.end' }), 'NIGHT_UNFINISHED')
    g = act(g, 'guard', { targets: ['p2'] })
    expectError(
      () => run(g, { type: 'night.act', step: 'guard', stepIndex: 0, targets: ['p3'] }),
      'STEP_STALE',
    )
  })

  it('Bảo vệ cứu người bị cắn; không bảo vệ cùng người hai đêm liền', () => {
    let g = startedGame(['guard', 'wolf', 'villager', 'villager', 'villager'])
    g = act(g, 'guard', { targets: ['p2'] })
    g = act(g, 'wolf', { targets: ['p2'] })
    g = run(g, { type: 'night.end' })
    expect(P(g, 2).alive).toBe(true)
    expect(g.lastDeaths).toEqual([])
    g = run(
      g,
      { type: 'day.goto', step: 'discuss' },
      { type: 'day.goto', step: 'vote' },
      { type: 'vote.skip' },
      { type: 'night.start' },
    )
    expectError(() => act(g, 'guard', { targets: ['p2'] }), 'BAD_TARGET')
  })

  it('bầy sói không cắn thành viên bầy (kể cả Sói trắng)', () => {
    const g = startedGame(['wolf', 'whitewolf', 'villager', 'villager', 'villager'])
    expectError(() => act(g, 'wolf', { targets: ['p1'] }), 'BAD_TARGET')
  })

  it('bầy sói vẫn cắn khi chỉ còn Sói trắng', () => {
    let g = startedGame(['wolf', 'whitewolf', 'villager', 'villager', 'villager', 'villager'])
    g = run(g, { type: 'player.kill', playerId: 'p0' })
    g = act(g, 'wolf', { targets: ['p2'] })
    g = run(g, { type: 'night.end' })
    expect(P(g, 0).alive).toBe(false)
    expect(P(g, 2).alive).toBe(false)
    g = run(
      g,
      { type: 'day.goto', step: 'discuss' },
      { type: 'day.goto', step: 'vote' },
      { type: 'vote.skip' },
      { type: 'night.start' },
    )
    expect(g.night!.steps[0]).toBe('wolf')
    g = act(g, 'wolf', { targets: ['p3'] })
    expect(g.night!.actions.wolf).toBe('p3')
  })

  it('Phù thủy: mỗi bình dùng một lần, tài nguyên giữ qua đêm', () => {
    let g = startedGame(['witch', 'wolf', 'villager', 'villager', 'villager', 'villager'])
    g = act(g, 'wolf', { targets: ['p2'] })
    g = act(g, 'witch', { heal: true, poison: 'p3' })
    g = run(g, { type: 'night.end' })
    expect(P(g, 2).alive).toBe(true)
    expect(P(g, 3).alive).toBe(false)
    expect(P(g, 3).death?.cause).toBe('poison')
    expect(g.witch).toEqual({ heal: false, poison: false })
    g = run(
      g,
      { type: 'day.goto', step: 'discuss' },
      { type: 'day.goto', step: 'vote' },
      { type: 'vote.skip' },
      { type: 'night.start' },
    )
    g = act(g, 'wolf', { targets: ['p4'] })
    expectError(() => act(g, 'witch', { heal: true }), 'NO_HEAL')
    expectError(() => act(g, 'witch', { poison: 'p5' }), 'NO_POISON')
  })

  it('luật Phù thủy tự cứu theo cấu hình', () => {
    let g = startedGame(['witch', 'wolf', 'villager', 'villager'], { witchSelfHeal: false })
    g = act(g, 'wolf', { targets: ['p0'] })
    expectError(() => act(g, 'witch', { heal: true }), 'NO_HEAL')
  })

  it('Tiên tri nhận kết quả rồi mới đi ngủ; Sói trắng hiện là Ma sói', () => {
    let g = startedGame(['seer', 'whitewolf', 'wolf', 'villager', 'villager'])
    g = act(g, 'wolf', { targets: ['p3'] })
    g = run(g, { type: 'night.act', step: 'seer', stepIndex: 1, targets: ['p1'] })
    expect(g.night!.step).toBe(1)
    expect(g.log.at(-1)!.text).toMatch(/Ma sói/)
    expectError(
      () => run(g, { type: 'night.act', step: 'seer', stepIndex: 1, targets: ['p2'] }),
      'DONE',
    )
    g = run(g, { type: 'night.sleep', step: 'seer', stepIndex: 1 })
    expect(g.night!.step).toBe(2)
  })

  it('vai đã chết vẫn được gọi nhưng không được hành động', () => {
    let g = startedGame(['seer', 'wolf', 'villager', 'villager', 'villager'])
    g = act(g, 'wolf', { targets: ['p0'] })
    g = act(g, 'seer', { targets: ['p1'] })
    g = run(
      g,
      { type: 'night.end' },
      { type: 'day.goto', step: 'discuss' },
      { type: 'day.goto', step: 'vote' },
      { type: 'vote.skip' },
      { type: 'night.start' },
    )
    expect(g.night!.steps).toContain('seer')
    g = act(g, 'wolf', { targets: ['p2'] })
    expectError(
      () => run(g, { type: 'night.act', step: 'seer', stepIndex: 1, targets: ['p1'] }),
      'ACTOR_DEAD',
    )
    g = run(g, { type: 'night.act', step: 'seer', stepIndex: 1 })
    expect(g.night!.step).toBe(2)
  })

  it('loại thủ công ban đêm chỉ công bố lúc trời sáng', () => {
    let g = startedGame(['wolf', 'villager', 'villager', 'villager', 'villager'])
    g = run(g, { type: 'player.kill', playerId: 'p1' })
    expect(P(g, 1).alive).toBe(true)
    expect(publicView(g).players[1]!.alive).toBe(true)
    g = act(g, 'wolf', { targets: ['p2'] })
    g = run(g, { type: 'night.end' })
    expect(
      publicView(g)
        .announcements.map((a) => a.id)
        .sort(),
    ).toEqual(['p1', 'p2'])
  })

  it('Người thổi sáo thắng khi mọi người còn sống đều bị mê hoặc', () => {
    let g = startedGame(['piper', 'wolf', 'villager', 'villager'])
    g = act(g, 'wolf', { targets: ['p2'] })
    g = act(g, 'piper', { targets: ['p1', 'p3'] })
    g = run(g, { type: 'night.end' })
    expect(g.winner?.team).toBe('piper')
    expect(g.winner?.winners).toEqual(['p0'])
  })
})

describe('chết dây chuyền và hiệu ứng', () => {
  it('Cặp đôi chết theo; Thợ săn được bắn; không chốt thắng khi còn hiệu ứng', () => {
    let g = startedGame(['cupid', 'wolf', 'hunter', 'villager', 'villager', 'villager'])
    g = act(g, 'cupid', { targets: ['p2', 'p3'] })
    g = act(g, 'wolf', { targets: ['p3'] })
    g = run(g, { type: 'night.end' })
    expect(P(g, 3).death?.cause).toBe('wolf')
    expect(P(g, 2).death?.cause).toBe('lover')
    expect(g.effects).toHaveLength(1)
    expect(g.effects[0]!.kind).toBe('hunter')
    expectError(() => run(g, { type: 'day.goto', step: 'discuss' }), 'EFFECT_PENDING')
    g = run(g, { type: 'effect.resolve', effectId: g.effects[0]!.id, target: 'p1' })
    expect(P(g, 1).death?.cause).toBe('hunter')
    expect(g.winner?.team).toBe('village')
  })

  it('Thợ săn trúng độc không bắn (mặc định), bắn được nếu bật luật', () => {
    const play = (shoot: boolean) => {
      let g = startedGame(['witch', 'wolf', 'hunter', 'villager', 'villager', 'villager'], {
        hunterShootsWhenPoisoned: shoot,
      })
      g = act(g, 'wolf', { targets: ['p3'] })
      g = act(g, 'witch', { poison: 'p2' })
      return run(g, { type: 'night.end' })
    }
    expect(play(false).effects).toHaveLength(0)
    expect(play(true).effects).toHaveLength(1)
  })

  it('hiệu ứng không kích hoạt lại sau hồi sinh rồi chết lần nữa', () => {
    let g = startedGame(['hunter', 'wolf', 'villager', 'villager', 'villager', 'villager'])
    g = act(g, 'wolf', { targets: ['p0'] })
    g = run(g, { type: 'night.end' })
    g = run(g, { type: 'effect.resolve', effectId: g.effects[0]!.id, target: null })
    g = run(g, { type: 'player.revive', playerId: 'p0' }, { type: 'player.kill', playerId: 'p0' })
    expect(g.effects).toHaveLength(0)
  })

  it('Trưởng làng chết thì chỉ định người kế nhiệm', () => {
    let g = startedGame(['wolf', 'villager', 'villager', 'villager', 'villager'])
    g = act(g, 'wolf', { targets: ['p2'] })
    g = run(g, { type: 'night.end' }, { type: 'player.setChief', playerId: 'p1' })
    g = run(g, { type: 'day.goto', step: 'discuss' }, { type: 'day.goto', step: 'vote' })
    g = run(g, { type: 'vote.tally', votes: { p1: 3 }, chiefVote: null })
    g = run(g, { type: 'vote.eliminate', target: 'p1' })
    expect(g.effects.map((e) => e.kind)).toEqual(['succession'])
    expectError(() => run(g, { type: 'night.start' }), 'EFFECT_PENDING')
    g = run(g, { type: 'effect.resolve', effectId: g.effects[0]!.id, target: 'p3' })
    expect(P(g, 3).chief).toBe(true)
    expect(P(g, 1).chief).toBe(false)
  })

  it('Thằng ngốc bị phiếu lần đầu: lộ vai, còn sống, mất quyền bầu', () => {
    let g = startedGame(['idiot', 'wolf', 'villager', 'villager', 'villager'])
    g = act(g, 'wolf', { targets: ['p2'] })
    g = run(
      g,
      { type: 'night.end' },
      { type: 'day.goto', step: 'discuss' },
      { type: 'day.goto', step: 'vote' },
    )
    g = run(
      g,
      { type: 'vote.tally', votes: { p0: 3 }, chiefVote: null },
      { type: 'vote.eliminate', target: 'p0' },
    )
    expect(P(g, 0).alive).toBe(true)
    expect(P(g, 0).canVote).toBe(false)
    expect(publicView(g).players[0]!.role?.id).toBe('idiot')
    // Lần sau bị phiếu thì chết như thường.
    g = run(g, { type: 'night.start' })
    g = act(g, 'wolf', { targets: ['p3'] })
    g = run(
      g,
      { type: 'night.end' },
      { type: 'day.goto', step: 'discuss' },
      { type: 'day.goto', step: 'vote' },
    )
    g = run(
      g,
      { type: 'vote.tally', votes: { p0: 1 }, chiefVote: null },
      { type: 'vote.eliminate', target: 'p0' },
    )
    expect(P(g, 0).alive).toBe(false)
  })
})

describe('bỏ phiếu', () => {
  const dayGame = (roles: string[]) => {
    let g = startedGame(roles)
    g = act(g, 'wolf', { targets: [g.players.find((p) => p.roleId === 'villager')!.id] })
    return run(
      g,
      { type: 'night.end' },
      { type: 'day.goto', step: 'discuss' },
      { type: 'day.goto', step: 'vote' },
    )
  }

  it('không cho tổng phiếu vượt số người có quyền bầu', () => {
    const g = dayGame(['wolf', 'villager', 'villager', 'villager', 'villager'])
    // 5 người, 1 chết → 4 người bầu.
    expectError(
      () => run(g, { type: 'vote.tally', votes: { p0: 3, p2: 2 }, chiefVote: null }),
      'VOTE_OVER',
    )
    const r = run(g, { type: 'vote.tally', votes: { p0: 2, p2: 1 }, chiefVote: null })
    expect(r.dayState!.result!.abstain).toBe(1)
  })

  it('không bầu cho người đã chết', () => {
    const g = dayGame(['wolf', 'villager', 'villager', 'villager', 'villager'])
    expectError(
      () => run(g, { type: 'vote.tally', votes: { p1: 1 }, chiefVote: null }),
      'VOTE_TARGET',
    )
  })

  it('trọng số Trưởng làng nhập riêng, phải nằm trong phiếu đếm tay', () => {
    let g = dayGame(['wolf', 'villager', 'villager', 'villager', 'villager'])
    g = run(g, { type: 'player.setChief', playerId: 'p2' })
    expectError(
      () => run(g, { type: 'vote.tally', votes: { p0: 2, p3: 2 }, chiefVote: 'p4' }),
      'VOTE_CHIEF',
    )
    const r = run(g, { type: 'vote.tally', votes: { p0: 2, p3: 2 }, chiefVote: 'p0' })
    expect(r.dayState!.result!.tally).toEqual({ p0: 3, p3: 2 })
    expect(r.dayState!.result!.top).toEqual(['p0'])
  })

  it('hòa: bầu lại trong nhóm hòa; quyết định của quản trò cần lý do', () => {
    let g = dayGame(['wolf', 'villager', 'villager', 'villager', 'villager'])
    g = run(g, { type: 'vote.tally', votes: { p0: 2, p3: 2 }, chiefVote: null })
    expectError(() => run(g, { type: 'vote.eliminate', target: 'p0' }), 'NEED_REASON')
    g = run(g, { type: 'vote.revote' })
    expect(g.dayState!.voteOnly).toEqual(['p0', 'p3'])
    expectError(
      () => run(g, { type: 'vote.tally', votes: { p2: 1 }, chiefVote: null }),
      'VOTE_TARGET',
    )
    g = run(g, { type: 'vote.tally', votes: { p0: 2, p3: 2 }, chiefVote: null })
    g = run(g, { type: 'vote.eliminate', target: 'p0', reason: 'Quản trò rút thăm' })
    expect(P(g, 0).death?.cause).toBe('vote')
    expect(g.winner?.team).toBe('village')
  })

  it('không sang đêm khi chưa xử lý bỏ phiếu; không vượt bước ngày', () => {
    let g = startedGame(['wolf', 'villager', 'villager', 'villager', 'villager'])
    g = act(g, 'wolf', { targets: ['p1'] })
    g = run(g, { type: 'night.end' })
    expectError(() => run(g, { type: 'day.goto', step: 'vote' }), 'DAY_SKIP')
    expectError(() => run(g, { type: 'night.start' }), 'DAY_UNRESOLVED')
  })
})

describe('điều kiện thắng', () => {
  const base = (roles: string[]) => startedGame(roles)
  const killAll = (g: GameState, ids: string[]) => {
    // Ban ngày, loại thủ công ngay.
    let s = g
    for (const id of ids) s = run(s, { type: 'player.kill', playerId: id })
    return s
  }
  const toDay = (g: GameState, target: string) =>
    run(act(g, 'wolf', { targets: [target] }), { type: 'night.end' })

  it('bầy sói thắng khi số sói ≥ số người còn lại', () => {
    let g = base(['wolf', 'wolf', 'villager', 'villager', 'villager', 'villager'])
    g = toDay(g, 'p2')
    expect(g.winner).toBeNull()
    g = killAll(g, ['p3'])
    expect(g.winner?.team).toBe('wolf')
    expect(g.winner?.winners).toEqual(['p0', 'p1'])
  })

  it('bầy sói chưa thắng khi Sói trắng còn sống', () => {
    let g = base(['wolf', 'whitewolf', 'villager', 'villager', 'villager'])
    g = toDay(g, 'p2')
    g = killAll(g, ['p3'])
    expect(g.winner).toBeNull()
  })

  it('Sói trắng sống cuối cùng thắng cá nhân', () => {
    let g = base(['wolf', 'whitewolf', 'villager', 'villager'])
    g = toDay(g, 'p2')
    g = killAll(g, ['p3', 'p0'])
    expect(g.winner?.team).toBe('whitewolf')
    expect(g.winner?.winners).toEqual(['p1'])
  })

  it('Cặp đôi khác phe thắng khi là hai người cuối; cùng phe thì phe của họ thắng', () => {
    let g = base(['cupid', 'wolf', 'villager', 'villager'])
    g = act(g, 'cupid', { targets: ['p1', 'p2'] })
    g = toDay(g, 'p3')
    g = killAll(g, ['p0'])
    expect(g.winner?.team).toBe('lovers')
    expect(g.winner?.winners.sort()).toEqual(['p1', 'p2'])

    let h = base(['cupid', 'wolf', 'villager', 'villager', 'villager'])
    h = act(h, 'cupid', { targets: ['p2', 'p3'] })
    h = toDay(h, 'p4')
    h = killAll(h, ['p1'])
    expect(h.winner?.team).toBe('village')
  })

  it('Kẻ chán đời thắng khi bị loại bằng phiếu, không phải khi chết đêm', () => {
    let g = base(['tanner', 'wolf', 'villager', 'villager', 'villager'])
    g = toDay(g, 'p2')
    g = run(g, { type: 'day.goto', step: 'discuss' }, { type: 'day.goto', step: 'vote' })
    g = run(
      g,
      { type: 'vote.tally', votes: { p0: 3 }, chiefVote: null },
      { type: 'vote.eliminate', target: 'p0' },
    )
    expect(g.winner?.team).toBe('tanner')
    expect(g.winner?.winners).toEqual(['p0'])
  })

  it('không còn ai sống: không ai thắng', () => {
    const g = base(['wolf', 'villager', 'villager', 'villager'])
    g.players.forEach((p) => (p.alive = false))
    expect(detectWinner(g)?.team).toBe('none')
  })

  it('nhiều cái chết cùng lúc: Cặp đôi + Thợ săn giải quyết xong mới xét thắng', () => {
    let g = base(['cupid', 'wolf', 'hunter', 'villager', 'wolf', 'villager'])
    g = act(g, 'cupid', { targets: ['p2', 'p3'] })
    g = act(g, 'wolf', { targets: ['p3'] })
    g = run(g, { type: 'night.end' })
    // p3 bị cắn, p2 (Thợ săn) chết theo → còn 2 sói vs 2 người: chưa chốt vì Thợ săn chưa bắn.
    expect(g.winner).toBeNull()
    g = run(g, { type: 'effect.resolve', effectId: g.effects[0]!.id, target: 'p1' })
    expect(g.winner).toBeNull()
  })

  it('kết thúc thủ công và không thao tác sau khi kết thúc', () => {
    let g = base(['wolf', 'villager', 'villager', 'villager'])
    g = run(g, { type: 'finish', team: 'none' })
    expect(g.status).toBe('ended')
    expectError(() => run(g, { type: 'player.kill', playerId: 'p1' }), 'BAD_STATUS')
    expectError(() => run(g, { type: 'reset' }), 'BAD_STATUS')
  })

  it('đã có người thắng thì chặn thao tác khác cho tới khi kết thúc', () => {
    let g = base(['wolf', 'villager', 'villager', 'villager'])
    g = toDay(g, 'p1')
    g = killAll(g, ['p2'])
    expect(g.winner?.team).toBe('wolf')
    expectError(() => run(g, { type: 'day.goto', step: 'discuss' }), 'HAS_WINNER')
    g = run(g, { type: 'finish' })
    expect(g.status).toBe('ended')
  })
})

describe('reset và dữ liệu công khai', () => {
  it('reset về Đêm 1 giữ vai, xóa trạng thái và tài nguyên', () => {
    let g = startedGame(['cupid', 'witch', 'wolf', 'villager', 'villager'])
    g = act(g, 'cupid', { targets: ['p3', 'p4'] })
    g = act(g, 'wolf', { targets: ['p3'] })
    g = act(g, 'witch', { heal: true })
    g = run(g, { type: 'night.end' }, { type: 'reset' })
    expect(g.players.map((p) => p.roleId)).toEqual([
      'cupid',
      'witch',
      'wolf',
      'villager',
      'villager',
    ])
    expect(g.players.every((p) => p.alive && !p.lover)).toBe(true)
    expect(g.witch).toEqual({ heal: true, poison: true })
    expect(g.day).toBe(1)
    expect(g.phase).toBe('night')
  })

  it('public view không chứa vai, mục tiêu, tài nguyên hay nhật ký riêng trước khi kết thúc', () => {
    let g = startedGame(['cupid', 'seer', 'witch', 'wolf', 'villager', 'villager'])
    g = act(g, 'cupid', { targets: ['p4', 'p5'] })
    g = act(g, 'wolf', { targets: ['p4'] })
    g = act(g, 'witch', { heal: true })
    const json = JSON.stringify(publicView(g))
    for (const secret of [
      'cupid',
      'seer',
      'witch',
      'wolf',
      'villager',
      'lover',
      'heal',
      'poison',
      'Cupid ghép',
      'Bầy sói chọn',
    ]) {
      expect(json).not.toContain(secret)
    }
    const ended = run(g, { type: 'finish', team: 'none' })
    expect(JSON.stringify(publicView(ended))).toContain('"id":"wolf"')
  })
})
