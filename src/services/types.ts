import type { GameStatus, PublicState, RoleDef } from '@engine'
import type { RoomOptions } from '@shared/remote.ts'

export type RoomStatus = 'open' | 'locked' | 'closed'
export type MemberStatus = 'active' | 'left' | 'kicked' | 'closed'

export interface RoomRow {
  id: string
  code: string
  name: string
  host_id: string
  status: RoomStatus
  options: RoomOptions
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
  ready: boolean
  ready_at: string | null
  muted_until: string | null
  afk_count: number
  joined_at: string
}

export type ChatChannel = 'lobby' | 'public' | 'wolves' | 'system' | 'moderator'

export interface ChatMessageRow {
  id: string
  room_id: string
  game_id: string | null
  channel: ChatChannel
  sender_member_id: string | null
  client_message_id: string
  reply_to_id: string | null
  body: string
  day: number | null
  phase_sequence: number | null
  created_at: string
  deleted_at: string | null
  deleted_by: string | null
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
