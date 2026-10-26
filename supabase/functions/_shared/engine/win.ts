import { isPack, isWolfSide, winTeam } from './abilities.ts'
import type { GameState, Winner, WinnerTeam } from './types.ts'

export const WIN_TITLES: Record<WinnerTeam, string> = {
  village: 'Phe Dân làng chiến thắng',
  wolf: 'Phe Ma sói chiến thắng',
  lovers: 'Cặp đôi chiến thắng',
  whitewolf: 'Sói trắng chiến thắng',
  tanner: 'Kẻ chán đời chiến thắng',
  piper: 'Người thổi sáo chiến thắng',
  solo: 'Phe riêng chiến thắng',
  none: 'Không ai sống sót',
}

/** Người thắng theo phe khi quản trò kết thúc thủ công hoặc khi phe đó thắng. */
export function teamWinners(s: GameState, team: 'village' | 'wolf'): string[] {
  return s.players.filter((p) => winTeam(s, p.roleId) === team).map((p) => p.id)
}

/**
 * Xét điều kiện thắng. Chỉ gọi khi không còn hiệu ứng chờ.
 * Thứ tự ưu tiên (docs/ruleset.md):
 *  1. Không còn ai sống → không ai thắng.
 *  2. Kẻ chán đời vừa bị loại bằng phiếu.
 *  3. Cặp đôi khác phe là hai người cuối cùng.
 *  4. Sói trắng là người cuối cùng.
 *  5. Người thổi sáo còn sống và mọi người còn sống khác đều bị mê hoặc.
 *  6. Dân làng: không còn thành viên bầy sói và Người thổi sáo.
 *  7. Bầy sói: số Ma sói ≥ số người còn lại, và không còn Sói trắng/Người thổi sáo sống.
 */
export function detectWinner(s: GameState): Winner | null {
  const alive = s.players.filter((p) => p.alive)
  const make = (team: WinnerTeam, reason: string, winners: string[]): Winner => ({
    team,
    title: WIN_TITLES[team],
    reason,
    winners,
    manual: false,
  })

  if (alive.length === 0) return make('none', 'Không còn ai sống sót trong làng.', [])

  if (s.tannerVoted) {
    const t = s.players.find((p) => p.id === s.tannerVoted)
    return make(
      'tanner',
      `${t?.name ?? 'Kẻ chán đời'} là Kẻ chán đời và đã bị cả làng bỏ phiếu loại.`,
      [s.tannerVoted],
    )
  }

  if (alive.length === 2 && alive.every((p) => p.lover)) {
    const [a, b] = alive
    if (
      winTeam(s, a!.roleId) !== winTeam(s, b!.roleId) ||
      a!.roleId === 'whitewolf' ||
      b!.roleId === 'whitewolf'
    ) {
      return make('lovers', `Chỉ còn lại Cặp đôi khác phe: ${a!.name} và ${b!.name}.`, [
        a!.id,
        b!.id,
      ])
    }
  }

  if (alive.length === 1 && alive[0]!.roleId === 'whitewolf') {
    return make('whitewolf', 'Sói trắng là người duy nhất còn sống.', [alive[0]!.id])
  }

  const piper = alive.find((p) => p.roleId === 'piper')
  if (piper) {
    // Không còn ai khác cũng thỏa "mọi người còn sống khác đều bị mê hoặc".
    const others = alive.filter((p) => p.id !== piper.id)
    if (others.every((p) => p.charmed)) {
      return make('piper', 'Mọi người còn sống đều đã bị Người thổi sáo mê hoặc.', [piper.id])
    }
  }

  const packAlive = alive.filter((p) => isPack(s, p.roleId))
  if (packAlive.length === 0 && !piper) {
    return make('village', 'Mọi Ma sói đã bị loại khỏi làng.', teamWinners(s, 'village'))
  }

  const wolves = alive.filter((p) => isWolfSide(s, p.roleId))
  const rest = alive.length - wolves.length
  const soloThreat = alive.some((p) => p.roleId === 'whitewolf') || !!piper
  if (wolves.length > 0 && wolves.length >= rest && !soloThreat) {
    return make(
      'wolf',
      `Số Ma sói còn sống (${wolves.length}) đã bằng hoặc nhiều hơn số người còn lại (${rest}).`,
      teamWinners(s, 'wolf'),
    )
  }
  return null
}
