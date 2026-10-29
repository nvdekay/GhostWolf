import { useState } from 'react'
import { TEAMS, type Team } from '@engine'
import { useFeedback } from '@/app/feedback'
import { Icon } from '@/components/Icon'
import { GmBadge, RoleMedal, Switch, TeamBadge } from '@/components/ui'
import { deleteCustomRole, saveCustomRole } from '@/services/library'
import type { CustomRoleRow } from '@/services/types'
import type { RoleView } from './roles'
import './roles.css'

/** Chi tiết vai/trạng thái; có bộ đếm khi mở từ màn chọn bộ vai. */
export function RoleDetailSheet({
  view: v,
  count,
  maxCount,
  onInc,
  onDec,
  onEdit,
}: {
  view: RoleView
  count?: number
  maxCount?: number
  onInc?: () => void
  onDec?: () => void
  onEdit?: () => void
}) {
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
      {onEdit && (
        <button className="btn btn-secondary" onClick={onEdit}>
          <Icon name="pencil" />
          Sửa vai tùy chỉnh
        </button>
      )}
      {count !== undefined && onInc && onDec && !v.isStatus && (
        <div className="role-sheet__count">
          <span className="muted">
            {count ? `${count} thẻ trong bộ vai` : 'Chưa có trong bộ vai'}
          </span>
          <button
            className="btn btn-secondary btn-icon role-sheet__step"
            onClick={onDec}
            disabled={count === 0}
            aria-label={`Bớt một ${v.name}`}
          >
            <Icon name="minus" />
          </button>
          <span className="counter__value role-sheet__num" aria-live="polite">
            {count}
          </span>
          <button
            className="btn btn-ink btn-icon role-sheet__step"
            onClick={onInc}
            disabled={maxCount !== undefined && count >= maxCount}
            aria-label={`Thêm một ${v.name}`}
          >
            <Icon name="plus" />
          </button>
        </div>
      )}
    </>
  )
}

/** Thêm hoặc sửa vai tùy chỉnh (lưu ở server). Vai tùy chỉnh luôn do quản trò xử lý. */
export function CustomRoleSheet({
  initial,
  presetName,
  presetTeam,
  onSaved,
  onDeleted,
}: {
  initial?: CustomRoleRow
  presetName?: string
  presetTeam?: Team
  onSaved: (row: CustomRoleRow) => void
  onDeleted?: () => void
}) {
  const fb = useFeedback()
  const [name, setName] = useState(initial?.name ?? presetName ?? '')
  const [team, setTeam] = useState<Team>(initial?.team ?? presetTeam ?? 'village')
  const [short, setShort] = useState(initial?.short ?? '')
  const [wakes, setWakes] = useState(initial?.wakes ?? false)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const row = await saveCustomRole({ id: initial?.id, name, team, short, wakes })
      fb.toast(initial ? `Đã lưu vai “${row.name}”` : `Đã thêm vai “${row.name}”`)
      onSaved(row)
    } catch (e) {
      fb.error(e)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!initial) return
    setBusy(true)
    try {
      await deleteCustomRole(initial.id)
      fb.toast(`Đã xóa vai “${initial.name}”`)
      onDeleted?.()
    } catch (e) {
      fb.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h2 className="sheet__title">{initial ? 'Sửa vai tùy chỉnh' : 'Thêm vai tùy chỉnh'}</h2>
      <p className="muted custom__lead">
        Vai tùy chỉnh luôn được gắn nhãn “Quản trò xử lý”. Ứng dụng không tự áp luật theo mô tả của
        vai này.
      </p>
      <div className="field">
        <label htmlFor="crn">Tên vai</label>
        <input
          id="crn"
          className="input"
          data-autofocus
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
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
              aria-pressed={team === k}
              onClick={() => setTeam(k)}
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
          maxLength={500}
          value={short}
          onChange={(e) => setShort(e.target.value)}
          placeholder="Mỗi đêm…"
        />
      </div>
      <div className="custom__wake">
        <div className="custom__wake-text">
          <span>Thức dậy ban đêm</span>
          <span className="muted">{wakes ? 'Có · thêm vào cuối thứ tự gọi ban đêm' : 'Không'}</span>
        </div>
        <Switch checked={wakes} onToggle={() => setWakes(!wakes)} label="Thức dậy ban đêm" />
      </div>
      <button className="btn btn-ink btn-lg" onClick={save} disabled={!name.trim() || busy}>
        {busy ? 'Đang lưu…' : 'Lưu vai'}
      </button>
      {initial && (
        <button className="btn btn-secondary btn-danger" onClick={remove} disabled={busy}>
          <Icon name="x" />
          Xóa vai
        </button>
      )}
    </>
  )
}
