/*
 * Dữ liệu công khai: thứ duy nhất được ghi vào bảng mọi thành viên đọc được.
 * Không chứa vai, mục tiêu đêm, tài nguyên, kết quả soi, Cặp đôi hay nhật ký riêng
 * (trừ những gì đã công bố, và toàn bộ vai khi ván đã kết thúc).
 */
import { roleDef } from './abilities.ts'
import { TEAMS } from './catalog.ts'
import type { DayStep, GameState, GameStatus, IconName, LogEntry, RoleDef, Team, WinnerTeam } from './types.ts'

export interface PublicRole {
  id: string
  name: string
  team: Team
  icon: IconName
}

export interface PublicPlayer {
  id: string
  name: string
  seat: number
  device: boolean
  alive: boolean
  chief: boolean
  canVote: boolean
  /** Vai đã công bố (Thằng ngốc lật thẻ, công bố khi chết, hoặc khi ván kết thúc). */
  role: PublicRole | null
}

export interface PublicResult {
  team: WinnerTeam
  title: string
  reason: string
  winners: string[]
  manual: boolean
  lovers: string[]
}

export interface PublicState {
  status: GameStatus
  name: string
  day: number
  phase: 'setup' | 'night' | 'day'
  dayStep: DayStep | null
  players: PublicPlayer[]
  /** Người bị loại được công bố gần nhất. */
  announcements: { id: string; name: string; role: PublicRole | null }[]
  log: LogEntry[]
  result: PublicResult | null
}

export function publicRole(def: RoleDef): PublicRole {
  return { id: def.id, name: def.name, team: def.team, icon: def.icon }
}

export function publicView(s: GameState): PublicState {
  const ended = s.status === 'ended'
  // Ban đêm chỉ công bố những gì đã biết từ ngày trước (người chết đêm nay công bố lúc sáng).
  const players: PublicPlayer[] = s.players.map((p) => ({
    id: p.id,
    name: p.name,
    seat: p.seat,
    device: p.device,
    alive: p.alive,
    chief: p.chief,
    canVote: p.canVote,
    role: ended || p.revealed ? publicRole(roleDef(s, p.roleId)) : null,
  }))
  const byId = new Map(players.map((p) => [p.id, p]))
  return {
    status: s.status,
    name: s.name,
    day: s.day,
    phase: s.phase,
    dayStep: s.dayState?.step ?? null,
    players,
    announcements: s.phase === 'day' ? s.lastDeaths.map((id) => ({ id, name: byId.get(id)!.name, role: byId.get(id)!.role })) : [],
    log: s.log.filter((e) => e.pub),
    result:
      ended && s.winner
        ? {
            team: s.winner.team,
            title: s.winner.title,
            reason: s.winner.reason,
            winners: s.winner.winners,
            manual: s.winner.manual,
            lovers: s.players.filter((p) => p.lover).map((p) => p.id),
          }
        : null,
  }
}

/** Bản ghi vai riêng cho từng người (chỉ chủ nhân và quản trò đọc được). */
export interface AssignmentRow {
  member_id: string
  role_id: string
  role: RoleDef & { teamLabel: string }
}

export function assignmentRows(s: GameState): AssignmentRow[] {
  return s.players.map((p) => {
    const def = roleDef(s, p.roleId)
    return { member_id: p.id, role_id: p.roleId, role: { ...def, teamLabel: TEAMS[def.team].label } }
  })
}
