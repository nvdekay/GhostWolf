import { useCallback, useEffect, useState } from 'react'
import { useNav } from '@/app/App'
import { useFeedback } from '@/app/feedback'
import { useSession } from '@/app/session'
import { Icon } from '@/components/Icon'
import { Dialog } from '@/components/overlay'
import { Crescent, FlipCard } from '@/components/ui'
import { Paper } from '@/components/ui'
import { prefersReducedMotion } from '@/lib/media'
import { refreshRoom, useRoom } from '@/realtime/roomStore'
import { ackRole, leaveRoom } from '@/services/rooms'
import { RoomMessage } from '@/features/host/HostRoom'
import { ResultView } from '@/features/result/ResultScreen'
import { roleView, type RoleView } from '@/features/roles/roles'
import './join.css'

/** Gọi `hide` khi người dùng rời màn hình: mất focus cửa sổ, chuyển tab/ẩn app, rời trang. */
function useHideWhenAway(active: boolean, hide: () => void) {
  useEffect(() => {
    if (!active) return
    const onVis = () => document.visibilityState !== 'visible' && hide()
    window.addEventListener('blur', hide)
    window.addEventListener('pagehide', hide)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('blur', hide)
      window.removeEventListener('pagehide', hide)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [active, hide])
}

/** Nhấn giữ để xem vai: thả tay, hủy, rời cửa sổ hoặc chuyển tab là ẩn ngay. Bàn phím: giữ Space/Enter. */
function HoldToReveal({ role }: { role: RoleView }) {
  const [hold, setHold] = useState(false)
  useHideWhenAway(
    hold,
    useCallback(() => setHold(false), []),
  )
  const on = () => setHold(true)
  const off = () => setHold(false)
  return (
    <button
      className="hold"
      onPointerDown={on}
      onPointerUp={off}
      onPointerLeave={off}
      onPointerCancel={off}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault()
          on()
        }
      }}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && off()}
      onBlur={off}
      aria-label="Nhấn giữ để xem vai, thả ra để ẩn"
    >
      {hold ? (
        <span className="hold__content" data-team={role.team} aria-live="polite">
          <span className="team-ink">
            <Icon name={role.icon} size={44} />
          </span>
          <span className="hold__text">
            <span className="hold__role">{role.name}</span>
            <span className="team-ink">{role.teamLabel}</span>
          </span>
        </span>
      ) : (
        <span className="hold__content">
          <span className="gold-text">
            <Icon name="lock" />
          </span>
          <span className="hold__text">
            <span className="hold__title">Nhấn giữ để xem vai</span>
            <span className="muted hold__sub">Thả tay là vai ẩn ngay</span>
          </span>
        </span>
      )}
    </button>
  )
}

