import { useEffect, useState } from 'react'
import { buildDeck } from '@engine'
import { useFeedback } from '@/app/feedback'
import { Icon } from '@/components/Icon'
import { Dialog } from '@/components/overlay'
import { BottomBar, Paper, Stepper, TopBar } from '@/components/ui'
import { cssVars } from '@/lib/css'
import { prefersReducedMotion } from '@/lib/media'
import { useHost, useStepper } from '@/features/host/context'
import { viewOf } from '@/features/roles/roles'
import './assign.css'

const COPY = {
  idle: {
    title: 'Chia vai ngẫu nhiên',
    sub: 'Máy chủ xáo bộ vai và chia ngẫu nhiên cho từng người trong phòng. Chỉ quản trò thấy bảng này.',
  },
  shuffling: { title: 'Đang xáo bài…', sub: 'Máy chủ đang chia ngẫu nhiên cho từng người.' },
  done: {
    title: 'Kiểm tra trước khi gửi',
    sub: 'Xáo lại nếu muốn. Người chơi chưa nhận được gì cho tới khi bạn bấm Gửi.',
  },
  sent: {
    title: 'Đã gửi vai',
    sub: 'Mỗi người nhận vai trên máy của mình. Theo dõi ai đã mở vai.',
  },
}

export function AssignScreen() {
  const fb = useFeedback()
  const { snap, run, setView, startDeal, room } = useHost()
  const stepper = useStepper()
  const state = snap.secrets
  const [hide, setHide] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [confirmStart, setConfirmStart] = useState(false)

  useEffect(() => {
    if (!animating) return
    const id = setInterval(() => setTick((t) => t + 1), 85)
    return () => clearInterval(id)
  }, [animating])

  if (!state) return null
  const stage = animating
    ? 'shuffling'
    : state.status === 'setup'
      ? 'idle'
      : state.status === 'dealt'
        ? 'done'
        : 'sent'
  const deck = buildDeck(state.counts)
  const members = snap.members.filter((m) => m.status === 'active')
  const viewedAt = new Map(snap.assignments.map((a) => [a.member_id, a.viewed_at]))
  const rows =
    state.players.length > 0
      ? state.players.map((p) => ({
          id: p.id,
          name: p.name,
          seat: p.seat,
          device: p.device,
          roleId: p.roleId as string | undefined,
        }))
      : members.map((m) => ({
          id: m.id,
          name: m.name,
          seat: m.seat,
          device: m.device,
          roleId: undefined,
        }))
  const n = rows.length
  const viewed = rows.filter((r) => viewedAt.get(r.id)).length
  const offline = rows.filter((r) => !r.device).length

  const deal = async () => {
    setBusy(true)
    const reduce = prefersReducedMotion()
    if (!reduce) setAnimating(true)
    const started = Date.now()
    const ok = await run({ type: 'deal' }, { silent: true })
    // Animation chỉ biểu diễn: kết quả là bản chia của máy chủ, hiện ra khi animation dừng.
    const wait = reduce ? 0 : Math.max(0, 1200 - (Date.now() - started))
    setTimeout(() => {
      setAnimating(false)
      setBusy(false)
      if (!ok) return
    }, wait)
  }

  const send = async () => {
    setBusy(true)
    if (await run({ type: 'send' })) fb.toast('Đã gửi vai. Người chơi mở máy để xem vai của mình.')
    setBusy(false)
  }

  const start = async () => {
    setConfirmStart(false)
    setBusy(true)
    await run({ type: 'start' })
    setBusy(false)
  }

  return (
    <Paper label="Chia vai">
      <TopBar
        onBack={() => setView(state.status === 'sent' ? 'lobby' : 'roles')}
        backLabel={state.status === 'sent' ? 'Về phòng chờ' : 'Quay lại bộ vai'}
        title="Chia vai"
      >
        <Stepper steps={stepper} label="Tiến trình" />
      </TopBar>
      <main className="assign">
        <div className="assign__head">
          <div className="hero">
            <div className="eyebrow">
              {deck.length} thẻ · {n} người
            </div>
            <h1>{COPY[stage].title}</h1>
            <p>{COPY[stage].sub}</p>
          </div>
          <button className="btn btn-secondary" onClick={() => setHide(!hide)} aria-pressed={hide}>
            <Icon name={hide ? 'eye' : 'eyeOff'} size={18} />
            {hide ? 'Hiện vai' : 'Giấu vai'}
          </button>
        </div>

        {stage === 'sent' && (
          <div className="assign__progress">
            <span aria-live="polite">
              {viewed}/{n} người đã xem vai
            </span>
            <div
              className="progress"
              style={cssVars({ '--pct': (n ? (viewed / n) * 100 : 0) + '%' })}
            >
              <span />
            </div>
          </div>
        )}
        {offline > 0 && (
          <p className="muted inline-icon assign__note">
            <Icon name="alert" size={15} />
            {offline} người không có điện thoại sẽ xem vai trên máy quản trò.
          </p>
        )}

        <ol className="assign__list">
          {rows.map((o, i) => {
            const rid =
              stage === 'shuffling' && deck.length ? deck[(i * 3 + tick) % deck.length] : o.roleId
            const hidden = (hide || stage === 'shuffling') && !!rid
            const v = rid ? viewOf(rid, state.customRoles) : null
            const seen = !!viewedAt.get(o.id)
            return (
              <li key={o.id} className="assign__row" data-shuffling={stage === 'shuffling'}>
                <span className="assign__seat tabular">{o.seat}</span>
                <span className="assign__who">
                  <span className="assign__name">{o.name}</span>
                  {!o.device && <span className="muted assign__offline">Không có điện thoại</span>}
                </span>
                <span className="assign__role" data-team={hidden || !v ? 'hidden' : v.team}>
                  {v && <Icon name={hidden ? 'lock' : v.icon} size={18} />}
                  {stage === 'shuffling' ? '…' : hidden ? 'Đã giấu' : (v?.name ?? '—')}
                </span>
                {stage === 'sent' && (
                  <span className="assign__status" data-viewed={seen}>
                    <Icon name={seen ? 'check' : 'timer'} size={15} />
                    {seen
                      ? 'Đã xem vai'
                      : o.device
                        ? snap.online.has(o.id)
                          ? 'Đã gửi · chờ mở'
                          : 'Đã gửi · mất kết nối'
                        : 'Chưa xem'}
                  </span>
                )}
                {stage === 'sent' && !o.device && !seen && (
                  <button className="btn btn-ink" onClick={() => startDeal([o.id], 'assign')}>
                    <Icon name="eye" />
                    Xem trên máy này
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      </main>

      <BottomBar>
        {stage === 'idle' && (
          <button
            className="btn btn-ink btn-xl assign__main"
            onClick={deal}
            disabled={busy || room.status !== 'locked'}
          >
            <Icon name="sparkles" />
            Chia vai ngẫu nhiên
          </button>
        )}
        {stage === 'shuffling' && (
          <button className="btn btn-ink btn-xl assign__main" disabled>
            Đang xáo bài…
          </button>
        )}
        {stage === 'done' && (
          <>
            <button className="btn btn-secondary btn-lg" onClick={deal} disabled={busy}>
              <Icon name="reset" />
              Xáo lại
            </button>
            <button className="btn btn-ink btn-lg bar-push" onClick={send} disabled={busy}>
              Gửi vai cho người chơi
              <Icon name="right" />
            </button>
          </>
        )}
        {stage === 'sent' && (
          <>
            <span className="bottom-bar__hint">
              {viewed}/{n} người đã xem vai
            </span>
            <button
              className="btn btn-ink btn-lg bar-push"
              disabled={busy}
              onClick={() => (viewed < n ? setConfirmStart(true) : void start())}
            >
              <Icon name="moon" />
              Bắt đầu Đêm 1
            </button>
          </>
        )}
      </BottomBar>

      {confirmStart && (
        <Dialog
          title="Chưa phải ai cũng xem vai"
          onClose={() => setConfirmStart(false)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmStart(false)}>
                Chờ thêm
              </button>
              <button className="btn btn-ink" onClick={() => void start()}>
                Vẫn bắt đầu
              </button>
            </>
          }
        >
          <p className="dialog__body">
            {viewed}/{n} người đã xem vai. Bắt đầu đêm bây giờ, người chưa xem vẫn mở được vai trên
            máy của mình; người không có điện thoại xem trên máy quản trò từ bàn điều hành.
          </p>
        </Dialog>
      )}
    </Paper>
  )
}
