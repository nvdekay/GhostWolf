/* Dữ liệu hiển thị vai, dựa trên catalog của engine (một nguồn duy nhất cho mô tả và luật). */
import {
  findRoleDef,
  MAX_PLAYERS,
  ROLES,
  STATUSES,
  TEAMS,
  type Counts,
  type RoleDef,
  type StatusDef,
  type Team,
} from '@engine'
import type { IconName } from '@/components/Icon'

export type TeamKey = Team | 'status'

export interface RoleView {
  id: string
  name: string
  icon: IconName
  short: string
  skill: string
  win: string
  wake: string
  note: string
  gm: boolean
  custom: boolean
  isStatus: boolean
  team: TeamKey
  teamLabel: string
  teamIcon: IconName
}

const DEFAULT_WIN: Record<Team, string> = {
  village: 'Thắng cùng phe Dân làng khi mọi Ma sói, Sói trắng và Người thổi sáo bị loại.',
  wolf: 'Thắng cùng bầy sói khi số Ma sói còn sống bằng hoặc nhiều hơn số người còn lại, và không còn Sói trắng hay Người thổi sáo.',
  solo: 'Có điều kiện thắng riêng. Quản trò thống nhất trước ván.',
}

export function roleView(r: RoleDef | StatusDef): RoleView {
  if ('kind' in r) {
    return {
      id: r.id,
      name: r.name,
      icon: r.icon,
      short: r.short,
      skill: r.skill,
      win: r.win,
      wake: r.wake,
      note: r.note,
      gm: false,
      custom: false,
      isStatus: true,
      team: 'status',
      teamLabel: r.kind,
      teamIcon: r.icon,
    }
  }
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    short: r.short,
    skill: r.skill || r.short,
    win: r.win ?? DEFAULT_WIN[r.team],
    wake: r.wake || 'Không thức dậy',
    note: r.note ?? '',
    gm: !!r.gm,
    custom: !!r.custom,
    isStatus: false,
    team: r.team,
    teamLabel: TEAMS[r.team].label,
    teamIcon: TEAMS[r.team].icon,
  }
}

export function findAny(id: string, custom: RoleDef[]): RoleDef | StatusDef | undefined {
  return findRoleDef(id, custom) ?? STATUSES.find((s) => s.id === id)
}

/** Vai không còn (vai tùy chỉnh đã xóa) hiển thị như vai tùy chỉnh không tên. */
export function viewOf(id: string, custom: RoleDef[] = []): RoleView {
  const def = findAny(id, custom)
  if (def) return roleView(def)
  return roleView({
    id,
    name: 'Vai đã xóa',
    team: 'solo',
    icon: 'sparkles',
    short: '',
    skill: '',
    wake: '',
    gm: true,
    custom: true,
  })
}

export const allRoles = (custom: RoleDef[]) => [...ROLES, ...custom]

export function totalCards(counts: Counts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0)
}

export function incCount(counts: Counts, id: string): Counts {
  return { ...counts, [id]: Math.min(MAX_PLAYERS, (counts[id] ?? 0) + 1) }
}

export function decCount(counts: Counts, id: string): Counts {
  const next = { ...counts }
  const c = Math.max(0, (next[id] ?? 0) - 1)
  if (c) next[id] = c
  else delete next[id]
  return next
}

/** Tổng hợp bộ vai cho n người. Đếm theo phe thắng (Sói trắng thuộc phe riêng). */
export function deckSummary(counts: Counts, n: number, custom: RoleDef[]) {
  const total = totalCards(counts)
  const by = (team: Team) =>
    Object.entries(counts).reduce(
      (a, [id, c]) => a + (findRoleDef(id, custom)?.team === team ? c : 0),
      0,
    )
  const village = by('village')
  const wolf = by('wolf')
  const solo = by('solo')
  const diff = total - n
  const ok = n > 0 && diff === 0 && wolf > 0
  let status: {
    text: string
    tone: 'muted' | 'warn' | 'bad' | 'good'
    icon: 'info' | 'alert' | 'check'
  }
  if (total === 0) status = { text: `Chưa chọn vai · cần ${n} thẻ`, tone: 'muted', icon: 'info' }
  else if (diff < 0) status = { text: `Thiếu ${-diff} thẻ`, tone: 'warn', icon: 'alert' }
  else if (diff > 0) status = { text: `Thừa ${diff} thẻ`, tone: 'bad', icon: 'alert' }
  else if (wolf === 0) status = { text: 'Chưa có Ma sói', tone: 'bad', icon: 'alert' }
  else status = { text: `Khớp ${n}/${n} người`, tone: 'good', icon: 'check' }
  const reason = ok
    ? 'Sẵn sàng chia vai.'
    : diff < 0
      ? `Thêm ${-diff} thẻ hoặc bấm “Điền Dân làng”.`
      : diff > 0
        ? `Bớt ${diff} thẻ để khớp ${n} người chơi.`
        : 'Bộ vai cần ít nhất một Ma sói.'
  return { total, village, wolf, solo, diff, ok, status, reason }
}
