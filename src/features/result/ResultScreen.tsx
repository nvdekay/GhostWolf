import { getState, setState, useAppState } from '@/app/store'
import { Icon, type IconName } from '@/components/Icon'
import { Ornament, Paper, RoleMedal } from '@/components/ui'
import type { Game, WinnerTeam } from '@/types/game'
import { isWolfTeam, viewOf } from '@/features/roles/roles'
import { genRoomCode, nextId } from '@/lib/random'
import './result.css'

const TEAM_ICON: Record<WinnerTeam, IconName> = {
  village: 'house',
  wolf: 'paw',
  solo: 'sparkles',
  lovers: 'heart',
  none: 'moon',
}

/** Bắt đầu lại với cùng nhóm người: tới màn chia vai hoặc chọn bộ vai. */
function playAgain(g: Game, screen: 'assign' | 'roles') {
  const players = g.players.map((p) => ({ id: nextId(), name: p.name, device: true }))
  setState({
    room: { code: getState().room?.code ?? genRoomCode(), name: g.name, locked: true, players },
    players,
    counts: { ...g.counts },
    savedGame: null,
    assign: null,
    screen,
  })
}

export function ResultScreen() {
  const { game: g } = useAppState()
  if (!g) return null

  const w = g.winner ?? {
    team: 'none' as const,
    title: 'Ván kết thúc sớm',
    reason: 'Quản trò đã dừng ván trước khi có phe chiến thắng.',
  }
  const isWinner = (roleId: string, lover: boolean) =>
    w.team === 'village'
      ? viewOf(roleId).team === 'village'
      : w.team === 'wolf'
        ? isWolfTeam(roleId) && roleId !== 'whitewolf'
        : w.team === 'lovers'
          ? lover
          : false
  const events = g.log.filter((e) => e.pub || /Cupid|Phù thủy|Tiên tri/.test(e.text))

  return (
    <Paper size="result" label="Kết quả ván" as="main" className="result">
      <div className="result__hero">
        <span className="result__medal">
          <Icon name={TEAM_ICON[w.team]} size={48} />
        </span>
        <div className="eyebrow eyebrow--muted">
          {g.name} · {g.day} đêm · {g.players.filter((p) => p.alive).length}/{g.players.length}{' '}
          người còn sống
        </div>
        <h1 className="result__title">{w.title}</h1>
        <Ornament width={320} center />
        <p className="muted pretty result__reason">{w.reason}</p>
      </div>

      <section className="result__section">
        <h2 className="result__h2">Vai của mọi người</h2>
        <div className="result__grid">
          {g.players.map((p) => {
            const v = viewOf(p.roleId)
            const win = isWinner(p.roleId, p.lover)
            return (
              <div
                key={p.id}
                className="result-card"
                data-team={v.team}
                data-win={win}
                data-dead={!p.alive}
              >
                <RoleMedal team={v.team} icon={v.icon} size={46} iconSize={26} ring={false} />
                <div className="result-card__text">
                  <span className="result-card__name">{p.name}</span>
                  <span className="team-ink">{v.name}</span>
                  <span className="muted result-card__status">
                    {p.alive ? 'Còn sống' : 'Bị loại'}
                    {p.lover && ' · Cặp đôi'}
                    {p.chief && ' · Trưởng làng'}
                  </span>
                </div>
                {win && (
                  <span className="gold-text" aria-label="Phe thắng">
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
          {events.map((e, i) => (
            <li key={i}>
              <span className="muted">{e.tag}</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="result__actions">
        <button className="btn btn-ink result__replay" onClick={() => playAgain(g, 'assign')}>
          <Icon name="reset" />
          Chơi lại với nhóm này
        </button>
        <button className="btn btn-secondary" onClick={() => playAgain(g, 'roles')}>
          Đổi bộ vai
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => setState({ screen: 'home', savedGame: null })}
        >
          <Icon name="home" />
          Về trang chủ
        </button>
      </div>
    </Paper>
  )
}
