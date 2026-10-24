import { getState } from '@/app/store'
import type { IconName } from '@/components/Icon'
import type { Counts, Role, StatusDef, Team } from '@/types/game'
import { ROLES, STATUSES, TEAMS } from './catalog'

export type TeamKey = Team | 'status'

/** Dữ liệu hiển thị chung cho vai và trạng thái. */
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

export function allRoles(): Role[] {
  return [...ROLES, ...getState().customRoles]
}

export function findRole(id: string): Role | StatusDef {
  return allRoles().find((r) => r.id === id) ?? STATUSES.find((r) => r.id === id) ?? ROLES[0]!
}

export function roleTeam(id: string): Team | undefined {
  const r = findRole(id)
  return 'team' in r ? r.team : undefined
}

/** Sói trắng thuộc phe riêng nhưng tính là sói khi soi và khi đếm thắng thua. */
export function isWolfTeam(id: string): boolean {
  return roleTeam(id) === 'wolf' || id === 'whitewolf'
}

const DEFAULT_WIN: Record<Team, string> = {
  village: 'Thắng cùng phe Dân làng khi mọi Ma sói bị loại.',
  wolf: 'Thắng cùng phe Ma sói khi số sói còn sống bằng hoặc nhiều hơn số người còn lại.',
  solo: 'Có điều kiện thắng riêng. Quản trò thống nhất trước ván.',
}

export function roleView(r: Role | StatusDef): RoleView {
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

export function viewOf(id: string): RoleView {
  return roleView(findRole(id))
}

export function totalCards(counts: Counts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0)
}

export function buildDeck(counts: Counts): string[] {
  return Object.entries(counts).flatMap(([id, c]) => Array<string>(c).fill(id))
}

export function incCount(counts: Counts, id: string): Counts {
  return { ...counts, [id]: (counts[id] ?? 0) + 1 }
}

export function decCount(counts: Counts, id: string): Counts {
  const next = { ...counts }
  const c = Math.max(0, (next[id] ?? 0) - 1)
  if (c) next[id] = c
  else delete next[id]
  return next
}
