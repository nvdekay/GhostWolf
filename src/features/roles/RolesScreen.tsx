import { setState, toast, useAppState } from '@/app/store'
import { Icon } from '@/components/Icon'
import {
  EmptyState,
  FilterChips,
  GmBadge,
  Paper,
  RoleMedal,
  Stepper,
  Switch,
  TeamBadge,
  TopBar,
} from '@/components/ui'
import { cx } from '@/lib/css'
import { useIsDesktop } from '@/lib/media'
import { useSetupStepper } from '@/features/setup/useSetupStepper'
import { PRESETS, presetSizeFor } from './catalog'
import {
  allRoles,
  decCount,
  findRole,
  incCount,
  isWolfTeam,
  roleTeam,
  roleView,
  totalCards,
} from './roles'
import { useRoleBrowser } from './useRoleBrowser'
import './roles.css'

function useDeckSummary() {
  const { players, counts } = useAppState()
  const n = players.length
  const total = totalCards(counts)
  const sum = (pred: (id: string) => boolean) =>
    Object.entries(counts).reduce((a, [id, c]) => a + (pred(id) ? c : 0), 0)
  const wolfN = sum(isWolfTeam)
  const village = sum((id) => roleTeam(id) === 'village')
  const solo = total - village - sum((id) => roleTeam(id) === 'wolf')
  const diff = total - n
  const ok = n > 0 && diff === 0 && wolfN > 0

  let status: {
    text: string
    tone: 'muted' | 'warn' | 'bad' | 'good'
    icon: 'info' | 'alert' | 'check'
  }
  if (total === 0) status = { text: `Chưa chọn vai · cần ${n} thẻ`, tone: 'muted', icon: 'info' }
  else if (diff < 0) status = { text: `Thiếu ${-diff} thẻ`, tone: 'warn', icon: 'alert' }
  else if (diff > 0) status = { text: `Thừa ${diff} thẻ`, tone: 'bad', icon: 'alert' }
  else if (wolfN === 0) status = { text: 'Chưa có Ma sói', tone: 'bad', icon: 'alert' }
  else status = { text: `Khớp ${n}/${n} người`, tone: 'good', icon: 'check' }

  const reason = ok
    ? 'Sẵn sàng chia vai.'
    : diff < 0
      ? `Thêm ${-diff} thẻ hoặc bấm “Điền Dân làng”.`
      : diff > 0
        ? `Bớt ${diff} thẻ để khớp ${n} người chơi.`
        : 'Bộ vai cần ít nhất một Ma sói.'

  return { n, total, diff, wolfN, village, solo, ok, status, reason }
}

