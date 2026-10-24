import { go } from '@/app/store'
import { Icon } from '@/components/Icon'
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
import { STATUSES } from './catalog'
import { roleView } from './roles'
import { useRoleBrowser } from './useRoleBrowser'
import './roles.css'

export function LibraryScreen() {
  const desk = useIsDesktop()
  const browser = useRoleBrowser()

  return (
    <Paper label="Thư viện vai">
      <TopBar onBack={() => go('home')} backLabel="Về trang chủ" title="Thư viện vai">
        <button className="btn btn-ink" onClick={browser.openCustom}>
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
            placeholder="Tìm vai"
          />
        </div>
        <FilterChips items={browser.filters} label="Lọc theo phe" />

        {browser.results.length === 0 && (
          <EmptyState title={`Không tìm thấy vai “${browser.query}”`}>
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

        <div className="tile-grid tile-grid--lib">
          {browser.results.map((r) => {
            const v = roleView(r)
            return (
              <button
                key={r.id}
                className="lib-tile"
                data-team={v.team}
                onClick={() => browser.openRole(r.id)}
              >
                <RoleMedal team={v.team} icon={v.icon} size={60} iconSize={26} />
                <span className="tile__text">
                  <span className="lib-tile__name">{v.name}</span>
                  <span className="badges">
                    <TeamBadge view={v} />
                    {v.gm && <GmBadge />}
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
                onClick={() => browser.openRole(st.id)}
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
    </Paper>
  )
}
