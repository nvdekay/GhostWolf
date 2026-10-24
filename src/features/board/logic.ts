import type { Game, GamePlayer, KillCause } from '@/types/game'
import { allRoles, findRole, isWolfTeam } from '@/features/roles/roles'

export interface StepDef {
  role: string
  title: string
  script: string
  /** Số người quản trò cần chọn trong lượt gọi. */
  pick: number
  hint?: string
  optional?: boolean
  gm?: boolean
}

const STEPS: Record<string, Omit<StepDef, 'role'>> = {
  cupid: {
    title: 'Gọi Cupid',
    script:
      'Cupid hãy thức dậy và chỉ vào hai người sẽ thành Cặp đôi. Cupid đi ngủ. Hai người được chạm vai hãy mở mắt nhìn nhau, rồi đi ngủ.',
    pick: 2,
    hint: 'Chọn đúng 2 người',
  },
  guard: {
    title: 'Gọi Bảo vệ',
    script: 'Bảo vệ hãy thức dậy. Đêm nay bạn muốn bảo vệ ai? Bảo vệ đi ngủ.',
    pick: 1,
    optional: true,
    hint: 'Chọn 1 người, hoặc để trống',
  },
  wolf: {
    title: 'Gọi Ma sói',
    script: 'Ma sói hãy thức dậy và nhìn nhau. Hãy thống nhất chọn một người. Ma sói đi ngủ.',
    pick: 1,
    hint: 'Chọn người bị cắn',
  },
  whitewolf: {
    title: 'Gọi Sói trắng',
    script: 'Sói trắng hãy thức dậy. Bạn có muốn loại một Ma sói không? Sói trắng đi ngủ.',
    pick: 0,
    gm: true,
  },
  witch: {
    title: 'Gọi Phù thủy',
    script:
      'Phù thủy hãy thức dậy. Đêm nay người này bị cắn. Bạn có muốn dùng bình cứu không? Bạn có muốn dùng bình độc không? Phù thủy đi ngủ.',
    pick: 0,
  },
  seer: {
    title: 'Gọi Tiên tri',
    script: 'Tiên tri hãy thức dậy và chỉ vào người bạn muốn soi. Tiên tri đi ngủ.',
    pick: 1,
    hint: 'Chọn người được soi',
  },
  piper: {
    title: 'Gọi Người thổi sáo',
    script: 'Người thổi sáo hãy thức dậy và chọn hai người để mê hoặc. Người thổi sáo đi ngủ.',
    pick: 0,
    gm: true,
  },
}

/** Thứ tự gọi vai trong đêm hiện tại. */
export function nightSteps(g: Game): string[] {
  const has = (id: string) => g.players.some((p) => p.roleId === id)
  const list: string[] = []
  if (g.day === 1 && has('cupid')) list.push('cupid')
  if (has('guard')) list.push('guard')
  list.push('wolf')
  if (has('whitewolf') && g.day % 2 === 0) list.push('whitewolf')
  if (has('witch')) list.push('witch')
  if (has('seer')) list.push('seer')
  if (has('piper')) list.push('piper')
  allRoles()
    .filter((r) => r.wakes && has(r.id))
    .forEach((r) => list.push(r.id))
  return list
}

export function stepDef(key: string): StepDef {
  const d = STEPS[key]
  if (d) return { ...d, role: key }
  const name = findRole(key).name
  return {
    role: key,
    title: 'Gọi ' + name,
    script: `${name} hãy thức dậy. Quản trò xử lý kỹ năng theo luật của nhóm. ${name} đi ngủ.`,
    pick: 0,
    gm: true,
  }
}

export function playerById(g: Game, id: string): GamePlayer {
  const p = g.players.find((x) => x.id === id)
  if (!p) throw new Error(`Không có người chơi ${id}`)
  return p
}

export function phaseTag(g: Game): string {
  return (g.phase === 'night' ? 'Đêm ' : 'Ngày ') + g.day
}

export function addLog(g: Game, text: string, pub: boolean) {
  g.log.push({ tag: phaseTag(g), text, pub })
}

const KILL_REASON: Record<KillCause, string> = {
  night: 'trong đêm',
  vote: 'theo phiếu bầu',
  hunter: 'bởi phát bắn của Thợ săn',
  lover: 'vì Cặp đôi đã mất',
  gm: 'bởi quản trò',
}

/** Loại một người (đột biến g). Kéo theo Cặp đôi, kích hoạt Thợ săn, Kẻ chán đời. */
export function killPlayer(g: Game, id: string, cause: KillCause) {
  const p = g.players.find((x) => x.id === id)
  if (!p || !p.alive) return
  p.alive = false
  g.lastDeaths.push(id)
  addLog(g, `${p.name} bị loại ${KILL_REASON[cause]}.`, true)
  if (cause === 'vote' && p.roleId === 'tanner') {
    g.winner = {
      team: 'solo',
      title: 'Kẻ chán đời chiến thắng',
      reason: `${p.name} là Kẻ chán đời và đã bị cả làng bỏ phiếu loại.`,
    }
  }
  if (p.roleId === 'hunter') g.pendingHunter = id
  if (p.lover) {
    const partner = g.players.find((x) => x.lover && x.id !== id && x.alive)
    if (partner) killPlayer(g, partner.id, 'lover')
  }
}

/** Ghi người thắng vào g nếu một phe đã đạt điều kiện. */
export function checkWin(g: Game) {
  if (g.winner) return
  const alive = g.players.filter((p) => p.alive)
  const wolves = alive.filter((p) => isWolfTeam(p.roleId))
  const others = alive.length - wolves.length
  if (alive.length === 1 && alive[0]!.roleId === 'whitewolf') {
    g.winner = {
      team: 'solo',
      title: 'Sói trắng chiến thắng',
      reason: 'Sói trắng là người duy nhất còn sống.',
    }
  } else if (alive.length === 2 && alive.every((p) => p.lover)) {
    g.winner = {
      team: 'lovers',
      title: 'Cặp đôi chiến thắng',
      reason: 'Chỉ còn lại hai người trong Cặp đôi.',
    }
  } else if (wolves.length === 0) {
    g.winner = {
      team: 'village',
      title: 'Phe Dân làng chiến thắng',
      reason: 'Mọi Ma sói đã bị loại khỏi làng.',
    }
  } else if (wolves.length >= others) {
    g.winner = {
      team: 'wolf',
      title: 'Phe Ma sói chiến thắng',
      reason: `Số Ma sói còn sống (${wolves.length}) đã bằng hoặc nhiều hơn số người còn lại (${others}).`,
    }
  }
}

/** Những người sẽ bị loại khi trời sáng, theo lựa chọn trong đêm. */
export function nightDeaths(g: Game): string[] {
  const n = g.night
  const dead: string[] = []
  if (n.wolf && n.wolf !== n.protect && !n.heal) dead.push(n.wolf)
  if (n.poison && !dead.includes(n.poison)) dead.push(n.poison)
  return dead
}
