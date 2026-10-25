import type { ReactNode } from 'react'
import { cssVars, cx } from '@/lib/css'
import type { TeamKey, RoleView } from '@/features/roles/roles'
import { Icon, type IconName } from './Icon'

type PaperSize = 'wide' | 'narrow' | 'board' | 'result'

/** Tờ giấy da chứa một màn hình. */
export function Paper({
  size = 'wide',
  label,
  className,
  children,
  as: Tag = 'div',
}: {
  size?: PaperSize
  label: string
  className?: string
  children: ReactNode
  as?: 'div' | 'main'
}) {
  return (
    <Tag className={cx('paper', `paper--${size}`, className)} data-screen-label={label}>
      {children}
    </Tag>
  )
}

export function TopBar({
  onBack,
  backLabel,
  backIcon = 'left',
  title,
  children,
}: {
  onBack: () => void
  backLabel: string
  backIcon?: IconName
  title: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <button className="btn btn-secondary btn-icon" onClick={onBack} aria-label={backLabel}>
          <Icon name={backIcon} />
        </button>
        <div className="topbar__title">{title}</div>
        {children}
      </div>
    </header>
  )
}

/** Thanh hành động cố định ở đáy màn hình. */
export function BottomBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="bottom-bar">
      <div className={cx('bottom-bar__inner', className)}>{children}</div>
    </div>
  )
}

/** Đường kẻ trang trí có la bàn ở giữa. */
export function Ornament({ width = 260, center }: { width?: number; center?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cx('ornament', center && 'ornament--center')}
      style={cssVars({ '--w': width + 'px' })}
    >
      <span />
      <Icon name="compass" size={15} />
      <span />
    </div>
  )
}

/** Trăng lưỡi liềm vẽ bằng box-shadow. */
export function Crescent({ size, className }: { size: number; className?: string }) {
  return <span className={cx('crescent', className)} style={cssVars({ '--size': size + 'px' })} />
}

export function Switch({
  checked,
  onToggle,
  label,
}: {
  checked: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={onToggle}
    >
      <span className="switch__track">
        <span className="switch__knob" />
      </span>
    </button>
  )
}

export function SwitchRow({
  title,
  sub,
  checked,
  onToggle,
  label,
}: {
  title: string
  sub: string
  checked: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <div className="switch-row">
      <div className="switch-row__text">
        <span className="switch-row__title">{title}</span>
        <span className="switch-row__sub">{sub}</span>
      </div>
      <Switch checked={checked} onToggle={onToggle} label={label} />
    </div>
  )
}

export function TeamBadge({
  view,
  size = 'sm',
}: {
  view: Pick<RoleView, 'team' | 'teamIcon' | 'teamLabel'>
  size?: 'sm' | 'md'
}) {
  return (
    <span className={cx('team-badge', size === 'md' && 'team-badge--md')} data-team={view.team}>
      <Icon name={view.teamIcon} size={14} />
      {view.teamLabel}
    </span>
  )
}

export function GmBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return <span className={cx('gm-badge', size === 'md' && 'gm-badge--md')}>Quản trò xử lý</span>
}

/** Huy hiệu tròn chứa icon vai, màu theo phe. */
export function RoleMedal({
  team,
  icon,
  size,
  iconSize,
  ring = true,
  ringColor,
}: {
  team: TeamKey | 'hidden'
  icon: IconName
  size: number
  iconSize: number
  ring?: boolean
  ringColor?: string
}) {
  return (
    <span
      className={cx('medal', ring && 'medal--ring')}
      data-team={team}
      style={cssVars({ '--size': size + 'px', '--ring-bg': ringColor ?? 'var(--surface)' })}
    >
      <Icon name={icon} size={iconSize} />
    </span>
  )
}

export function FilterChips({
  items,
  label,
}: {
  items: { key: string; label: string; count: number; active: boolean; onPick: () => void }[]
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="chips">
      {items.map((f) => (
        <button key={f.key} role="tab" aria-selected={f.active} className="chip" onClick={f.onPick}>
          {f.label}
          <span className="chip__count tabular">{f.count}</span>
        </button>
      ))}
    </div>
  )
}

export function Stepper({
  steps,
  label,
}: {
  steps: { label: string; current: boolean; done: boolean; onGo: () => void }[]
  label: string
}) {
  return (
    <nav aria-label={label} className="stepper">
      {steps.map((st, i) => (
        <button
          key={st.label}
          className="stepper__item"
          data-state={st.current ? 'current' : st.done ? 'done' : 'todo'}
          aria-current={st.current ? 'step' : undefined}
          onClick={st.onGo}
        >
          <span className="stepper__num tabular">{st.done ? '✓' : i + 1}</span>
          {st.label}
        </button>
      ))}
    </nav>
  )
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: IconName
  title: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="empty">
      {icon && (
        <span className="muted">
          <Icon name={icon} />
        </span>
      )}
      <div className="empty__title">{title}</div>
      {children}
    </div>
  )
}

/** Thẻ vai hai mặt: mặt sau "Ghostwolf", lật để xem vai. */
export function FlipCard({
  role,
  flipped,
  animate,
  backAction,
  footnote,
}: {
  role: RoleView | null
  flipped: boolean
  animate: boolean
  backAction?: ReactNode
  footnote?: string
}) {
  return (
    <div className="flip">
      <div className={cx('flip__inner', animate && 'flip__inner--animate')} data-flipped={flipped}>
        <div className="flip__back" aria-hidden={flipped}>
          <div className="flip__back-frame">
            <Crescent size={72} className="crescent--card" />
            <span className="flip__brand">Ghostwolf</span>
            {backAction}
          </div>
        </div>
        {role && (
          <div className="flip__front" data-team={role.team} aria-hidden={!flipped}>
            <div className="flip__head">
              <RoleMedal team={role.team} icon={role.icon} size={104} iconSize={64} />
              <h2 className="flip__name">{role.name}</h2>
              <TeamBadge view={role} size="md" />
            </div>
            <div className="flip__body">
              <div>
                <div className="label-caps">Kỹ năng</div>
                <p className="pretty">{role.skill}</p>
              </div>
              <div>
                <div className="label-caps">Điều kiện thắng</div>
                <p className="pretty">{role.win}</p>
              </div>
            </div>
            {footnote && <p className="flip__foot muted">{footnote}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
