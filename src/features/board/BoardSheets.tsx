import { useState } from 'react'
import { type Effect, type GameState, type Player, type PublicState } from '@engine'
import { Icon } from '@/components/Icon'
import { Dialog } from '@/components/overlay'
import { RoleMedal } from '@/components/ui'
import { viewOf } from '@/features/roles/roles'
import './board.css'

/** Chi tiết người chơi. Màn hình chung chỉ nhận dữ liệu công khai. */
export function PlayerSheet({
  s,
  pub,
  id,
  shared,
  viewed,
  onRole,
  onChief,
  onKill,
  onRevive,
  onShowRole,
}: {
  s: GameState
  pub: PublicState
  id: string
  shared: boolean
  viewed: boolean
  onRole: (roleId: string) => void
  onChief: (p: Player) => void
  onKill: (p: Player) => void
  onRevive: (p: Player) => void
  onShowRole: (p: Player) => void
}) {
  if (shared) {
    const pp = pub.players.find((x) => x.id === id)
    if (!pp) return null
    return (
      <>
        <div className="player-sheet__head">
          <span className="player-sheet__seat tabular">{pp.seat}</span>
          <div className="player-sheet__who">
            <h2>{pp.name}</h2>
            <span className="muted">{pp.alive ? 'Còn sống' : 'Đã bị loại'}</span>
          </div>
        </div>
        {pp.role ? (
          <div className="player-sheet__hidden">Vai đã công bố: {pp.role.name}</div>
        ) : (
          <div className="player-sheet__hidden">
            <Icon name="lock" />
            Vai được giấu trên màn hình chung
          </div>
        )}
        {pp.chief && (
          <div className="player-sheet__tags">
            <span className="player-sheet__tag player-sheet__tag--gold">
              <Icon name="crown" size={15} />
              Trưởng làng
            </span>
          </div>
        )}
      </>
    )
  }

  const p = s.players.find((x) => x.id === id)
  if (!p) return null
  const v = viewOf(p.roleId, s.customRoles)
  const partner = p.lover ? s.players.find((x) => x.lover && x.id !== p.id) : null
  const night = s.phase === 'night'
  const markedNight = night && s.night?.actions.gmKills?.includes(p.id)

  return (
    <>
      <div className="player-sheet__head">
        <span className="player-sheet__seat tabular">{p.seat}</span>
        <div className="player-sheet__who">
          <h2>{p.name}</h2>
          <span className="muted">
            {p.alive ? 'Còn sống' : 'Đã bị loại'}
            {!p.canVote && p.alive ? ' · mất quyền bầu' : ''}
            {p.device ? '' : ' · không có điện thoại'}
          </span>
        </div>
      </div>
      <button className="player-sheet__role" data-team={v.team} onClick={() => onRole(p.roleId)}>
        <RoleMedal team={v.team} icon={v.icon} size={48} iconSize={26} ring={false} />
        <span className="player-sheet__role-text">
          <span className="player-sheet__role-name">{v.name}</span>
          <span className="team-ink">{v.teamLabel}</span>
        </span>
        <Icon name="right" />
      </button>
      {(p.lover || p.chief || p.charmed || p.revealed) && (
        <div className="player-sheet__tags">
          {p.lover && (
            <span className="player-sheet__tag">
              <Icon name="link" size={15} />
              Cặp đôi với {partner?.name ?? ''}
            </span>
          )}
          {p.chief && (
            <span className="player-sheet__tag player-sheet__tag--gold">
              <Icon name="crown" size={15} />
              Trưởng làng
            </span>
          )}
          {p.charmed && <span className="player-sheet__tag">Bị mê hoặc</span>}
          {p.revealed && <span className="player-sheet__tag">Vai đã công khai</span>}
        </div>
      )}
      <div className="player-sheet__actions">
        {!p.device && !viewed && (
          <button className="btn btn-secondary" onClick={() => onShowRole(p)}>
            <Icon name="eye" />
            Cho xem vai trên máy này
          </button>
        )}
        {p.alive ? (
          <>
            {s.options.chief && (
              <button className="btn btn-secondary" onClick={() => onChief(p)}>
                <Icon name="crown" />
                {p.chief ? 'Bỏ chức Trưởng làng' : 'Đặt làm Trưởng làng'}
              </button>
            )}
            <button
              className="btn btn-secondary btn-danger"
              disabled={markedNight}
              onClick={() => onKill(p)}
            >
              <Icon name="skull" />
              {markedNight ? 'Đã đánh dấu · công bố lúc sáng' : 'Loại khỏi ván'}
            </button>
          </>
        ) : (
          <button className="btn btn-secondary" onClick={() => onRevive(p)}>
            <Icon name="reset" />
            Hồi sinh (sửa nhầm)
          </button>
        )}
      </div>
    </>
  )
}

