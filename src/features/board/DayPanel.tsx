import { setState, useAppState } from '@/app/store'
import { Icon } from '@/components/Icon'
import { cssVars } from '@/lib/css'
import type { DayStep, Game } from '@/types/game'
import { findRole } from '@/features/roles/roles'
import { addVote, noElimination, revote, updateGame } from './actions'
import { playerById } from './logic'
import type { BoardModel } from './useBoard'

const DAY_TABS: [DayStep, string][] = [
  ['announce', 'Công bố'],
  ['discuss', 'Thảo luận'],
  ['vote', 'Bỏ phiếu'],
]
const DAY_ORDER: DayStep[] = ['announce', 'discuss', 'vote', 'after']

function Timer() {
  const { timer: t } = useAppState()
  const mm = Math.floor(t.left / 60)
  const ss = t.left % 60
  const set = (patch: Partial<typeof t>) => setState({ timer: { ...t, ...patch } })

  return (
    <>
      <div className="day-head">
        <h2>Thảo luận</h2>
        <div className="presets">
          {[2, 3, 5].map((min) => (
            <button
              key={min}
              className="chip chip--sm"
              aria-pressed={t.total === min * 60}
              onClick={() =>
                setState({ timer: { left: min * 60, total: min * 60, running: false } })
              }
            >
              {min} phút
            </button>
          ))}
        </div>
      </div>
      <div role="timer" aria-live="off" className="timer tabular" data-low={t.left <= 30}>
        {mm}:{String(ss).padStart(2, '0')}
      </div>
      <div
        className="timer-bar"
        style={cssVars({ '--pct': (t.total ? (t.left / t.total) * 100 : 0) + '%' })}
      >
        <span />
      </div>
      <div className="timer-actions">
        <button
          className="btn btn-ink btn-lg timer-actions__main"
          onClick={() => set({ running: !t.running })}
        >
          <Icon name={t.running ? 'pause' : 'play'} />
          {t.running ? 'Tạm dừng' : t.left < t.total ? 'Tiếp tục' : 'Bắt đầu'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => set({ left: t.left + 30, total: t.total + 30 })}
        >
          +30 giây
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => set({ left: t.total, running: false })}
          aria-label="Đặt lại đồng hồ"
        >
          <Icon name="reset" />
          Đặt lại
        </button>
      </div>
    </>
  )
}

