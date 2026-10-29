import { findRoleDef, MAX_PLAYERS, MAX_ROLE_KINDS, SINGLETON_ROLE_IDS } from './catalog.ts'
import { assert } from './errors.ts'
import type { Counts, Player, RoleDef, SeatInput } from './types.ts'

/** Số nguyên ngẫu nhiên đều trong [0, max). Phía server dùng CSPRNG. */
export type RandomInt = (max: number) => number

/** Chỉ gọi sau khi `countsProblem` đã kiểm tra số lượng (tránh tạo mảng khổng lồ). */
export function buildDeck(counts: Counts): string[] {
  return Object.entries(counts).flatMap(([id, c]) => Array<string>(c).fill(id))
}

/** Kiểm tra số lượng (không cần biết vai): số loại, từng số và tổng nằm trong giới hạn. */
export function countsProblem(counts: Counts): string | null {
  const entries = Object.entries(counts)
  if (entries.length > MAX_ROLE_KINDS) return 'Bộ vai có quá nhiều loại vai.'
  let total = 0
  for (const [id, c] of entries) {
    if (!Number.isInteger(c) || c < 0 || c > MAX_PLAYERS) return 'Số lượng vai không hợp lệ.'
    if (c > 1 && SINGLETON_ROLE_IDS.has(id))
      return `${findRoleDef(id)?.name ?? id} chỉ được có một thẻ trong bộ vai.`
    total += c
  }
  if (total > MAX_PLAYERS) return `Bộ vai tối đa ${MAX_PLAYERS} thẻ.`
  return null
}

/** Kiểm tra bộ vai có chia được cho n người không; trả về thông báo lỗi hoặc null. */
export function deckProblem(counts: Counts, n: number, custom: RoleDef[]): string | null {
  if (n > MAX_PLAYERS) return `Tối đa ${MAX_PLAYERS} người chơi.`
  const bad = countsProblem(counts)
  if (bad) return bad
  for (const [id, c] of Object.entries(counts)) {
    if (c > 0 && !findRoleDef(id, custom)) return `Vai không tồn tại: ${id}`
  }
  const total = Object.values(counts).reduce((a, c) => a + c, 0)
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
