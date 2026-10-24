import { setState, toast, useAppState } from '@/app/store'
import { Icon } from '@/components/Icon'
import { GmBadge, RoleMedal, Switch, TeamBadge } from '@/components/ui'
import { nextId } from '@/lib/random'
import type { Role, Team } from '@/types/game'
import { TEAMS } from './catalog'
import { decCount, incCount, viewOf } from './roles'
import './roles.css'

export function RoleDetailSheet({ id }: { id: string }) {
  const { counts, screen } = useAppState()
  const v = viewOf(id)
  const c = counts[id] ?? 0

  return (
    <>
      <div className="role-sheet__head" data-team={v.team}>
        <RoleMedal team={v.team} icon={v.icon} size={104} iconSize={64} />
        <h2 className="role-sheet__name">{v.name}</h2>
        <div className="badges role-sheet__badges">
          <TeamBadge view={v} size="md" />
          {v.gm && <GmBadge size="md" />}
        </div>
      </div>
      <dl className="role-sheet__facts">
        <div>
          <dt className="label-caps">Kỹ năng</dt>
          <dd className="pretty">{v.skill}</dd>
        </div>
        <div>
          <dt className="label-caps">Điều kiện thắng</dt>
          <dd>{v.win}</dd>
        </div>
        <div>
          <dt className="label-caps">Thời điểm thức dậy</dt>
          <dd className="inline-icon">
            <Icon name="moon" />
            {v.wake}
          </dd>
        </div>
        {v.note && (
          <div>
            <dt className="label-caps">Lưu ý biến thể</dt>
            <dd className="muted role-sheet__note">{v.note}</dd>
          </div>
        )}
      </dl>
      {screen === 'roles' && !v.isStatus && (
        <div className="role-sheet__count">
          <span className="muted">{c ? `${c} thẻ trong bộ vai` : 'Chưa có trong bộ vai'}</span>
          <button
            className="btn btn-secondary btn-icon role-sheet__step"
            onClick={() => setState((s) => ({ counts: decCount(s.counts, id) }))}
            disabled={c === 0}
            aria-label="Bớt"
          >
            <Icon name="minus" />
          </button>
          <span className="counter__value role-sheet__num">{c}</span>
          <button
            className="btn btn-ink btn-icon role-sheet__step"
            onClick={() => setState((s) => ({ counts: incCount(s.counts, id) }))}
            aria-label="Thêm"
          >
            <Icon name="plus" />
          </button>
        </div>
      )}
    </>
  )
}

export function CustomRoleSheet() {
  const { cr } = useAppState()
  const patch = (p: Partial<typeof cr>) => setState({ cr: { ...cr, ...p } })

  const save = () => {
    const name = cr.name.trim()
    if (!name) return
    const id = nextId('c')
    const role: Role = {
      id,
      name,
      team: cr.team,
      icon: 'sparkles',
      short: cr.short.trim() || 'Vai tùy chỉnh do nhóm tự đặt luật.',
      skill: cr.short.trim() || 'Quản trò xử lý theo luật của nhóm.',
      wake: cr.wakes ? 'Mỗi đêm, sau các vai gốc' : 'Không thức dậy',
      gm: true,
      custom: true,
      wakes: cr.wakes,
      note: 'Vai do nhóm tạo. Quản trò xử lý kỹ năng thủ công.',
    }
    setState((s) => ({
      customRoles: [...s.customRoles, role],
      sheet: null,
      query: '',
      filter: 'all',
      counts: s.screen === 'roles' ? { ...s.counts, [id]: 1 } : s.counts,
    }))
    toast(`Đã thêm vai “${name}”`)
  }

  return (
    <>
      <h2 className="sheet__title">Thêm vai tùy chỉnh</h2>
      <p className="muted custom__lead">
        Vai tùy chỉnh luôn được gắn nhãn “Quản trò xử lý”. Ứng dụng không tự áp luật cho vai này.
      </p>
      <div className="field">
        <label htmlFor="crn">Tên vai</label>
        <input
          id="crn"
          className="input"
          value={cr.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Ví dụ: Bà đồng"
        />
      </div>
      <div className="field">
        <label id="crt">Phe</label>
        <div className="custom__teams" role="group" aria-labelledby="crt">
          {(Object.keys(TEAMS) as Team[]).map((k) => (
            <button
              key={k}
              className="custom__team"
              aria-pressed={cr.team === k}
              onClick={() => patch({ team: k })}
            >
              <Icon name={TEAMS[k].icon} size={16} />
              {TEAMS[k].label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="crs">Mô tả kỹ năng</label>
        <textarea
          id="crs"
          className="input"
          value={cr.short}
          onChange={(e) => patch({ short: e.target.value })}
          placeholder="Mỗi đêm…"
        />
      </div>
      <div className="custom__wake">
        <div className="custom__wake-text">
          <span>Thức dậy ban đêm</span>
          <span className="muted">{cr.wakes ? 'Có · thêm vào thứ tự gọi ban đêm' : 'Không'}</span>
        </div>
        <Switch
          checked={cr.wakes}
          onToggle={() => patch({ wakes: !cr.wakes })}
          label="Thức dậy ban đêm"
        />
      </div>
      <button className="btn btn-ink btn-lg" onClick={save} disabled={!cr.name.trim()}>
        Lưu vai
      </button>
    </>
  )
}
