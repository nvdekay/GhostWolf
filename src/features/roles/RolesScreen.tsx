import { useCallback, useEffect, useRef, useState } from 'react'
import { findRoleDef, PRESETS, suggestCounts, type Counts } from '@engine'
import { useFeedback } from '@/app/feedback'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/overlay'
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
import { deletePreset, listPresets, savePreset } from '@/services/library'
import type { CustomRoleRow, PresetRow } from '@/services/types'
import { useHost, useStepper } from '@/features/host/context'
import { CustomRoleSheet, RoleDetailSheet } from './RoleSheets'
import { allRoles, deckSummary, decCount, incCount, roleView, viewOf } from './roles'
import { useCustomRoles } from './useCustomRoles'
import { useRoleBrowser } from './useRoleBrowser'
import './roles.css'

type SheetState =
  | { type: 'role'; id: string }
  | { type: 'custom'; row?: CustomRoleRow }
  | { type: 'savePreset' }
  | { type: 'presets' }
  | null

const same = (a: Counts, b: Counts) => {
  const ka = Object.keys(a).filter((k) => a[k])
  const kb = Object.keys(b).filter((k) => b[k])
  return ka.length === kb.length && ka.every((k) => a[k] === b[k])
}

export function RolesScreen() {
  const fb = useFeedback()
  const desk = useIsDesktop()
  const { snap, run, setView, room } = useHost()
  const stepper = useStepper()
  const custom = useCustomRoles()
  const browser = useRoleBrowser(custom.defs)
  const [sheet, setSheet] = useState<SheetState>(null)
  const [deckOpen, setDeckOpen] = useState(false)
  const [presets, setPresets] = useState<PresetRow[]>([])
  const [presetName, setPresetName] = useState('')
  const [autoNote, setAutoNote] = useState(true)
  const [saving, setSaving] = useState(false)

  const state = snap.secrets
  const n = snap.members.filter((m) => m.status === 'active').length
  const [draft, setDraft] = useState<Counts | null>(null)
  const counts = draft ?? state?.counts ?? {}
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef<Counts | null>(null)

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    const next = pending.current
    if (!next) return true
    pending.current = null
    setSaving(true)
    const ok = await run({ type: 'deck.set', counts: next }, { silent: true })
    setSaving(false)
    setDraft((d) => (d === next ? null : d))
    return ok
  }, [run])

  useEffect(() => () => void flush(), [flush])

  const update = (fn: (c: Counts) => Counts) => {
    const next = fn(counts)
    setDraft(next)
    setAutoNote(false)
    pending.current = next
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 500)
  }

  useEffect(() => {
    listPresets()
      .then(setPresets)
      .catch(() => {})
  }, [])

  const defs = custom.defs
  const d = deckSummary(counts, n, defs)
  const suggestion = suggestCounts(n)
  const isSuggestion = d.total > 0 && same(counts, suggestion.counts)
  const sugDesc =
    Object.entries(suggestion.counts)
      .map(([id, c]) => `${c} ${findRoleDef(id, defs)?.name ?? id}`)
      .join(' · ') +
    (suggestion.base && suggestion.base !== n ? ` (gợi ý ${suggestion.base} người + Dân làng)` : '')
  const selected = allRoles(defs).filter((r) => counts[r.id])
  const missing = Object.keys(counts).filter((id) => !findRoleDef(id, defs))
  const rowOf = (id: string) => custom.rows.find((r) => 'custom:' + r.id === id)

  const cont = async () => {
    if (await flush()) {
      setDeckOpen(false)
      setView('assign')
    }
  }

  const applyPreset = (p: PresetRow) => {
    const valid = Object.fromEntries(
      Object.entries(p.counts).filter(([id]) => findRoleDef(id, defs)),
    )
    update(() => valid)
    setSheet(null)
    fb.toast(
      Object.keys(valid).length < Object.keys(p.counts).length
        ? `Đã áp dụng “${p.name}” (bỏ qua vai tùy chỉnh đã xóa)`
        : `Đã áp dụng bộ vai “${p.name}”`,
    )
  }

  const save = async () => {
    try {
      await savePreset(presetName || room.name, counts)
      setPresets(await listPresets())
      fb.toast(`Đã lưu bộ vai “${presetName || room.name}” · ${d.total} thẻ`)
      setSheet(null)
    } catch (e) {
      fb.error(e)
    }
  }

  const deckPanel = (mobile: boolean) => (
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
            {d.total}/{n}
            <span className="muted"> thẻ</span>
          </span>
        </div>
        {mobile && (
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => setDeckOpen(false)}
            aria-label="Đóng bộ vai"
          >
            <Icon name="x" />
          </button>
        )}
      </div>
      <div role="status" className="deck__status" data-tone={d.status.tone}>
        <Icon name={d.status.icon} />
        <span>{d.status.text}</span>
        {saving && <span className="muted deck__saving">· đang lưu</span>}
      </div>
      <div className="deck__teams">
        <div>
          <span className="muted">Phe Dân</span>
          <strong className="tabular">{d.village}</strong>
        </div>
        <div>
          <span className="danger-text">Phe Sói</span>
          <strong className="tabular">{d.wolf}</strong>
        </div>
        <div>
          <span className="gold-text">Phe riêng</span>
          <strong className="tabular">{d.solo}</strong>
        </div>
      </div>
      {missing.length > 0 && (
        <p className="danger-text deck__empty">
          Bộ vai có vai tùy chỉnh đã bị xóa. Bấm “Xóa hết” hoặc chỉnh lại.
        </p>
      )}
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
                onClick={() => update((c) => decCount(c, r.id))}
                aria-label={`Bớt ${r.name}`}
              >
                <Icon name="minus" />
              </button>
              <span className="deck__num tabular">{counts[r.id]}</span>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => update((c) => incCount(c, r.id))}
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
            const add = -d.diff
            update((c) => ({ ...c, villager: (c.villager ?? 0) + add }))
            fb.toast(`Đã thêm ${add} Dân làng`)
          }}
        >
          <Icon name="home" />
          Điền Dân làng
        </button>
        <button
          className="btn btn-secondary"
          disabled={d.total === 0}
          onClick={() => update(() => ({}))}
        >
          <Icon name="x" />
          Xóa hết
        </button>
        <button
          className="btn btn-secondary"
          disabled={d.total === 0}
          onClick={() => {
            setPresetName(room.name)
            setSheet({ type: 'savePreset' })
          }}
        >
          <Icon name="check" />
          Lưu bộ vai
        </button>
        <button className="btn btn-secondary" onClick={() => setSheet({ type: 'presets' })}>
          <Icon name="list" />
          Bộ vai đã lưu
        </button>
      </div>
      <div className="deck__go">
        <button
          className="btn btn-ink btn-lg btn-block"
          disabled={!d.ok || missing.length > 0}
          onClick={cont}
        >
          Tiếp tục: chia vai
          <Icon name="right" />
        </button>
        <span className="muted deck__reason">{d.reason}</span>
      </div>
    </>
  )

  if (!state) return null

  return (
    <Paper label="Chọn bộ vai">
      <TopBar onBack={() => setView('lobby')} backLabel="Quay lại phòng chờ" title="Chọn bộ vai">
        <Stepper steps={stepper} label="Tiến trình thiết lập" />
      </TopBar>
      <div className="roles">
        <main className="roles__main">
          {d.total === 0 && (
            <div className="suggest">
              <div className="suggest__text">
                <span className="suggest__title">
                  {PRESETS[n] ? `Gợi ý cho ${n} người` : `Gợi ý cho ${n} người`}
                </span>
                <span className="muted">{sugDesc}</span>
              </div>
              <button
                className="btn btn-ink"
                onClick={() => update(() => ({ ...suggestion.counts }))}
              >
                Áp dụng
              </button>
            </div>
          )}
          {isSuggestion && autoNote && (
            <div role="status" className="suggest suggest--auto">
              <span className="gold-text">
                <Icon name="sparkles" />
              </span>
              <span className="suggest__auto-text">
                Đã điền sẵn bộ vai gợi ý cho {n} người. Chỉnh tùy ý trước khi chia.
              </span>
              <button
                className="btn btn-ghost btn-ghost--muted btn-icon"
                onClick={() => setAutoNote(false)}
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
                <button className="btn btn-ink" onClick={() => setSheet({ type: 'custom' })}>
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
                    onClick={() => setSheet({ type: 'role', id: r.id })}
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
                        onClick={() => update((x) => decCount(x, r.id))}
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
                        onClick={() => update((x) => incCount(x, r.id))}
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
              <button className="tile-add" onClick={() => setSheet({ type: 'custom' })}>
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
                <button
                  className="btn btn-ghost"
                  onClick={() => setSheet({ type: 'role', id: 'lovers' })}
                >
                  Chi tiết
                </button>
              </div>
              <div className="status-row">
                <Icon name="crown" />
                <div className="status-row__text">
                  <span className="status-row__name">Trưởng làng</span>
                  <span className="muted">
                    {state.options.chief ? 'Bật · bầu vào Ngày 1' : 'Tắt'}
                  </span>
                </div>
                <Switch
                  checked={state.options.chief}
                  onToggle={() =>
                    void run(
                      { type: 'options.set', options: { chief: !state.options.chief } },
                      { silent: true },
                    )
                  }
                  label="Bật Trưởng làng"
                />
              </div>
            </div>
          </section>
        </main>

        {!desk && deckOpen && <div className="deck-scrim" onClick={() => setDeckOpen(false)} />}
        {(desk || deckOpen) && (
          <aside
            aria-label="Bộ vai đã chọn"
            className={cx('deck', desk ? 'deck--side' : 'deck--sheet')}
          >
            {deckPanel(!desk)}
          </aside>
        )}
      </div>

      {!desk && (
        <div className="bottom-bar roles__bar">
          <button
            className="roles__bar-summary"
            onClick={() => setDeckOpen(true)}
            aria-label="Mở bộ vai đã chọn"
          >
            <span className="roles__bar-text">
              <span className="roles__bar-total tabular">
                {d.total}/{n} thẻ
              </span>
              <span className="roles__bar-status" data-tone={d.status.tone}>
                {d.status.text}
              </span>
            </span>
            <Icon name="up" />
          </button>
          <button
            className="btn btn-ink btn-lg"
            disabled={!d.ok || missing.length > 0}
            onClick={cont}
          >
            Chia vai
            <Icon name="right" />
          </button>
        </div>
      )}

      {sheet && (
        <Sheet onClose={() => setSheet(null)} label="Chi tiết">
          {sheet.type === 'role' && (
            <RoleDetailSheet
              view={viewOf(sheet.id, defs)}
              count={counts[sheet.id] ?? 0}
              onInc={() => update((c) => incCount(c, sheet.id))}
              onDec={() => update((c) => decCount(c, sheet.id))}
              onEdit={
                rowOf(sheet.id)
                  ? () => setSheet({ type: 'custom', row: rowOf(sheet.id) })
                  : undefined
              }
            />
          )}
          {sheet.type === 'custom' && (
            <CustomRoleSheet
              initial={sheet.row}
              presetName={sheet.row ? undefined : browser.query}
              presetTeam={browser.filter === 'all' ? undefined : browser.filter}
              onSaved={(row) => {
                void custom.reload()
                if (!sheet.row) update((c) => incCount(c, 'custom:' + row.id))
                setSheet(null)
              }}
              onDeleted={() => {
                void custom.reload()
                setSheet(null)
              }}
            />
          )}
          {sheet.type === 'savePreset' && (
            <>
              <h2 className="sheet__title">Lưu bộ vai</h2>
              <div className="field">
                <label htmlFor="pname">Tên bộ vai</label>
                <input
                  id="pname"
                  className="input"
                  data-autofocus
                  maxLength={60}
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void save()}
                />
              </div>
              <p className="muted">
                {d.total} thẻ. Lưu cùng tên sẽ ghi đè bộ vai cũ. Bộ vai được lưu cho phiên trên máy
                này.
              </p>
              <button
                className="btn btn-ink btn-lg"
                onClick={() => void save()}
                disabled={!presetName.trim()}
              >
                Lưu
              </button>
            </>
          )}
          {sheet.type === 'presets' && (
            <>
              <h2 className="sheet__title">Bộ vai đã lưu</h2>
              {presets.length === 0 ? (
                <p className="muted">Chưa có bộ vai nào. Chọn vai rồi bấm “Lưu bộ vai”.</p>
              ) : (
                <ul className="preset-list">
                  {presets.map((p) => (
                    <li key={p.id}>
                      <button className="preset-list__apply" onClick={() => applyPreset(p)}>
                        <span className="preset-list__name">{p.name}</span>
                        <span className="muted">
                          {Object.values(p.counts).reduce((a, b) => a + b, 0)} thẻ ·{' '}
                          {Object.entries(p.counts)
                            .map(([id, c]) => `${c} ${findRoleDef(id, defs)?.name ?? 'vai đã xóa'}`)
                            .join(', ')}
                        </span>
                      </button>
                      <button
                        className="btn btn-ghost btn-ghost--muted btn-icon"
                        aria-label={`Xóa bộ vai ${p.name}`}
                        onClick={async () => {
                          try {
                            await deletePreset(p.id)
                            setPresets(await listPresets())
                          } catch (e) {
                            fb.error(e)
                          }
                        }}
                      >
                        <Icon name="x" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Sheet>
      )}
    </Paper>
  )
}
