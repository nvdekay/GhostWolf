import { useState } from 'react'
import { useFeedback } from '@/app/feedback'
import { Icon } from '@/components/Icon'
import { Dialog } from '@/components/overlay'
import { Crescent, FlipCard, Paper } from '@/components/ui'
import { cssVars } from '@/lib/css'
import { prefersReducedMotion } from '@/lib/media'
import { refreshRoom } from '@/realtime/roomStore'
import { hostAckRole } from '@/services/rooms'
import { useHost } from '@/features/host/context'
import { roleView } from '@/features/roles/roles'
import './assign.css'

/**
 * Người không có điện thoại xem vai trên máy quản trò.
 * Màn bàn giao trung tính (không có bảng vai) → lật thẻ → ẩn → trả máy.
 */
export function DealScreen({ onDone }: { onDone: () => void }) {
  const fb = useFeedback()
  const { dealFor, snap, game, room } = useHost()
  const [i, setI] = useState(0)
  const [stage, setStage] = useState<'handoff' | 'reveal' | 'done'>('handoff')
  const [flipped, setFlipped] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)
  const [busy, setBusy] = useState(false)

  const order = dealFor
    .map((id) => ({
      member: snap.members.find((m) => m.id === id),
      a: snap.assignments.find((x) => x.member_id === id),
    }))
    .filter((x) => x.member && x.a)
  const n = order.length
  const cur = order[Math.min(i, n - 1)]
  if (!cur || !game) return null
  const role = stage === 'reveal' ? roleView(cur.a!.role) : null

  const reveal = () => {
    const reduce = prefersReducedMotion()
    setStage('reveal')
    setFlipped(reduce)
    if (!reduce) setTimeout(() => setFlipped(true), 80)
  }

  const hide = async () => {
    setBusy(true)
    try {
      await hostAckRole(game.id, cur.member!.id)
    } catch (e) {
      fb.error(e)
    }
    setBusy(false)
    setFlipped(false)
    if (i + 1 < n) {
      setI(i + 1)
      setStage('handoff')
    } else setStage('done')
  }

  const finish = async () => {
    await refreshRoom(room.id)
    onDone()
  }

  return (
    <Paper size="narrow" label="Xem vai trên máy quản trò">
      <header className="deal__head">
        <div className="deal__bar">
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => setConfirmExit(true)}
            aria-label="Dừng xem vai"
          >
            <Icon name="x" />
          </button>
          <div className="eyebrow eyebrow--muted deal__label">Xem vai bí mật</div>
          <div className="gold-text tabular">
            Người {Math.min(i + 1, n)} / {n}
          </div>
        </div>
        <div aria-hidden="true" className="deal__segs">
          {order.map((o, j) => (
            <span
              key={o.member!.id}
              data-state={j < i || stage === 'done' ? 'done' : j === i ? 'current' : 'todo'}
            />
          ))}
        </div>
      </header>
      <main className="deal">
        {stage === 'handoff' && (
          <>
            <div className="deal__center">
              <div className="moon-ring" style={cssVars({ '--size': '120px' })}>
                <Crescent size={64} />
              </div>
              <div className="eyebrow">Lượt tiếp theo</div>
              <h1 className="deal__title">
                Đưa máy cho
                <br />
                <em>{cur.member!.name}</em>
              </h1>
              <p className="muted pretty deal__sub">
                Chỉ {cur.member!.name} nhìn màn hình. Những người khác quay đi trong giây lát.
              </p>
            </div>
            <button className="btn btn-ink btn-block deal__btn" onClick={reveal}>
              <Icon name="eye" />
              Xem vai của tôi
            </button>
          </>
        )}
        {stage === 'reveal' && (
          <div className="deal__reveal">
            <div className="muted deal__whose">Vai của {cur.member!.name}</div>
            <FlipCard
              role={role}
              flipped={flipped}
              animate={!prefersReducedMotion()}
              footnote="Ghi nhớ vai rồi ẩn đi. Đừng nói vai cho người khác."
            />
            <button className="btn btn-ink btn-block deal__btn" onClick={hide} disabled={busy}>
              <Icon name="eyeOff" />
              {i + 1 < n ? 'Ẩn vai và chuyển người tiếp theo' : 'Ẩn vai và hoàn tất'}
            </button>
          </div>
        )}
        {stage === 'done' && (
          <>
            <div className="deal__center">
              <span className="gold-text">
                <Icon name="check" />
              </span>
              <h1 className="deal__title">Đã xem vai</h1>
              <p className="muted deal__sub">Đưa máy lại cho quản trò.</p>
            </div>
            <button className="btn btn-ink btn-block deal__btn" onClick={() => void finish()}>
              Quản trò: quay lại
            </button>
          </>
        )}
      </main>
      {confirmExit && (
        <Dialog
          title="Dừng xem vai?"
          onClose={() => setConfirmExit(false)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmExit(false)}>
                Tiếp tục
              </button>
              <button className="btn btn-ink" onClick={() => void finish()}>
                Quay lại
              </button>
            </>
          }
        >
          <p className="dialog__body">
            Người chưa xem vẫn có thể xem sau. Vai đã chia không thay đổi.
          </p>
        </Dialog>
      )}
    </Paper>
  )
}