function Vote({ g, m }: { g: Game; m: BoardModel }) {
  const chiefAlive = m.alive.some((p) => p.chief)
  const maxVotes = m.alive.length + (chiefAlive ? 1 : 0)
  const vr = g.voteRes
  const redo = () =>
    updateGame((x) => {
      x.voteRes = null
    })

  return (
    <>
      <h2>Bỏ phiếu</h2>
      {g.voteOnly && (
        <p className="gold-text">
          Đang bỏ phiếu lại giữa: {g.voteOnly.map((id) => playerById(g, id).name).join(', ')}
        </p>
      )}
      {!vr && (
        <>
          <p className="muted panel-note">
            Đếm tay rồi nhập số phiếu cho từng người. Có thể chạm tên trên sơ đồ để cộng nhanh 1
            phiếu.
          </p>
          {chiefAlive && (
            <p className="muted panel-note">
              <Icon name="crown" size={15} />
              Phiếu của Trưởng làng tính 2: cộng thêm 1 cho người Trưởng làng bầu.
            </p>
          )}
          <ul className="votes">
            {m.voteRows.map((v) => (
              <li key={v.id}>
                <span
                  className="votes__bar"
                  style={cssVars({
                    '--pct': Math.min(100, (v.v / Math.max(1, m.alive.length)) * 100) + '%',
                  })}
                />
                <span className="votes__name">{v.name}</span>
                <button
                  className="btn btn-ghost btn-ghost--muted btn-icon"
                  onClick={() => addVote(v.id, -1)}
                  disabled={v.v === 0}
                  aria-label={`Bớt phiếu cho ${v.name}`}
                >
                  <Icon name="minus" />
                </button>
                <span className="votes__num tabular">{v.v}</span>
                <button
                  className="btn btn-ink btn-icon"
                  onClick={() => addVote(v.id)}
                  aria-label={`Thêm phiếu cho ${v.name}`}
                >
                  <Icon name="plus" />
                </button>
              </li>
            ))}
          </ul>
          <div className="votes__foot">
            <span className="tabular">
              {m.voteTotal} phiếu đã nhập · tối đa {maxVotes}
            </span>
            <button
              className="btn btn-ghost"
              onClick={() =>
                updateGame((x) => {
                  x.votes = {}
                  x.voteRes = null
                })
              }
            >
              Xóa phiếu
            </button>
          </div>
        </>
      )}
      {vr && m.top.length === 1 && (
        <>
          <div className="vote-result vote-result--single">
            <span className="muted">Nhiều phiếu nhất</span>
            <span className="vote-result__name">{m.top[0]!.name}</span>
            <span className="muted tabular">{vr.max} phiếu</span>
          </div>
          <button className="btn btn-ghost vote-redo" onClick={redo}>
            <Icon name="pencil" />
            Sửa phiếu
          </button>
        </>
      )}
      {vr && m.top.length > 1 && (
        <>
          <div className="vote-result vote-result--tie">
            <span className="gold-text inline-icon">
              <Icon name="alert" size={15} />
              Hòa phiếu
            </span>
            <span className="vote-result__name vote-result__name--tie">
              {m.top.map((p) => p.name).join(', ')}
            </span>
            <span className="muted">cùng {vr.max} phiếu</span>
          </div>
          <div className="tie-actions">
            <button className="btn btn-ink" onClick={revote}>
              <Icon name="vote" />
              Bỏ phiếu lại giữa những người hòa
            </button>
            <button className="btn btn-secondary" onClick={noElimination}>
              Hôm nay không ai bị loại
            </button>
          </div>
          <div className="muted panel-note">Hoặc Trưởng làng / quản trò quyết định loại:</div>
          <div className="tie-picks">
            {m.top.map((p) => (
              <button key={p.id} className="btn btn-secondary" onClick={() => m.elim(p.id)}>
                Loại {p.name}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost vote-redo" onClick={redo}>
            <Icon name="pencil" />
            Sửa phiếu
          </button>
        </>
      )}
    </>
  )
}

export function DayPanel({ g, m, desk }: { g: Game; m: BoardModel; desk: boolean }) {
  const { shared, cfg, chief } = useAppState()
  const ci = DAY_ORDER.indexOf(g.dayStep)
  const deaths = g.lastDeaths.map((id) => {
    const p = playerById(g, id)
    const show = !shared || cfg.reveal
    return { id, name: p.name, role: show ? findRole(p.roleId).name : '' }
  })
  const chiefHint =
    g.day === 1 && chief && !g.players.some((p) => p.chief) && g.dayStep === 'announce'

  return (
    <>
      <div role="tablist" aria-label="Giai đoạn ban ngày" className="day-tabs">
        {DAY_TABS.map(([k, label], i) => (
          <button
            key={k}
            role="tab"
            aria-selected={g.dayStep === k}
            data-past={i < ci}
            className="day-tab"
            onClick={() =>
              updateGame((x) => {
                x.dayStep = k
              })
            }
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>
      <div className="panel-card">
        {g.dayStep === 'announce' && (
          <>
            <h2>Trời sáng</h2>
            {deaths.length > 0 ? (
              <>
                <p className="muted">Công bố với cả làng:</p>
                <ul className="deaths">
                  {deaths.map((d) => (
                    <li key={d.id}>
                      <Icon name="skull" size={15} />
                      <span className="deaths__name">
                        <strong>{d.name}</strong> đã bị loại
                      </span>
                      {d.role && <span className="muted deaths__role">{d.role}</span>}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="big-line">Đêm qua không ai bị loại.</p>
            )}
            {chiefHint && (
              <p className="muted panel-note">
                <Icon name="crown" size={15} />
                Bầu Trưởng làng: chạm vào người được bầu, chọn “Đặt làm Trưởng làng”.
              </p>
            )}
          </>
        )}
        {g.dayStep === 'discuss' && <Timer />}
        {g.dayStep === 'vote' && <Vote g={g} m={m} />}
        {g.dayStep === 'after' && (
          <>
            <h2>Ngày {g.day} đã xong</h2>
            <p className="muted">
              Cả làng chuẩn bị đi ngủ. Xem lại nhật ký nếu cần trước khi sang đêm.
            </p>
          </>
        )}
        {desk && m.primary && (
          <div className="panel-card__foot">
            <button
              className="btn btn-ink btn-lg btn-block"
              onClick={m.primary.onClick}
              disabled={m.primary.disabled}
            >
              {m.primary.label}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
