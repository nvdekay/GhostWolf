import { findRoleDef } from './catalog.ts'
import { assert } from './errors.ts'
import type { Counts, Player, RoleDef, SeatInput } from './types.ts'

/** Số nguyên ngẫu nhiên đều trong [0, max). Phía server dùng CSPRNG. */
export type RandomInt = (max: number) => number

export function buildDeck(counts: Counts): string[] {
  return Object.entries(counts).flatMap(([id, c]) => Array<string>(c).fill(id))
}

/** Kiểm tra bộ vai có chia được cho n người không; trả về thông báo lỗi hoặc null. */
export function deckProblem(counts: Counts, n: number, custom: RoleDef[]): string | null {
  for (const [id, c] of Object.entries(counts)) {
    if (!Number.isInteger(c) || c < 0) return 'Số lượng vai không hợp lệ.'
    if (c > 0 && !findRoleDef(id, custom)) return `Vai không tồn tại: ${id}`
  }
  const total = buildDeck(counts).length
  if (total < n) return `Thiếu ${n - total} thẻ cho ${n} người chơi.`
  if (total > n) return `Thừa ${total - n} thẻ cho ${n} người chơi.`
  const wolves = Object.entries(counts).reduce(
    (a, [id, c]) => a + (findRoleDef(id, custom)?.team === 'wolf' ? c : 0),
    0,
  )
  if (wolves === 0) return 'Bộ vai cần ít nhất một Ma sói.'
  return null
}

/** Fisher–Yates. */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

export function freshPlayer(seat: SeatInput, roleId: string): Player {
  return {
    id: seat.id,
    name: seat.name,
    seat: seat.seat,
    device: seat.device,
    roleId,
    alive: true,
    death: null,
    lover: false,
    chief: false,
    charmed: false,
    revealed: false,
    canVote: true,
    triggered: {},
  }
}

export function dealPlayers(
  counts: Counts,
  seats: SeatInput[],
  custom: RoleDef[],
  randomInt: RandomInt,
): Player[] {
  const problem = deckProblem(counts, seats.length, custom)
  assert(!problem, 'DECK_INVALID', problem ?? '')
  const deck = shuffle(buildDeck(counts), randomInt)
  return [...seats].sort((a, b) => a.seat - b.seat).map((s, i) => freshPlayer(s, deck[i]!))
}

/** RandomInt dùng Web Crypto (có ở Deno và trình duyệt), rejection sampling để không lệch. */
export const cryptoRandomInt: RandomInt = (max) => {
  if (max <= 1) return 0
  const limit = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0]! < limit) return buf[0]! % max
  }
}
