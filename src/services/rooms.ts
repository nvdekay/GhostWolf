/* RPC lệnh phòng (Postgres, security definer — kiểm tra quyền ở server). */
import type { RoomOptions } from '@shared/remote.ts'
import { getHostRecoveryKey, storeHostRecoveryKey } from '@/lib/hostRecovery'
import { supabase } from '@/lib/supabase'
import { fromPostgrest } from './errors'
import type { MemberRow, RoomRow, RoomStatus } from './types'

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw fromPostgrest(error)
  return data as T
}

export async function createRoom(name: string, options: Partial<RoomOptions>) {
  const result = await call<{ room: RoomRow; recovery_key: string }>('create_room_with_recovery', {
    p_name: name,
    p_options: options,
  })
  storeHostRecoveryKey(result.room.id, result.recovery_key)
  return { room: result.room, recoveryKey: result.recovery_key }
}

export async function recoverRoomHost(code: string, recoveryKey: string) {
  const result = await call<{ room_id: string; recovery_key: string }>('recover_room_host', {
    p_code: code,
    p_recovery_key: recoveryKey,
  })
  storeHostRecoveryKey(result.room_id, result.recovery_key)
  return { roomId: result.room_id, recoveryKey: result.recovery_key }
}

export async function hostRecoveryKey(roomId: string) {
  const stored = getHostRecoveryKey(roomId)
  if (stored) return stored
  const recoveryKey = await call<string>('rotate_host_recovery', { p_room: roomId })
  storeHostRecoveryKey(roomId, recoveryKey)
  return recoveryKey
}

export async function findRoom(code: string) {
  const rows = await call<
    { id: string; name: string; status: RoomStatus; is_host: boolean; member_id: string | null }[]
  >('find_room', { p_code: code })
  return rows[0] ?? null
}

export const joinRoom = (code: string, name: string) =>
  call<MemberRow>('join_room', { p_code: code, p_name: name })
export const leaveRoom = (roomId: string) => call<void>('leave_room', { p_room: roomId })
export const addMember = (roomId: string, name: string) =>
  call<MemberRow>('host_add_member', { p_room: roomId, p_name: name })
export const kickMember = (memberId: string) => call<void>('host_kick', { p_member: memberId })
export const lockRoom = (roomId: string) => call<RoomRow>('host_lock', { p_room: roomId })
export const unlockRoom = (roomId: string) => call<RoomRow>('host_unlock', { p_room: roomId })
export const closeRoom = (roomId: string) => call<void>('host_close', { p_room: roomId })
export const ackRole = (gameId: string) => call<string>('ack_role', { p_game: gameId })
export const hostAckRole = (gameId: string, memberId: string) =>
  call<string>('host_ack_role', { p_game: gameId, p_member: memberId })
export const deleteChatMessage = (messageId: string, reason = '') =>
  call<void>('host_delete_chat', { p_message: messageId, p_reason: reason })
export const muteMember = (memberId: string, until: string | null, reason = '') =>
  call<void>('host_mute_member', { p_member: memberId, p_until: until, p_reason: reason })

export interface SessionSummary {
  room: RoomRow
  asHost: boolean
  memberId: string | null
  gameStatus: string | null
  meta: string
}

/** Phòng chưa đóng mà phiên này là quản trò hoặc thành viên — cho mục "Tiếp tục ván". */
export async function mySessions(userId: string): Promise<SessionSummary[]> {
  const { data: rooms, error } = await supabase
    .from('rooms')
    .select('*')
    .neq('status', 'closed')
    .order('updated_at', { ascending: false })
    .limit(5)
  if (error) throw fromPostgrest(error)
  const list = (rooms ?? []) as RoomRow[]
  if (!list.length) return []
  const gameIds = list.map((r) => r.current_game_id).filter(Boolean) as string[]
  const [{ data: games }, { data: members }] = await Promise.all([
    gameIds.length
      ? supabase.from('games').select('id,status,public_state').in('id', gameIds)
      : Promise.resolve({ data: [] }),
    supabase.from('room_members').select('id,room_id').eq('user_id', userId).eq('status', 'active'),
  ])
  return list.map((room) => {
    const g = (games ?? []).find((x) => x.id === room.current_game_id) as
      | {
          status: string
          public_state: { phase: string; day: number; players: { alive: boolean }[] }
        }
      | undefined
    const ps = g?.public_state
    const phase =
      !g || g.status === 'setup' || g.status === 'dealt' || g.status === 'sent'
        ? room.status === 'open'
          ? 'Phòng chờ'
          : 'Đang chuẩn bị'
        : g.status === 'ended'
          ? 'Đã kết thúc'
          : `${ps!.phase === 'night' ? 'Đêm' : 'Ngày'} ${ps!.day} · ${ps!.players.filter((p) => p.alive).length}/${ps!.players.length} còn sống`
    return {
      room,
      asHost: room.host_id === userId,
      memberId: (members ?? []).find((m) => m.room_id === room.id)?.id ?? null,
      gameStatus: g?.status ?? null,
      meta: `${room.name} · ${phase}`,
    }
  })
}
