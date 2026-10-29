// Regression cho các lỗi engine/validation tìm thấy trong audit (SEC-01, RULE-01, RULE-02).
import { describe, expect, it } from 'vitest'
import {
  applyCommand,
  createGame,
  deckProblem,
  detectWinner,
  EngineError,
  MAX_PLAYERS,
  MAX_ROLE_KINDS,
} from '@engine'
import { parseGameCommand } from '../../supabase/functions/_shared/commands.ts'
import { act, rng, run, startedGame } from './helpers'

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

const seats = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: 'm' + i, name: 'N' + i, seat: i + 1, device: true }))

const HUGE = [
  Number.MAX_SAFE_INTEGER,
  1e9,
  2 ** 31,
  MAX_PLAYERS + 1,
  -1,
  Number.MIN_SAFE_INTEGER,
  1.5,
]

describe('SEC-01: giới hạn số lượng vai và phiếu', () => {
  it('parser từ chối bộ vai có số lượng phi lý', () => {
    for (const c of HUGE)
      expect(parseGameCommand({ type: 'deck.set', counts: { villager: c } })).toBeNull()
    const many = Object.fromEntries(
      Array.from({ length: MAX_ROLE_KINDS + 1 }, (_, i) => ['k' + i, 0]),
    )
    expect(parseGameCommand({ type: 'deck.set', counts: many })).toBeNull()
    expect(
      parseGameCommand({ type: 'deck.set', counts: { wolf: 1, villager: MAX_PLAYERS } }),
    ).not.toBeNull()
  })

  it('parser từ chối phiếu có số lượng phi lý', () => {
    for (const v of HUGE)
      expect(parseGameCommand({ type: 'vote.tally', votes: { p1: v } })).toBeNull()
  })

  it('engine từ chối ngay (không tạo mảng) khi gọi trực tiếp, kể cả tổng vượt giới hạn', () => {
    const g = createGame('Test', {}, {}, [])
    for (const c of HUGE)
      expectError(
        () => applyCommand(g, { type: 'deck.set', counts: { villager: c } }, { randomInt: rng }),
        'DECK_INVALID',
      )
    // Mỗi số hợp lệ nhưng tổng vượt MAX_PLAYERS.
    expectError(
      () =>
        applyCommand(
          g,
          { type: 'deck.set', counts: { villager: MAX_PLAYERS, wolf: 1 } },
          { randomInt: rng },
        ),
      'DECK_INVALID',
    )
  })

  it('deckProblem trả lỗi nhanh với số cực lớn và với quá nhiều người', () => {
    const t = Date.now()
    expect(deckProblem({ villager: Number.MAX_SAFE_INTEGER }, 4, [])).toMatch(/không hợp lệ/)
    expect(Date.now() - t).toBeLessThan(50)
    const n = MAX_PLAYERS + 1
    expect(deckProblem({ wolf: 1, villager: n - 1 }, n, [])).toMatch(/Tối đa/)
  })

  it('không chia vai cho phòng vượt quá số người tối đa', () => {
    // Bộ vai khớp đúng số ghế: chỉ giới hạn số người mới chặn được.
    const g = createGame('Test', {}, { wolf: 1, villager: MAX_PLAYERS }, [])
    expectError(
      () => applyCommand(g, { type: 'deal' }, { randomInt: rng, seats: seats(MAX_PLAYERS + 1) }),
      'DECK_INVALID',
    )
  })
})

describe('RULE-01: Người thổi sáo sống một mình', () => {
  it('thắng khi mọi người khác đã bị loại (không cần ai bị mê hoặc)', () => {
    let g = startedGame(['piper', 'wolf', 'villager', 'villager'])
    g = act(g, 'wolf', { targets: ['p2'] })
    g = act(g, 'piper', { targets: ['p1', 'p2'] })
    g = run(g, { type: 'night.end' })
    // p2 bị cắn; còn p0 (sáo), p1 (sói, bị mê hoặc), p3 (dân, chưa bị mê hoặc).
    expect(g.winner).toBeNull()
    g = run(g, { type: 'player.kill', playerId: 'p1' }, { type: 'player.kill', playerId: 'p3' })
    expect(g.players.filter((p) => p.alive).map((p) => p.id)).toEqual(['p0'])
    expect(g.winner?.team).toBe('piper')
    expect(g.winner?.winners).toEqual(['p0'])
  })

  it('detectWinner: chỉ còn Người thổi sáo → Người thổi sáo thắng', () => {
    const g = startedGame(['piper', 'wolf', 'villager', 'villager'])
    g.players.forEach((p) => (p.alive = p.roleId === 'piper'))
    expect(detectWinner(g)?.team).toBe('piper')
  })
})

describe('RULE-02: ngày chỉ đi tới bước kế tiếp', () => {
  const day = () =>
    run(
      act(startedGame(['wolf', 'villager', 'villager', 'villager']), 'wolf', { targets: ['p1'] }),
      {
        type: 'night.end',
      },
    )

  it('không quay lại bước trước', () => {
    let g = run(day(), { type: 'day.goto', step: 'discuss' })
    expectError(() => run(g, { type: 'day.goto', step: 'announce' }), 'DAY_BACK')
    g = run(g, { type: 'day.goto', step: 'vote' })
    expectError(() => run(g, { type: 'day.goto', step: 'discuss' }), 'DAY_BACK')
    expectError(() => run(g, { type: 'day.goto', step: 'announce' }), 'DAY_BACK')
  })

  it('giữ nguyên bước hiện tại là không đổi gì; vẫn không được bỏ qua bước', () => {
    const g = day()
    expect(run(g, { type: 'day.goto', step: 'announce' }).dayState).toEqual(g.dayState)
    expectError(() => run(g, { type: 'day.goto', step: 'vote' }), 'DAY_SKIP')
  })
})

describe('RULE-03: số bản sao mỗi vai', () => {
  it('chỉ cho một thẻ với vai chuẩn có state riêng', () => {
    expect(deckProblem({ wolf: 1, seer: 2, villager: 1 }, 4, [])).toContain(
      'Tiên tri chỉ được có một thẻ',
    )
    expect(deckProblem({ wolf: 1, witch: 2, villager: 1 }, 4, [])).toContain(
      'Phù thủy chỉ được có một thẻ',
    )
  })

  it('cho nhiều Dân làng, Ma sói và vai tùy chỉnh do quản trò xử lý', () => {
    const custom = {
      id: 'custom:test',
      name: 'Vai nhóm',
      team: 'village' as const,
      icon: 'sparkles' as const,
      short: '',
      skill: '',
      wake: '',
      custom: true,
    }
    expect(deckProblem({ wolf: 2, villager: 2 }, 4, [])).toBeNull()
    expect(deckProblem({ wolf: 1, villager: 1, 'custom:test': 2 }, 4, [custom])).toBeNull()
  })
})