export function MenuSheet({
  name,
  onLog,
  onHowto,
  onHome,
  onEnd,
  onReset,
  onLobby,
}: {
  name: string
  onLog: () => void
  onHowto: () => void
  onHome: () => void
  onEnd: () => void
  onReset: () => void
  onLobby: () => void
}) {
  const items: {
    icon: 'list' | 'info' | 'home' | 'check' | 'users'
    label: string
    on: () => void
  }[] = [
    { icon: 'list', label: 'Mở nhật ký ván', on: onLog },
    { icon: 'info', label: 'Cách chơi', on: onHowto },
    { icon: 'users', label: 'Xem phòng và mã phòng', on: onLobby },
    { icon: 'home', label: 'Về trang chủ (ván vẫn được lưu)', on: onHome },
    { icon: 'check', label: 'Kết thúc ván', on: onEnd },
  ]
  return (
    <>
      <h2 className="sheet__title menu__title">{name}</h2>
      <div className="menu">
        {items.map((it) => (
          <button key={it.label} className="menu__item" onClick={it.on}>
            <Icon name={it.icon} />
            {it.label}
          </button>
        ))}
        <button className="menu__item menu__item--danger" onClick={onReset}>
          <Icon name="reset" />
          Reset ván về Đêm 1
        </button>
      </div>
    </>
  )
}

/** Hiệu ứng bắt buộc: Thợ săn bắn / Trưởng làng chỉ định kế nhiệm. */
export function EffectDialog({
  s,
  effect,
  busy,
  onResolve,
}: {
  s: GameState
  effect: Effect
  busy: boolean
  onResolve: (target: string | null) => void
}) {
  const source = s.players.find((p) => p.id === effect.playerId)!
  const targets = s.players.filter((p) => p.alive && p.id !== source.id)
  const hunter = effect.kind === 'hunter'
  return (
    <Dialog
      layer="hunter"
      title={hunter ? `Thợ săn ${source.name} bị loại` : `Trưởng làng ${source.name} bị loại`}
      actions={
        <button className="btn btn-ghost" disabled={busy} onClick={() => onResolve(null)}>
          {hunter ? 'Thợ săn không bắn' : 'Không chỉ định ai'}
        </button>
      }
    >
      <span className="gm-badge hunter__badge">Quản trò xử lý</span>
      <p className="dialog__body">
        {hunter
          ? 'Hỏi Thợ săn muốn bắn ai, rồi chọn bên dưới.'
          : 'Trưởng làng chỉ định người kế nhiệm còn sống.'}
      </p>
      <div className="hunter__targets">
        {targets.map((p) => (
          <button
            key={p.id}
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => onResolve(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>
    </Dialog>
  )
}

const END_OPTIONS = [
  ['village', 'Phe Dân làng chiến thắng'],
  ['wolf', 'Phe Ma sói chiến thắng'],
  ['none', 'Kết thúc không phân thắng bại'],
] as const

export function EndDialog({
  onPick,
  onClose,
}: {
  onPick: (t: 'village' | 'wolf' | 'none') => void
  onClose: () => void
}) {
  const [team, setTeam] = useState<'village' | 'wolf' | 'none' | null>(null)
  return (
    <Dialog
      title="Kết thúc ván"
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-ink" disabled={!team} onClick={() => team && onPick(team)}>
            Công bố kết quả
          </button>
        </>
      }
    >
      <p className="dialog__body">
        Chọn kết quả để công bố vai của mọi người. Sau khi kết thúc không thể hoàn tác.
      </p>
      <div className="dialog__stack" role="radiogroup" aria-label="Kết quả">
        {END_OPTIONS.map(([t, title]) => (
          <button
            key={t}
            role="radio"
            aria-checked={team === t}
            className="btn btn-secondary end-option"
            onClick={() => setTeam(t)}
          >
            {title}
          </button>
        ))}
      </div>
    </Dialog>
  )
}
