import { useState } from 'react'
import { STATUSES } from '@engine'
import { useNav } from '@/app/App'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/overlay'
import {
  EmptyState,
  FilterChips,
  GmBadge,
  Paper,
  RoleMedal,
  TeamBadge,
  TopBar,
} from '@/components/ui'
import { useIsDesktop } from '@/lib/media'
import type { CustomRoleRow } from '@/services/types'
import { CustomRoleSheet, RoleDetailSheet } from './RoleSheets'
import { roleView, viewOf } from './roles'
import { useCustomRoles } from './useCustomRoles'
import { useRoleBrowser } from './useRoleBrowser'
import './roles.css'

type SheetState = { type: 'role'; id: string } | { type: 'custom'; row?: CustomRoleRow } | null

export function LibraryScreen() {
  const nav = useNav()
  const desk = useIsDesktop()
  const custom = useCustomRoles()
  const browser = useRoleBrowser(custom.defs)
  const [sheet, setSheet] = useState<SheetState>(null)
  const rowOf = (id: string) => custom.rows.find((r) => 'custom:' + r.id === id)

  return (
    <Paper label="Thư viện vai">
      <TopBar onBack={nav.home} backLabel="Về trang chủ" title="Thư viện vai">
        <button className="btn btn-ink" onClick={() => setSheet({ type: 'custom' })}>
          <Icon name="plus" />
          {desk ? 'Vai tùy chỉnh' : 'Thêm'}
        </button>
      </TopBar>
      <main className="library">
        <div className="search">
          <Icon name="search" />
          <input
            className="input"
            type="search"
            aria-label="Tìm vai"
            value={browser.query}
            onChange={(e) => browser.setQuery(e.target.value)}
            placeholder="Tìm vai, ví dụ: tien tri"
          />
        </div>
        <FilterChips items={browser.filters} label="Lọc theo phe" />
        {custom.error && <p className="danger-text">{custom.error}</p>}

        {browser.results.length === 0 && (
          <EmptyState title={`Không tìm thấy vai “${browser.query}”`}>
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

        <div className="tile-grid tile-grid--lib">
          {browser.results.map((r) => {
            const v = roleView(r)
            return (
              <button
                key={r.id}
                className="lib-tile"
                data-team={v.team}
                onClick={() => setSheet({ type: 'role', id: r.id })}
              >
                <RoleMedal team={v.team} icon={v.icon} size={60} iconSize={26} />
                <span className="tile__text">
                  <span className="lib-tile__name">{v.name}</span>
                  <span className="badges">
                    <TeamBadge view={v} />
                    {v.gm && <GmBadge />}
                    {v.custom && <span className="custom-badge">Tùy chỉnh</span>}
                  </span>
                  <span className="tile__short">{v.short}</span>
                  <span className="lib-tile__more">
                    <Icon name="eye" size={15} />
                    Đọc kỹ năng và luật
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <section className="statuses statuses--lib">
          <div className="section-head">
            <h3>Trạng thái và chức danh</h3>
            <span className="section-head__aside">Không phải thẻ vai</span>
          </div>
          <div className="statuses__grid">
            {STATUSES.map((st) => (
              <button
                key={st.id}
                className="status-row status-row--button"
                onClick={() => setSheet({ type: 'role', id: st.id })}
              >
                <Icon name={st.icon} size={26} />
                <span className="status-row__text">
                  <span className="status-row__name">{st.name}</span>
                  <span className="muted">
                    {st.kind} · {st.short}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>

      {sheet && (
        <Sheet
          onClose={() => setSheet(null)}
          label={sheet.type === 'role' ? 'Chi tiết vai' : 'Vai tùy chỉnh'}
        >
          {sheet.type === 'role' && (
            <RoleDetailSheet
              view={viewOf(sheet.id, custom.defs)}
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
              onSaved={() => {
                void custom.reload()
                setSheet(null)
              }}
              onDeleted={() => {
                void custom.reload()
                setSheet(null)
              }}
            />
          )}
        </Sheet>
      )}
    </Paper>
  )
}
