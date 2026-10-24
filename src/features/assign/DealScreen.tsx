import { setState, useAppState } from '@/app/store'
import { Icon } from '@/components/Icon'
import { Crescent, FlipCard, Paper } from '@/components/ui'
import { cssVars } from '@/lib/css'
import { prefersReducedMotion } from '@/lib/media'
import { viewOf } from '@/features/roles/roles'
import { finishDeal, hideRole, revealRole } from './actions'
import './assign.css'

export function DealScreen() {
  const { deal: d } = useAppState()
  if (!d) return null

  const n = d.order.length
  const cur = d.order[Math.min(d.i, n - 1)]!
  const role = d.stage === 'reveal' ? viewOf(cur.roleId) : null

  return (
    <Paper size="narrow" label="Chia vai bí mật">
      <header className="deal__head">
        <div className="deal__bar">
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => setState({ dialog: 'exitDeal' })}
            aria-label="Dừng chia vai"
          >
            <Icon name="x" />
          </button>
          <div className="eyebrow eyebrow--muted deal__label">Chia vai bí mật</div>
          <div className="gold-text tabular">
            Người {Math.min(d.i + 1, n)} / {n}
          </div>
        </div>
        <div aria-hidden="true" className="deal__segs">
          {d.order.map((o, j) => (
            <span key={o.pid} data-state={j < d.i ? 'done' : j === d.i ? 'current' : 'todo'} />
          ))}
        </div>
      </header>
      <main className="deal">
        {d.stage === 'handoff' && (
          <>
            <div className="deal__center">
              <div className="moon-ring" style={cssVars({ '--size': '120px' })}>
                <Crescent size={64} />
              </div>
              <div className="eyebrow">Lượt tiếp theo</div>
              <h1 className="deal__title">
                Đưa máy cho
                <br />
                <em>{cur.name}</em>
              </h1>
              <p className="muted pretty deal__sub">
                Chỉ {cur.name} nhìn màn hình. Những người khác quay đi trong giây lát.
              </p>
            </div>
            <button className="btn btn-ink btn-block deal__btn" onClick={revealRole}>
              <Icon name="eye" />
              Xem vai của tôi
            </button>
          </>
        )}
        {d.stage === 'reveal' && (
          <div className="deal__reveal">
            <div className="muted deal__whose">Vai của {cur.name}</div>
            <FlipCard
              role={role}
              flipped={d.flipped}
              animate={!prefersReducedMotion()}
              footnote="Ghi nhớ vai rồi ẩn đi. Đừng nói vai cho người khác."
            />
            <button className="btn btn-ink btn-block deal__btn" onClick={hideRole}>
              <Icon name="eyeOff" />
              {d.i + 1 < n ? 'Ẩn vai và chuyển người tiếp theo' : 'Ẩn vai và hoàn tất'}
            </button>
          </div>
        )}
        {d.stage === 'done' && (
          <>
            <div className="deal__center">
              <span className="gold-text">
                <Icon name="check" />
              </span>
              <h1 className="deal__title">{d.local ? 'Đã xem vai' : 'Mọi người đã nhận vai'}</h1>
              <p className="muted deal__sub">
                {d.local
                  ? 'Đưa máy lại cho quản trò.'
                  : 'Đưa máy cho quản trò. Màn đêm đầu tiên sẽ bắt đầu.'}
              </p>
            </div>
            <button className="btn btn-ink btn-block deal__btn" onClick={finishDeal}>
              {d.local ? 'Quay lại bảng chia vai' : 'Vào bàn quản trò'}
            </button>
          </>
        )}
      </main>
    </Paper>
  )
}
