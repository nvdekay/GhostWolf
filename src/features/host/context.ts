import { createContext, useContext } from 'react'
import type { GameCommand } from '@shared/commands.ts'
import type { RoomSnapshot } from '@/realtime/roomStore'
import type { GameRow, RoomRow } from '@/services/types'

export type HostView = 'lobby' | 'roles' | 'assign' | 'deal' | 'board' | 'result'

export interface HostApi {
  snap: RoomSnapshot
  room: RoomRow
  game: GameRow | null
  view: HostView
  /** afterChange: áp dụng khi trạng thái phòng/ván đổi lần tới (sau một lệnh). */
  setView: (v: HostView | null, opts?: { afterChange?: boolean }) => void
  /** Gửi lệnh ván; trả về false nếu lỗi (đã hiện toast). */
  run: (cmd: GameCommand, opts?: { silent?: boolean }) => Promise<boolean>
  /** Người không có điện thoại đang xem vai trên máy quản trò. */
  dealFor: string[]
  startDeal: (memberIds: string[], returnTo: HostView) => void
  refresh: () => Promise<void>
}

export const HostContext = createContext<HostApi | null>(null)

export function useHost(): HostApi {
  const h = useContext(HostContext)
  if (!h) throw new Error('useHost ngoài HostRoom')
  return h
}

export function useStepper() {
  const { view, setView, room, game } = useHost()
  const idx = view === 'lobby' ? 0 : view === 'roles' ? 1 : 2
  const locked = room.status === 'locked'
  const deckReady = !!game && game.status !== 'setup'
  return ['Phòng', 'Bộ vai', 'Chia vai'].map((label, i) => ({
    label,
    current: i === idx,
    done: i < idx,
    onGo: () => {
      if (i === 0) setView('lobby')
      if (i === 1 && locked && game && ['setup', 'dealt'].includes(game.status)) setView('roles')
      if (i === 2 && locked && deckReady) setView('assign')
    },
  }))
}
