import type { GameStatus, PublicState, RoleDef, RuleOptions } from '@engine'

export type RoomStatus = 'open' | 'locked' | 'closed'
export type MemberStatus = 'active' | 'left' | 'kicked' | 'closed'

export interface RoomRow {
  id: string
  code: string
  name: string
  host_id: string
  status: RoomStatus
  options: RuleOptions
  current_game_id: string | null
  created_at: string
  updated_at: string
}

export interface MemberRow {
  id: string
  room_id: string
  user_id: string | null
  name: string
  seat: number
  device: boolean
  status: MemberStatus
  joined_at: string
}

export interface GameRow {
  id: string
  room_id: string
  number: number
  status: GameStatus
  revision: number
  public_state: PublicState
  updated_at: string
}

export interface AssignmentRow {
  game_id: string
  member_id: string
  role_id: string
  role: RoleDef & { teamLabel: string }
  viewed_at: string | null
}

export interface CustomRoleRow {
  id: string
  name: string
  team: RoleDef['team']
  short: string
  wakes: boolean
}

export interface PresetRow {
  id: string
  name: string
  counts: Record<string, number>
  updated_at: string
}
