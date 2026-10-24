import { useEffect, useRef, useState, type ReactNode } from 'react'
import { eligibleVoters, voteCandidates, votingChief, type DayStep, type GameState } from '@engine'
import { useFeedback } from '@/app/feedback'
import { Icon } from '@/components/Icon'
import { cssVars } from '@/lib/css'
import { useHost } from '@/features/host/context'
import { viewOf } from '@/features/roles/roles'
import { useTimer } from './useTimer'

const TABS: [Exclude<DayStep, 'after'>, string][] = [
  ['announce', 'Công bố'],
  ['discuss', 'Thảo luận'],
  ['vote', 'Bỏ phiếu'],
]
const ORDER: DayStep[] = ['announce', 'discuss', 'vote', 'after']

export interface VoteDraft {
  votes: Record<string, number>
  chiefVote: string | null
}

export function Timer({
  gameId,
  day,
  readOnly,
}: {
  gameId: string
  day: number
  readOnly?: boolean
}) {
  const fb = useFeedback()
  const t = useTimer(gameId, day)
  const warned = useRef(false)
  useEffect(() => {
    if (t.expired && !warned.current) {
      warned.current = true
      if (!readOnly) fb.toast('Hết giờ thảo luận')
    }
    if (!t.expired) warned.current = false
  }, [t.expired, fb, readOnly])
  const mm = Math.floor(t.left / 60)
  const ss = t.left % 60
  return (
    <>
      <div className="day-head">
        <h2>Thảo luận</h2>
        {!readOnly && (
          <div className="presets">
            {[2, 3, 5].map((min) => (
              <button
                key={min}
                className="chip chip--sm"
                aria-pressed={t.total === min * 60}
                onClick={() => t.preset(min * 60)}
              >
                {min} phút
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        role="timer"
        aria-live="off"
        aria-label={`Còn ${mm} phút ${ss} giây`}
        className="timer tabular"
        data-low={t.left <= 30}
      >
        {mm}:{String(ss).padStart(2, '0')}
      </div>
      <div
        className="timer-bar"
        style={cssVars({ '--pct': (t.total ? (t.left / t.total) * 100 : 0) + '%' })}
      >
        <span />
      </div>
      {!readOnly && (
        <div className="timer-actions">
          <button
            className="btn btn-ink btn-lg timer-actions__main"
            onClick={t.running ? t.pause : t.start}
            disabled={t.left === 0}
          >
            <Icon name={t.running ? 'pause' : 'play'} />
            {t.running ? 'Tạm dừng' : t.left < t.total ? 'Tiếp tục' : 'Bắt đầu'}
          </button>
          <button className="btn btn-secondary" onClick={() => t.add(30)}>
            +30 giây
          </button>
          <button className="btn btn-secondary" onClick={t.reset} aria-label="Đặt lại đồng hồ">
            <Icon name="reset" />
            Đặt lại
          </button>
        </div>
      )}
    </>
  )
}

function VoteStep({
  s,
  draft,
  setDraft,
  onEliminate,
}: {
  s: GameState
  draft: VoteDraft
  setDraft: (d: VoteDraft) => void
  onEliminate: (id: string, reason?: string) => void
}) {
  const { run } = useHost()
  const [reason, setReason] = useState('')
  const d = s.dayState!
  const result = d.result
  const candidates = voteCandidates(s)
  const maxRaw = eligibleVoters(s).length
  const chief = votingChief(s)
  const sum = candidates.reduce((a, p) => a + (draft.votes[p.id] ?? 0), 0)
  const over = sum > maxRaw
  const set = (id: string, v: number) =>
    setDraft({ ...draft, votes: { ...draft.votes, [id]: Math.max(0, v) } })
  const nameOf = (id: string) => s.players.find((p) => p.id === id)?.name ?? ''
  const noVoteRight = s.players.filter((p) => p.alive && !p.canVote)

  return (
    <>
      <h2>Bỏ phiếu</h2>
      {d.voteOnly && (
        <p className="gold-text">Đang bỏ phiếu lại giữa: {d.voteOnly.map(nameOf).join(', ')}</p>
      )}
      {!result && (
        <>
          <p className="muted panel-note">
            Đếm tay rồi nhập số phiếu cho từng người (mỗi người có quyền bầu một phiếu). Có thể chạm
            tên trên sơ đồ để cộng nhanh 1 phiếu.
          </p>
          {noVoteRight.length > 0 && (
            <p className="muted panel-note">
              Không có quyền bầu: {noVoteRight.map((p) => p.name).join(', ')}
            </p>
          )}
          <ul className="votes">
            {candidates.map((p) => {
              const v = draft.votes[p.id] ?? 0
              return (
                <li key={p.id}>
                  <span
                    className="votes__bar"
                    style={cssVars({
                      '--pct': Math.min(100, (v / Math.max(1, maxRaw)) * 100) + '%',
                    })}
                  />
                  <span className="votes__name">{p.name}</span>
                  <button
                    className="btn btn-ghost btn-ghost--muted btn-icon"
                    onClick={() => set(p.id, v - 1)}
                    disabled={v === 0}
                    aria-label={`Bớt phiếu cho ${p.name}`}
                  >
                    <Icon name="minus" />
                  </button>
                  <span className="votes__num tabular" aria-live="polite">
                    {v}
                  </span>
                  <button
                    className="btn btn-ink btn-icon"
                    onClick={() => set(p.id, v + 1)}
                    aria-label={`Thêm phiếu cho ${p.name}`}
                  >
                    <Icon name="plus" />
                  </button>
                </li>
              )
            })}
          </ul>
          {chief && (
            <div className="field">
              <label htmlFor="chiefvote">
                <Icon name="crown" size={15} /> Trưởng làng {chief.name} bầu cho (tính thêm 1 phiếu,
                phiếu tay của Trưởng làng đã đếm ở trên)
              </label>
              <select
                id="chiefvote"
                className="input"
                value={draft.chiefVote ?? ''}
                onChange={(e) => setDraft({ ...draft, chiefVote: e.target.value || null })}
              >
                <option value="">Không bầu / bỏ phiếu trắng</option>
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="votes__foot" data-over={over}>
            <span className="tabular">
              {sum}/{maxRaw} phiếu · {over ? `vượt ${sum - maxRaw}` : `${maxRaw - sum} bỏ trắng`}
            </span>
            <button
              className="btn btn-ghost"
              onClick={() => setDraft({ votes: {}, chiefVote: null })}
            >
              Xóa phiếu
            </button>
          </div>
          <button
            className="btn btn-ghost vote-redo"
            onClick={() => void run({ type: 'vote.skip' })}
          >
            Hôm nay không ai bị loại
          </button>
        </>
      )}
      {result && result.top.length === 1 && (
        <>
          <div className="vote-result vote-result--single">
            <span className="muted">Nhiều phiếu nhất</span>
            <span className="vote-result__name">{nameOf(result.top[0]!)}</span>
            <span className="muted tabular">
              {result.max} phiếu · {result.abstain} bỏ trắng
            </span>
          </div>
          <button
            className="btn btn-ghost vote-redo"
            onClick={() => void run({ type: 'vote.clear' })}
          >
            <Icon name="pencil" />
            Sửa phiếu
          </button>
        </>
      )}
      {result && result.top.length > 1 && (
        <>
          <div className="vote-result vote-result--tie">
            <span className="gold-text inline-icon">
              <Icon name="alert" size={15} />
              Hòa phiếu
            </span>
            <span className="vote-result__name vote-result__name--tie">
              {result.top.map(nameOf).join(', ')}
            </span>
            <span className="muted">cùng {result.max} phiếu</span>
          </div>
          <div className="tie-actions">
            <button className="btn btn-ink" onClick={() => void run({ type: 'vote.revote' })}>
              <Icon name="vote" />
              Bỏ phiếu lại giữa những người hòa
            </button>
            <button className="btn btn-secondary" onClick={() => void run({ type: 'vote.skip' })}>
              Hôm nay không ai bị loại
            </button>
          </div>
          <div className="field">
            <label htmlFor="tiereason">
              Hoặc Trưởng làng / quản trò quyết định loại — ghi lý do
            </label>
            <input
              id="tiereason"
              className="input"
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ví dụ: Trưởng làng quyết định"
            />
          </div>
          <div className="tie-picks">
            {result.top.map((id) => (
              <button
                key={id}
                className="btn btn-secondary"
                disabled={!reason.trim()}
                onClick={() => onEliminate(id, reason.trim())}
              >
                Loại {nameOf(id)}
              </button>
            ))}
          </div>
          <button
            className="btn btn-ghost vote-redo"
            onClick={() => void run({ type: 'vote.clear' })}
          >
            <Icon name="pencil" />
            Sửa phiếu
          </button>
        </>
      )}
    </>
  )
}

export function DayPanel({
  s,
  gameId,
  draft,
  setDraft,
  onEliminate,
  footer,
}: {
  s: GameState
  gameId: string
  draft: VoteDraft
  setDraft: (d: VoteDraft) => void
  onEliminate: (id: string, reason?: string) => void
  footer: ReactNode
}) {
  const { run } = useHost()
  const d = s.dayState!
  const ci = ORDER.indexOf(d.step)
  const deaths = s.lastDeaths.map((id) => s.players.find((p) => p.id === id)!)
  const chiefHint =
    s.day === 1 && s.options.chief && !s.players.some((p) => p.chief) && d.step === 'announce'

  return (
    <>
      <div role="tablist" aria-label="Giai đoạn ban ngày" className="day-tabs">
        {TABS.map(([k, label], i) => (
          <button
            key={k}
            role="tab"
            aria-selected={d.step === k}
            data-past={i < ci}
            className="day-tab"
            disabled={d.resolved || i > ci + 1 || s.effects.length > 0}
            onClick={() => d.step !== k && void run({ type: 'day.goto', step: k })}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>
      <div className="panel-card">
        {d.step === 'announce' && (
          <>
            <h2>Trời sáng</h2>
            {deaths.length > 0 ? (
              <>
                <p className="muted">Công bố với cả làng:</p>
                <ul className="deaths">
                  {deaths.map((p) => (
                    <li key={p.id}>
                      <Icon name="skull" size={15} />
                      <span className="deaths__name">
                        <strong>{p.name}</strong> đã bị loại
                      </span>
                      <span className="muted deaths__role">
                        {viewOf(p.roleId, s.customRoles).name}
                        {s.options.revealOnDeath ? ' · công khai' : ' · chỉ quản trò thấy'}
                      </span>
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
        {d.step === 'discuss' && <Timer gameId={gameId} day={s.day} />}
        {d.step === 'vote' && (
          <VoteStep s={s} draft={draft} setDraft={setDraft} onEliminate={onEliminate} />
        )}
        {d.step === 'after' && (
          <>
            <h2>Ngày {s.day} đã xong</h2>
            <p className="muted">
              Cả làng chuẩn bị đi ngủ. Xem lại nhật ký nếu cần trước khi sang đêm.
            </p>
          </>
        )}
        {footer}
      </div>
    </>
  )
}
