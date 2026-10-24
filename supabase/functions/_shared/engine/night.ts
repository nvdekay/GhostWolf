import { isPack, roleDef } from './abilities.ts'
import type { GameState, Player } from './types.ts'

export interface StepInfo {
  key: string
  /** Vai chủ thể của bước (wolf = cả bầy). */
  role: string
  title: string
  script: string
  /** Số người cần chọn: [min, max]. */
  pick: [number, number]
  hint: string
  gm: boolean
}

const BASE: Record<string, Omit<StepInfo, 'key' | 'role'>> = {
  cupid: {
    title: 'Gọi Cupid',
    script:
      'Cupid hãy thức dậy và chỉ vào hai người sẽ thành Cặp đôi. Cupid đi ngủ. Hai người được chạm vai hãy mở mắt nhìn nhau, rồi đi ngủ.',
    pick: [2, 2],
    hint: 'Chọn đúng 2 người',
    gm: true,
  },
  guard: {
    title: 'Gọi Bảo vệ',
    script: 'Bảo vệ hãy thức dậy. Đêm nay bạn muốn bảo vệ ai? Bảo vệ đi ngủ.',
    pick: [0, 1],
    hint: 'Chọn 1 người, hoặc để trống',
    gm: false,
  },
  wolf: {
    title: 'Gọi Ma sói',
    script: 'Ma sói hãy thức dậy và nhìn nhau. Hãy thống nhất chọn một người. Ma sói đi ngủ.',
    pick: [1, 1],
    hint: 'Chọn người bị cắn',
    gm: false,
  },
  whitewolf: {
    title: 'Gọi Sói trắng',
    script: 'Sói trắng hãy thức dậy. Bạn có muốn loại một Ma sói không? Sói trắng đi ngủ.',
    pick: [0, 1],
    hint: 'Chọn một Ma sói, hoặc để trống',
    gm: false,
  },
  witch: {
    title: 'Gọi Phù thủy',
    script:
      'Phù thủy hãy thức dậy. Đêm nay người này bị cắn. Bạn có muốn dùng bình cứu không? Bạn có muốn dùng bình độc không? Phù thủy đi ngủ.',
    pick: [0, 1],
    hint: 'Chạm một người để đầu độc',
    gm: false,
  },
  seer: {
    title: 'Gọi Tiên tri',
    script: 'Tiên tri hãy thức dậy và chỉ vào người bạn muốn soi. Tiên tri đi ngủ.',
    pick: [1, 1],
    hint: 'Chọn người được soi',
    gm: false,
  },
  piper: {
    title: 'Gọi Người thổi sáo',
    script:
      'Người thổi sáo hãy thức dậy và chọn hai người để mê hoặc. Người thổi sáo đi ngủ. Quản trò chạm vai những người bị mê hoặc.',
    pick: [2, 2],
    hint: 'Chọn 2 người chưa bị mê hoặc',
    gm: false,
  },
}

const has = (s: GameState, roleId: string) => s.players.some((p) => p.roleId === roleId)

/** Người thực hiện bước còn sống không (bầy sói: còn ít nhất một thành viên bầy). */
export function stepActors(s: GameState, key: string): Player[] {
  if (key === 'wolf') return s.players.filter((p) => p.alive && isPack(s, p.roleId))
  return s.players.filter((p) => p.alive && p.roleId === key)
}

/** Thứ tự gọi: Cupid (đêm 1) → Bảo vệ → Bầy sói → Sói trắng (đêm chẵn) → Phù thủy → Tiên tri → Người thổi sáo → vai tùy chỉnh. */
export function computeSteps(s: GameState): string[] {
  const list: string[] = []
  if (s.day === 1 && has(s, 'cupid')) list.push('cupid')
  if (has(s, 'guard')) list.push('guard')
  if (s.players.some((p) => isPack(s, p.roleId))) list.push('wolf')
  if (s.day % 2 === 0 && has(s, 'whitewolf')) list.push('whitewolf')
  if (has(s, 'witch')) list.push('witch')
  if (has(s, 'seer')) list.push('seer')
  if (has(s, 'piper')) list.push('piper')
  s.customRoles.filter((r) => r.wakes && has(s, r.id)).forEach((r) => list.push(r.id))
  if (s.options.callDeadRoles) return list
  return list.filter((k) => stepActors(s, k).length > 0)
}

export function stepInfo(s: GameState, key: string): StepInfo {
  const base = BASE[key]
  if (base) return { ...base, key, role: key }
  const name = roleDef(s, key).name
  return {
    key,
    role: key,
    title: 'Gọi ' + name,
    script: `${name} hãy thức dậy. Quản trò xử lý kỹ năng theo luật của nhóm. ${name} đi ngủ.`,
    pick: [0, 0],
    hint: '',
    gm: true,
  }
}

export function currentStep(s: GameState): string | null {
  const n = s.night
  if (s.phase !== 'night' || !n || n.step >= n.steps.length) return null
  return n.steps[n.step] ?? null
}

/**
 * Lý do một người không được chọn ở bước hiện tại (null = chọn được).
 * Dùng chung cho kiểm tra lệnh ở server và làm mờ ghế trên UI.
 */
export function targetProblem(s: GameState, key: string, target: Player, mode: 'main' | 'poison' = 'main'): string | null {
  if (!target.alive) return 'Người này đã bị loại.'
  const actors = stepActors(s, key)
  switch (key) {
    case 'guard':
      if (s.lastProtect === target.id) return 'Không được bảo vệ cùng một người hai đêm liền.'
      return null
    case 'wolf':
      if (isPack(s, target.roleId)) return 'Bầy sói không cắn thành viên trong bầy.'
      return null
    case 'whitewolf':
      if (target.roleId === 'whitewolf') return 'Sói trắng không tự loại mình.'
      if (!isPack(s, target.roleId)) return 'Sói trắng chỉ loại được thành viên bầy sói.'
      return null
    case 'witch':
      return mode === 'poison' ? null : 'Phù thủy chỉ chọn người để đầu độc.'
    case 'seer':
      if (actors.some((a) => a.id === target.id)) return 'Tiên tri không tự soi mình.'
      return null
    case 'piper':
      if (target.roleId === 'piper') return 'Người thổi sáo không tự mê hoặc mình.'
      if (target.charmed) return 'Người này đã bị mê hoặc.'
      return null
    default:
      return null
  }
}

/** Số người tối đa thật sự chọn được ở bước (ví dụ bầy sói không còn ai để cắn). */
export function availableTargets(s: GameState, key: string, mode: 'main' | 'poison' = 'main'): Player[] {
  return s.players.filter((p) => targetProblem(s, key, p, mode) === null)
}

/** Phù thủy có được cứu người bị cắn đêm nay không. */
export function witchCanHeal(s: GameState): boolean {
  const bite = s.night?.actions.wolf
  if (!s.witch.heal || !bite) return false
  const witch = stepActors(s, 'witch')
  if (!s.options.witchSelfHeal && witch.some((w) => w.id === bite)) return false
  return true
}
