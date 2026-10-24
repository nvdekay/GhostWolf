import type { IconName } from '@/components/Icon'

export type Team = 'village' | 'wolf' | 'solo'

export interface Role {
  id: string
  name: string
  team: Team
  icon: IconName
  short: string
  skill: string
  wake: string
  win?: string
  note?: string
  /** Quản trò xử lý thủ công, ứng dụng không tự áp luật. */
  gm?: boolean
  custom?: boolean
  /** Vai tùy chỉnh có thức dậy ban đêm. */
  wakes?: boolean
}

/** Trạng thái/chức danh (Cặp đôi, Trưởng làng) — không phải thẻ vai. */
export interface StatusDef {
  id: string
  name: string
  kind: string
  icon: IconName
  short: string
  skill: string
  win: string
  wake: string
  note: string
}

/** Số thẻ theo id vai. */
export type Counts = Record<string, number>

export interface RoomPlayer {
  id: string
  name: string
  /** Vào bằng điện thoại riêng; false là người được quản trò thêm tay. */
  device: boolean
}

export interface Room {
  code: string
  name: string
  locked: boolean
  players: RoomPlayer[]
}

export interface AssignEntry {
  pid: string
  name: string
  roleId?: string
  device: boolean
  viewed: boolean
}

export interface Assign {
  order: AssignEntry[]
  deck: string[]
  stage: 'shuffling' | 'done' | 'sent'
  tick: number
}

export interface DealEntry {
  pid: string
  name: string
  roleId: string
}

export interface Deal {
  order: DealEntry[]
  i: number
  stage: 'handoff' | 'reveal' | 'done'
  flipped: boolean
  /** Người không có điện thoại xem vai trên máy quản trò. */
  local?: boolean
}

export interface GamePlayer {
  id: string
  name: string
  roleId: string
  alive: boolean
  lover: boolean
  chief: boolean
}

export interface LogEntry {
  tag: string
  text: string
  /** Công khai; false là thông tin bí mật của quản trò. */
  pub: boolean
}

export interface NightState {
  protect?: string | null
  wolf?: string | null
  heal?: boolean
  poison?: string
  seer?: string
  seerDone?: boolean
}

export type DayStep = 'announce' | 'discuss' | 'vote' | 'after'

export type WinnerTeam = Team | 'lovers' | 'none'

export interface Winner {
  team: WinnerTeam
  title: string
  reason: string
}

export type KillCause = 'night' | 'vote' | 'hunter' | 'lover' | 'gm'

export interface Game {
  name: string
  players: GamePlayer[]
  day: number
  phase: 'night' | 'day'
  step: number
  night: NightState
  witch: { heal: boolean; poison: boolean }
  lastProtect: string | null
  dayStep: DayStep
  votes: Record<string, number>
  voteRes: { top: string[]; max: number } | null
  voteOnly: string[] | null
  lastDeaths: string[]
  pendingHunter: string | null
  winner: Winner | null
  counts: Counts
  log: LogEntry[]
}