function DeckPanel({ mobile }: { mobile: boolean }) {
  const { counts, gameName } = useAppState()
  const d = useDeckSummary()
  const selected = allRoles().filter((r) => counts[r.id])
  const close = () => setState({ rolesSheet: false })

  return (
    <>
      {mobile && (
        <div className="deck__grip">
          <span />
        </div>
      )}
      <div className="deck__head">
        <div className="deck__total">
          <span className="eyebrow">Bộ vai</span>
          <span className="deck__count tabular">
            {d.total}/{d.n}
            <span className="muted"> thẻ</span>
          </span>
        </div>
        {mobile && (
          <button className="btn btn-secondary btn-icon" onClick={close} aria-label="Đóng">
            <Icon name="x" />
          </button>
        )}
      </div>
      <div role="status" className="deck__status" data-tone={d.status.tone}>
        <Icon name={d.status.icon} />
        <span>{d.status.text}</span>
      </div>
      <div className="deck__teams">
        <div>
          <span className="muted">Phe Dân</span>
          <strong className="tabular">{d.village}</strong>
        </div>
        <div>
          <span className="danger-text">Phe Sói</span>
          <strong className="tabular">{d.wolfN}</strong>
        </div>
        <div>
          <span className="gold-text">Phe riêng</span>
          <strong className="tabular">{d.solo}</strong>
        </div>
      </div>
      {selected.length === 0 ? (
        <p className="muted deck__empty">
          Chưa có vai nào. Bấm + trên thẻ vai hoặc áp dụng bộ gợi ý.
        </p>
      ) : (
        <ul className="deck__list">
          {selected.map((r) => (
            <li key={r.id} data-team={r.team}>
              <span className="team-ink">
                <Icon name={r.icon} size={18} />
              </span>
              <span className="deck__name">{r.name}</span>
              <button
                className="btn btn-ghost btn-ghost--muted btn-icon"
                onClick={() => setState((s) => ({ counts: decCount(s.counts, r.id) }))}
                aria-label={`Bớt ${r.name}`}
              >
                <Icon name="minus" />
              </button>
              <span className="deck__num tabular">{counts[r.id]}</span>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setState((s) => ({ counts: incCount(s.counts, r.id) }))}
                aria-label={`Thêm ${r.name}`}
              >
                <Icon name="plus" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="deck__tools">
        <button
          className="btn btn-secondary"
          disabled={d.diff >= 0}
          onClick={() => {
            setState((s) => ({
              counts: { ...s.counts, villager: (s.counts.villager ?? 0) - d.diff },
            }))
            toast(`Đã thêm ${-d.diff} Dân làng`)
          }}
        >
          <Icon name="home" />
          Điền Dân làng
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => toast(`Đã lưu bộ vai “${gameName || 'Ván mới'}” · ${d.total} thẻ`)}
        >
          <Icon name="check" />
          Lưu bộ vai
        </button>
      </div>
      <div className="deck__go">
        <button
          className="btn btn-ink btn-lg btn-block"
          disabled={!d.ok}
          onClick={() => setState({ screen: 'assign', assign: null, rolesSheet: false })}
        >
          Tiếp tục: chia vai
          <Icon name="right" />
        </button>
        <span className="muted deck__reason">{d.reason}</span>
      </div>
    </>
  )
}

export function RolesScreen() {
  const { counts, chief, autoSug, rolesSheet } = useAppState()
  const desk = useIsDesktop()
  const stepper = useSetupStepper()
  const browser = useRoleBrowser()
  const d = useDeckSummary()

  const sugN = presetSizeFor(d.n)
  const exact = !!PRESETS[d.n]
  const sugDesc = sugN
    ? Object.entries(PRESETS[sugN]!)
        .map(([id, c]) => `${c} ${findRole(id).name}`)
        .join(' · ') + (exact ? '' : ` · bấm Điền Dân làng cho ${d.n - sugN} chỗ còn lại`)
    : ''

  return (
    <Paper label="Chọn bộ vai">
      <TopBar
        onBack={() => setState({ screen: 'lobby' })}
        backLabel="Quay lại người chơi"
        title="Chọn bộ vai"
        wide
      >
        <Stepper steps={stepper} label="Tiến trình thiết lập" />
      </TopBar>
      <div className="roles">
        <main className="roles__main">
          {sugN && d.total === 0 && (
            <div className="suggest">
              <div className="suggest__text">
                <span className="suggest__title">
                  {exact ? `Gợi ý cho ${d.n} người` : `Gợi ý gần nhất: ${sugN} người`}
                </span>
                <span className="muted">{sugDesc}</span>
              </div>
              <button
                className="btn btn-ink"
                onClick={() => setState({ counts: { ...PRESETS[sugN] } })}
              >
                Áp dụng
              </button>
            </div>
          )}
          {autoSug && d.total > 0 && (
            <div role="status" className="suggest suggest--auto">
              <span className="gold-text">
                <Icon name="sparkles" />
              </span>
              <span className="suggest__auto-text">
                Đã điền sẵn bộ vai gợi ý cho {d.n} người. Chỉnh tùy ý trước khi chia.
              </span>
              <button className="btn btn-ghost" onClick={() => setState({ counts: {} })}>
                Xóa hết
              </button>
              <button
                className="btn btn-ghost btn-ghost--muted btn-icon"
                onClick={() => setState({ autoSug: false })}
                aria-label="Đóng thông báo"
              >
                <Icon name="x" />
              </button>
            </div>
          )}

          <div className="roles__filters">
            <div className="search">
              <Icon name="search" />
              <input
                className="input"
                type="search"
                aria-label="Tìm vai"
                value={browser.query}
                onChange={(e) => browser.setQuery(e.target.value)}
                placeholder="Tìm vai, ví dụ: tiên tri"
              />
            </div>
            <FilterChips items={browser.filters} label="Lọc theo phe" />
          </div>

          {browser.results.length === 0 && (
            <EmptyState icon="search" title={`Không tìm thấy vai “${browser.query}”`}>
              <p>Thử từ khóa khác, đổi bộ lọc phe, hoặc tạo vai riêng cho nhóm.</p>
              <div className="empty__actions">
                <button className="btn btn-secondary" onClick={browser.clearQuery}>
                  Xóa tìm kiếm
                </button>
                <button className="btn btn-ink" onClick={browser.openCustom}>
                  <Icon name="plus" />
                  Tạo vai tùy chỉnh
                </button>
              </div>
            </EmptyState>
          )}

          <div className="tile-grid">
            {browser.results.map((r) => {
              const v = roleView(r)
              const c = counts[r.id] ?? 0
              return (
                <div key={r.id} className={cx('tile', c > 0 && 'tile--on')} data-team={v.team}>
                  <button
                    className="tile__body"
                    onClick={() => browser.openRole(r.id)}
                    aria-label={`Xem chi tiết ${v.name}`}
                  >
                    <RoleMedal team={v.team} icon={v.icon} size={54} iconSize={26} />
                    <span className="tile__text">
                      <span className="tile__name">{v.name}</span>
                      <span className="badges">
                        <TeamBadge view={v} />
                        {v.gm && <GmBadge />}
                        {v.custom && <span className="custom-badge">Tùy chỉnh</span>}
                      </span>
                      <span className="tile__short">{v.short}</span>
                    </span>
                  </button>
                  <div className="tile__foot">
                    <span className={cx('tile__count tabular', c > 0 && 'gold-text')}>
                      {c ? `${c} thẻ` : 'Chưa chọn'}
                    </span>
                    <div className="counter">
                      <button
                        className="btn btn-secondary btn-icon"
                        onClick={() => setState((s) => ({ counts: decCount(s.counts, r.id) }))}
                        disabled={c === 0}
                        aria-label={`Bớt một ${v.name}`}
                      >
                        <Icon name="minus" />
                      </button>
                      <span aria-live="polite" className="counter__value">
                        {c}
                      </span>
                      <button
                        className="btn btn-ink btn-icon"
                        onClick={() => setState((s) => ({ counts: incCount(s.counts, r.id) }))}
                        aria-label={`Thêm một ${v.name}`}
                      >
                        <Icon name="plus" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
            {browser.results.length > 0 && (
              <button className="tile-add" onClick={browser.openCustom}>
                <Icon name="plus" />
                <span className="tile-add__title">Thêm vai tùy chỉnh</span>
                <span className="muted">Cho luật riêng của nhóm</span>
              </button>
            )}
          </div>

          <section className="statuses">
            <div className="section-head">
              <h3>Trạng thái và chức danh</h3>
              <span className="section-head__aside">
                Không phải thẻ vai · không tính vào số thẻ
              </span>
            </div>
            <div className="statuses__grid">
              <div className="status-row">
                <Icon name="link" />
                <div className="status-row__text">
                  <span className="status-row__name">Cặp đôi</span>
                  <span className="muted">
                    {counts.cupid ? 'Tự động · khi gọi Cupid' : 'Cần có Cupid trong bộ vai'}
                  </span>
                </div>
                <button className="btn btn-ghost" onClick={() => browser.openRole('lovers')}>
                  Chi tiết
                </button>
              </div>
              <div className="status-row">
                <Icon name="crown" />
                <div className="status-row__text">
                  <span className="status-row__name">Trưởng làng</span>
                  <span className="muted">{chief ? 'Bật · bầu vào Ngày 1' : 'Tắt'}</span>
                </div>
                <Switch
                  checked={chief}
                  onToggle={() => setState({ chief: !chief })}
                  label="Bật Trưởng làng"
                />
              </div>
            </div>
          </section>
        </main>

        {!desk && rolesSheet && (
          <div className="deck-scrim" onClick={() => setState({ rolesSheet: false })} />
        )}
        {(desk || rolesSheet) && (
          <aside
            aria-label="Bộ vai đã chọn"
            className={cx('deck', desk ? 'deck--side' : 'deck--sheet')}
          >
            <DeckPanel mobile={!desk} />
          </aside>
        )}
      </div>

      {!desk && (
        <div className="bottom-bar roles__bar">
          <button
            className="roles__bar-summary"
            onClick={() => setState({ rolesSheet: true })}
            aria-label="Mở bộ vai đã chọn"
          >
            <span className="roles__bar-text">
              <span className="roles__bar-total tabular">
                {d.total}/{d.n} thẻ
              </span>
              <span className="roles__bar-status" data-tone={d.status.tone}>
                {d.status.text}
              </span>
            </span>
            <Icon name="up" />
          </button>
          <button
            className="btn btn-ink btn-lg"
            disabled={!d.ok}
            onClick={() => setState({ screen: 'assign', assign: null, rolesSheet: false })}
          >
            Chia vai
            <Icon name="right" />
          </button>
        </div>
      )}
    </Paper>
  )
}
