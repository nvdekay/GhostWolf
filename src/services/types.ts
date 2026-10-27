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

export interface RemotePhaseRow {
  game_id: string
  sequence: number
  kind: string
  started_at: string
  deadline: string | null
  locked_at: string | null
  status: 'open' | 'locked' | 'expired' | 'cancelled'
  required_count: number
  submitted_count: number
  updated_at: string
}

export interface GamePromptRow {
  id: string
  game_id: string
  member_id: string
  phase_sequence: number
  kind: string
  payload: {
    title: string
    instructions: string
    min: number
    max: number
    targets: { id: string; name: string }[]
    wolfVictim?: { id: string; name: string } | null
    healAvailable?: boolean
    poisonAvailable?: boolean
  }
  status: 'open' | 'submitted' | 'locked' | 'expired' | 'cancelled'
  deadline: string | null
  submitted_at: string | null
}

export interface GameSubmissionRow {
  prompt_id: string
  member_id: string
  client_action_id: string
  payload: { targets?: string[]; heal?: boolean; poison?: string | null }
  revision: number
  submitted_at: string
}

export interface PrivateKnowledgeRow {
  id: string
  game_id: string
  member_id: string
  kind: string
  day: number
  payload: Record<string, unknown>
  created_at: string
}

export interface PrivateNoticeRow {
  id: string
  game_id: string
  member_id: string
  phase_sequence: number
  kind: string
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
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