export function PlayerRoom({ roomId }: { roomId: string }) {
  const nav = useNav()
  const fb = useFeedback()
  const { userId } = useSession()
  const snap = useRoom(roomId, userId!)
  const [flipped, setFlipped] = useState(false)
  // Thẻ vừa lật lần đầu cũng úp lại khi rời màn hình, giống nhấn giữ.
  useHideWhenAway(
    flipped,
    useCallback(() => setFlipped(false), []),
  )
  const [busy, setBusy] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const { room, game, me } = snap
  if (snap.loading && !room && !me)
    return <RoomMessage title="Đang vào phòng…" sub="Đang lấy dữ liệu mới nhất." />
  if (me?.status === 'kicked')
    return (
      <RoomMessage
        title="Bạn đã được mời rời phòng"
        sub="Quản trò đã xóa bạn khỏi danh sách phòng."
      />
    )
  if (me?.status === 'closed')
    return (
      <RoomMessage
        title="Phòng đã đóng"
        sub="Quản trò đã đóng phòng. Mã phòng không còn hiệu lực."
      />
    )
  if (me?.status === 'left')
    return (
      <RoomMessage title="Bạn đã rời phòng" sub="Nhập lại mã nếu muốn vào lại khi phòng còn mở." />
    )
  if (!room || !me)
    return (
      <RoomMessage
        title="Không mở được phòng"
        sub="Phòng không tồn tại, đã đóng, hoặc bạn chưa vào phòng này."
      />
    )

  const pub = game?.public_state
  const a = snap.assignments.find((x) => x.member_id === me.id)
  const role = a ? roleView(a.role) : null
  const sent = !!game && ['sent', 'playing', 'ended'].includes(game.status)
  const others = snap.members.filter((m) => m.status === 'active' && m.id !== me.id)
  const myPub = pub?.players.find((p) => p.id === me.id)

  const header = (meta: string) => (
    <div className="join__bar join__bar--split">
      <span className="muted join__meta">{meta}</span>
      <button className="btn btn-ghost btn-ghost--muted" onClick={() => setConfirmLeave(true)}>
        Rời phòng
      </button>
    </div>
  )

  const leave = async () => {
    setBusy(true)
    try {
      await leaveRoom(room.id)
      nav.home()
    } catch (e) {
      fb.error(e)
      setBusy(false)
    }
  }

  const ack = async () => {
    if (!game) return
    setBusy(true)
    try {
      await ackRole(game.id)
      await refreshRoom(room.id)
      setFlipped(false)
    } catch (e) {
      fb.error(e)
    } finally {
      setBusy(false)
    }
  }

  let body: React.ReactNode
  if (game?.status === 'ended' && pub?.result) {
    return (
      <ResultView
        pub={pub}
        highlight={me.id}
        actions={
          <button className="btn btn-secondary" onClick={nav.home}>
            <Icon name="home" />
            Về trang chủ
          </button>
        }
      />
    )
  } else if (!sent || !role) {
    const locked = room.status === 'locked'
    body = (
      <main className="join">
        {header(`${room.name} · ${room.code}`)}
        <div className="join__waiting">
          <div className="moon-ring">
            <Crescent size={60} />
          </div>
          <h1 aria-live="polite">
            {sent ? 'Đang nhận vai…' : locked ? 'Phòng đã chốt' : 'Đã vào phòng'}
          </h1>
          <p className="muted pretty">
            {locked
              ? 'Quản trò đang chọn bộ vai. Vai sẽ hiện ra ngay trên máy bạn khi được gửi.'
              : 'Chờ quản trò chốt phòng. Giữ màn hình này mở.'}
          </p>
        </div>
        <section className="join__room">
          <h2>Trong phòng · {others.length + 1} người</h2>
          <ul className="pills">
            <li className="pill pill--me">
              {me.seat}. {me.name} · Bạn
            </li>
            {others.map((o) => (
              <li key={o.id} className="pill">
                {o.seat}. {o.name}
              </li>
            ))}
          </ul>
        </section>
      </main>
    )
  } else if (!a!.viewed_at) {
    body = (
      <main className="join">
        <div className="join__role-head">
          <div className="eyebrow">Quản trò đã gửi vai</div>
          <p className="muted">Che màn hình khỏi người bên cạnh rồi lật thẻ.</p>
        </div>
        <FlipCard
          role={role}
          flipped={flipped}
          animate={!prefersReducedMotion()}
          backAction={
            !flipped && (
              <button className="btn btn-ink join__flip" onClick={() => setFlipped(true)}>
                <Icon name="eye" />
                Chạm để lật thẻ
              </button>
            )
          }
        />
        {flipped && (
          <button
            className="btn btn-ink btn-xl btn-block"
            onClick={() => void ack()}
            disabled={busy}
          >
            <Icon name="eyeOff" />
            Tôi đã nhớ vai · ẩn đi
          </button>
        )}
      </main>
    )
  } else {
    const night = pub?.phase === 'night'
    const phase =
      !pub || pub.phase === 'setup' ? 'Sắp bắt đầu' : `${night ? 'Đêm' : 'Ngày'} ${pub.day}`
    const phaseSub =
      !pub || pub.phase === 'setup'
        ? 'Chờ quản trò bắt đầu Đêm 1'
        : night
          ? 'Mọi người nhắm mắt. Chỉ mở khi được gọi.'
          : {
              announce: 'Quản trò công bố',
              discuss: 'Thảo luận',
              vote: 'Bỏ phiếu bằng tay',
              after: 'Chuẩn bị đi ngủ',
            }[pub.dayStep ?? 'announce']
    const alive = myPub?.alive ?? true
    body = (
      <main className="join">
        {header(`${room.name} · ${me.name}`)}
        <div className="join__phase">
          <span className="gold-text">
            <Icon name={night ? 'moon' : 'sun'} size={28} />
          </span>
          <h1 aria-live="polite">{phase}</h1>
          <p className="muted">{phaseSub}</p>
        </div>
        <div className="join__alive" data-alive={alive}>
          <span className="dot" />
          {alive ? 'Bạn đang còn sống' : 'Bạn đã bị loại'}
          {myPub?.chief && ' · Trưởng làng'}
          {alive && myPub && !myPub.canVote && ' · không còn quyền bỏ phiếu'}
        </div>
        {pub && pub.phase === 'day' && pub.announcements.length > 0 && (
          <section className="join__room">
            <h2>Đã bị loại</h2>
            <ul className="pills">
              {pub.announcements.map((d) => (
                <li key={d.id} className="pill">
                  {d.name}
                  {d.role && <span className="muted pill__host">· {d.role.name}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        <HoldToReveal role={role} />
        <p className="muted pretty join__rules">
          Làm theo hiệu lệnh của quản trò. Ban đêm nhắm mắt, chỉ mở khi được gọi. Bỏ phiếu bằng tay
          vào ban ngày.
        </p>
      </main>
    )
  }

  return (
    <Paper size="narrow" label="Người chơi">
      {!snap.live && (
        <div className="offline-banner" role="status">
          Đang kết nối lại…
        </div>
      )}
      {body}
      {confirmLeave && (
        <Dialog
          title="Rời phòng?"
          onClose={() => setConfirmLeave(false)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmLeave(false)}>
                Ở lại
              </button>
              <button className="btn btn-danger" disabled={busy} onClick={() => void leave()}>
                Rời phòng
              </button>
            </>
          }
        >
          <p className="dialog__body">
            {sent
              ? 'Ván đã bắt đầu: bạn vẫn có vai trong ván nhưng sẽ không xem được trên máy này nữa. Mất mạng tạm thời thì không cần rời phòng.'
              : 'Tên của bạn sẽ bị xóa khỏi danh sách phòng.'}
          </p>
        </Dialog>
      )}
    </Paper>
  )
}
