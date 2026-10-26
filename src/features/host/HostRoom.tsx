import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GameCommand } from '@shared/commands.ts'
import { useNav } from '@/app/App'
import { useFeedback } from '@/app/feedback'
import { useSession } from '@/app/session'
import { Crescent, Paper } from '@/components/ui'
import { refreshRoom, useRoom } from '@/realtime/roomStore'
import { sendGameCommand } from '@/services/game'
import { AppError } from '@/services/errors'
import { AssignScreen } from '@/features/assign/AssignScreen'
import { DealScreen } from '@/features/assign/DealScreen'
import { BoardScreen } from '@/features/board/BoardScreen'
import { ResultScreen } from '@/features/result/ResultScreen'
import { RolesScreen } from '@/features/roles/RolesScreen'
import { LobbyScreen } from '@/features/setup/LobbyScreen'
import { HostContext, type HostApi, type HostView } from './context'

export function RoomMessage({ title, sub }: { title: string; sub: string }) {
  const nav = useNav()
  return (
    <Paper narrow label="Thông báo">
      <main className="join">
        <div className="join__waiting">
          <div className="moon-ring">
            <Crescent size={60} />
          </div>
          <h1 aria-live="polite">{title}</h1>
          <p className="muted pretty">{sub}</p>
        </div>
        <div className="join__bottom">
          <button className="btn btn-ink btn-xl btn-block" onClick={nav.home}>
            Về trang chủ
          </button>
        </div>
      </main>
    </Paper>
  )
}

export function HostRoom({ roomId }: { roomId: string }) {
  const { userId } = useSession()
  const fb = useFeedback()
  const snap = useRoom(roomId, userId!)
  const [picked, setPicked] = useState<{ key: string; view: HostView } | null>(null)
  const [dealFor, setDealFor] = useState<string[]>([])
  const [dealReturn, setDealReturn] = useState<HostView>('assign')
  const { room, game } = snap

  const derived: HostView = !room
    ? 'lobby'
    : room.status === 'open'
      ? 'lobby'
      : !game || game.status === 'setup'
        ? 'roles'
        : game.status === 'dealt' || game.status === 'sent'
          ? 'assign'
          : game.status === 'playing'
            ? 'board'
            : 'result'

  // Trạng thái thật đổi (chốt phòng, gửi vai, kết thúc, máy khác thao tác) → bỏ lựa chọn xem tạm.
  const derivedKey = `${room?.status}:${game?.id}:${game?.status}`
  // Hẹn màn cho lần đổi trạng thái kế tiếp (ví dụ chơi lại → chia vai ngay).
  const [pendingNext, setPendingNext] = useState<{ fromKey: string; view: HostView } | null>(null)
  if (pendingNext && pendingNext.fromKey !== derivedKey) {
    setPendingNext(null)
    setPicked({ key: derivedKey, view: pendingNext.view })
  }
  const override = picked?.key === derivedKey ? picked.view : null
  const setOverride = useCallback(
    (v: HostView | null, opts?: { afterChange?: boolean }) => {
      if (opts?.afterChange && v) setPendingNext({ fromKey: derivedKey, view: v })
      else setPicked(v ? { key: derivedKey, view: v } : null)
    },
    [derivedKey],
  )

  // Nền tối hơn khi bàn đang ở ban đêm.
  const night = derived === 'board' && game?.public_state.phase === 'night'
  useEffect(() => {
    const el = document.getElementById('app-root')
    if (el) el.dataset.night = String(night)
    return () => {
      if (el) el.dataset.night = 'false'
    }
  }, [night])

  const run = useCallback(
    async (cmd: GameCommand, opts: { silent?: boolean } = {}) => {
      if (!game) return false
      try {
        const res = await sendGameCommand(game.id, cmd)
        await refreshRoom(roomId)
        if (res.undone && !opts.silent) fb.toast('Đã hoàn tác: ' + res.undone)
        return true
      } catch (e) {
        if (e instanceof AppError && e.code === 'REVISION_CONFLICT') await refreshRoom(roomId)
        fb.error(e)
        return false
      }
    },
    [game, roomId, fb],
  )

  const view: HostView = dealFor.length ? 'deal' : (override ?? derived)
  const api = useMemo<HostApi | null>(
    () =>
      room
        ? {
            snap,
            room,
            game,
            view,
            setView: setOverride,
            run,
            dealFor,
            startDeal: (ids, back) => {
              setDealReturn(back)
              setDealFor(ids)
            },
            refresh: snap.refresh,
          }
        : null,
    [snap, room, game, view, run, dealFor, setOverride],
  )

  if (snap.loading && !room)
    return <RoomMessage title="Đang tải phòng…" sub="Đang lấy dữ liệu mới nhất." />
  if (!room || room.host_id !== userId)
    return (
      <RoomMessage
        title="Không mở được phòng"
        sub="Phòng không tồn tại, đã đóng, hoặc bạn không phải quản trò."
      />
    )
  if (room.status === 'closed')
    return <RoomMessage title="Phòng đã đóng" sub="Mã phòng đã hết hiệu lực." />

  const endDeal = () => {
    setDealFor([])
    setOverride(dealReturn)
  }

  return (
    <HostContext.Provider value={api}>
      {!snap.live && (
        <div className="offline-banner" role="status">
          Đang kết nối lại… Thao tác vẫn được gửi khi có mạng.
        </div>
      )}
      {view === 'lobby' && <LobbyScreen />}
      {view === 'roles' && <RolesScreen />}
      {view === 'assign' && <AssignScreen />}
      {view === 'deal' && <DealScreen onDone={endDeal} />}
      {view === 'board' && <BoardScreen />}
      {view === 'result' && <ResultScreen />}
    </HostContext.Provider>
  )
}
