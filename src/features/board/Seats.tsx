import { Icon, type IconName } from '@/components/Icon'
import { cssVars, cx } from '@/lib/css'
import type { TeamKey } from '@/features/roles/roles'

export interface SeatModel {
  id: string
  seat: number
  name: string
  alive: boolean
  chief: boolean
  lover: boolean
  roleName: string
  roleIcon: IconName
  team: TeamKey | 'hidden'
  marks: string
  picked: boolean
  dimmed: boolean
  votes: number
  ariaLabel: string
  onTap: () => void
}

/** Ghế người chơi: vòng tròn trên máy tính, lưới trên điện thoại. */
export function Seats({ seats, ring }: { seats: SeatModel[]; ring: boolean }) {
  const n = seats.length
  return (
    <>
      {seats.map((p, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
        return (
          <button
            key={p.id}
            className={cx('seat', ring ? 'seat--ring' : 'seat--grid')}
            data-picked={p.picked}
            data-dead={!p.alive}
            data-dimmed={p.dimmed}
            style={
              ring
                ? cssVars({
                    '--x': 50 + 41 * Math.cos(a) + '%',
                    '--y': 50 + 41 * Math.sin(a) + '%',
                  })
                : undefined
            }
            onClick={p.onTap}
            aria-label={p.ariaLabel}
            aria-pressed={p.picked}
          >
            {ring && (
              <span className="seat__top tabular" aria-hidden="true">
                {p.seat}
                {p.chief && (
                  <span className="gold-text">
                    <Icon name="crown" size={15} />
                  </span>
                )}
                {p.lover && <Icon name="link" size={15} />}
                {!p.alive && <Icon name="skull" size={15} />}
              </span>
            )}
            <span className="seat__line" aria-hidden="true">
              {!ring && <span className="seat__num tabular">{p.seat}</span>}
              <span className="seat__name">{p.name}</span>
              {!ring && p.chief && (
                <span className="gold-text">
                  <Icon name="crown" size={15} />
                </span>
              )}
              {!ring && p.lover && <Icon name="link" size={15} />}
            </span>
            <span className="seat__role" data-team={p.team} aria-hidden="true">
              <Icon name={p.roleIcon} size={15} />
              {p.roleName}
            </span>
            {!ring && !p.alive && (
              <span className="seat__dead" aria-hidden="true">
                <Icon name="skull" size={15} />
                Đã bị loại
              </span>
            )}
            {p.marks && (
              <span className="seat__marks" aria-hidden="true">
                {p.marks}
              </span>
            )}
            {p.votes > 0 && (
              <span className="seat__votes tabular" aria-hidden="true">
                {p.votes}
              </span>
            )}
          </button>
        )
      })}
    </>
  )
}
