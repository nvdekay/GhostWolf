import { useState } from 'react'
import type { PublicState, WinnerTeam } from '@engine'
import { useNav } from '@/app/App'
import { useFeedback } from '@/app/feedback'
import { Icon, type IconName } from '@/components/Icon'
import { Ornament, Paper, RoleMedal } from '@/components/ui'
import { refreshRoom } from '@/realtime/roomStore'
import { sendRoomCommand } from '@/services/game'
import { useHost } from '@/features/host/context'
import { roleView, viewOf } from '@/features/roles/roles'
import './result.css'

const TEAM_ICON: Record<WinnerTeam, IconName> = {
  village: 'house',
  wolf: 'paw',
  solo: 'sparkles',
  lovers: 'heart',
  whitewolf: 'moon',
  tanner: 'ghost',
  piper: 'music',
  none: 'moon',
}

/** Kết quả đã công bố — dùng chung cho máy quản trò và máy người chơi. */
export function ResultView({
  pub,
  highlight,
  actions,
}: {
  pub: PublicState
  highlight?: string
  actions?: React.ReactNode
}) {
  const r = pub.result
  if (!r) return null
  const alive = pub.players.filter((p) => p.alive).length
  const lovers = new Set(r.lovers)
  const winners = new Set(r.winners)
  return (
    <Paper label="Kết quả ván" as="main" className="result">
      <div className="result__hero">
        <span className="result__medal">
          <Icon name={TEAM_ICON[r.team]} size={48} />
        </span>
        <div className="eyebrow eyebrow--muted">
          {pub.name} · {pub.day} đêm · {alive}/{pub.players.length} người còn sống
        </div>
        <h1 className="result__title">{r.title}</h1>
        <Ornament width={320} center />
        <p className="muted pretty result__reason">{r.reason}</p>
        {highlight && (
          <p className="result__me">
            {winners.has(highlight)
              ? 'Bạn thuộc phe chiến thắng.'
              : 'Bạn không thuộc phe chiến thắng.'}
          </p>
        )}
      </div>

      <section className="result__section">
        <h2 className="result__h2">Vai của mọi người</h2>
        <div className="result__grid">
          {pub.players.map((p) => {
            const v = p.role
              ? roleView({ ...p.role, short: '', skill: '', wake: '' })
              : viewOf('villager')
            const win = winners.has(p.id)
            return (
              <div
                key={p.id}
                className="result-card"
                data-team={v.team}
                data-win={win}
                data-dead={!p.alive}
                data-me={p.id === highlight}
              >
                <RoleMedal team={v.team} icon={v.icon} size={46} iconSize={26} ring={false} />
                <div className="result-card__text">
                  <span className="result-card__name">{p.name}</span>
                  <span className="team-ink">{p.role?.name ?? '—'}</span>
                  <span className="muted result-card__status">
                    {p.alive ? 'Còn sống' : 'Bị loại'}
                    {lovers.has(p.id) && ' · Cặp đôi'}
                    {p.chief && ' · Trưởng làng'}
                  </span>
                </div>
                {win && (
                  <span className="gold-text" aria-label="Phe thắng" title="Phe thắng">
                    <Icon name="crown" size={15} />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="result__section">
        <h2 className="result__h2">Diễn biến chính</h2>
        <ol className="result__events">
          {pub.log.map((e, i) => (
            <li key={i}>
              <span className="muted">{e.tag}</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      </section>
      {actions && <div className="result__actions">{actions}</div>}
    </Paper>
  )
}

export function ResultScreen() {
  const nav = useNav()
  const fb = useFeedback()
  const { game, room, setView } = useHost()
  const [busy, setBusy] = useState(false)
  if (!game) return null

  const replay = async (to: 'assign' | 'roles') => {
    setBusy(true)
    try {
      setView(to, { afterChange: true })
      await sendRoomCommand(room.id, { type: 'game.replay' })
      await refreshRoom(room.id)
    } catch (e) {
      setView(null)
      fb.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ResultView
      pub={game.public_state}
      actions={
        <>
          <button
            className="btn btn-ink result__replay"
            disabled={busy}
            onClick={() => void replay('assign')}
          >
            <Icon name="reset" />
            Chơi lại với nhóm này
          </button>
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void replay('roles')}
          >
            Đổi bộ vai
          </button>
          <button className="btn btn-secondary" onClick={nav.home}>
            <Icon name="home" />
            Về trang chủ
          </button>
        </>
      }
    />
  )
}
