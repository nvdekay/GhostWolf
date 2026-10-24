import { setState, toast, useAppState } from '@/app/store'
import { Icon } from '@/components/Icon'
import { GmBadge, Paper, RoleMedal, TeamBadge } from '@/components/ui'
import { cssVars, cx } from '@/lib/css'
import { useIsDesktop } from '@/lib/media'
import type { Game } from '@/types/game'
import { isWolfTeam, viewOf } from '@/features/roles/roles'
import { undo } from './actions'
import { DayPanel } from './DayPanel'
import { playerById } from './logic'
import { useBoard, type BoardModel } from './useBoard'
import './board.css'

function Seats({ m, ring }: { m: BoardModel; ring: boolean }) {
  return (
    <>
      {m.seats.map((p) => (
        <button
          key={p.id}
          className={cx('seat', ring ? 'seat--ring' : 'seat--grid')}
          data-picked={p.picked}
          data-dead={!p.alive}
          data-dimmed={p.dimmed}
          style={
            ring
              ? cssVars({
                  '--x': 50 + 41 * Math.cos(p.angle) + '%',
                  '--y': 50 + 41 * Math.sin(p.angle) + '%',
                })
              : undefined
          }
          onClick={p.onTap}
          aria-label={p.ariaLabel}
          aria-pressed={p.picked}
        >
          {ring ? (
            <span className="seat__top tabular">
              {p.seat}
              {p.chief && (
                <span className="gold-text" title="Trưởng làng">
                  <Icon name="crown" size={15} />
                </span>
              )}
              {p.lover && (
                <span title="Cặp đôi">
                  <Icon name="link" size={15} />
                </span>
              )}
              {!p.alive && (
                <span title="Đã bị loại">
                  <Icon name="skull" size={15} />
                </span>
              )}
            </span>
          ) : null}
          <span className="seat__line">
            {!ring && <span className="seat__num tabular">{p.seat}</span>}
            <span className="seat__name">{p.name}</span>
            {!ring && p.chief && (
              <span className="gold-text" aria-label="Trưởng làng">
                <Icon name="crown" size={15} />
              </span>
            )}
            {!ring && p.lover && (
              <span aria-label="Cặp đôi">
                <Icon name="link" size={15} />
              </span>
            )}
          </span>
          <span className="seat__role" data-team={p.team}>
            <Icon name={p.roleIcon} size={15} />
            {p.roleName}
          </span>
          {!ring && !p.alive && (
            <span className="seat__dead">
              <Icon name="skull" size={15} />
              Đã bị loại
            </span>
          )}
          {p.marks && <span className="seat__marks">{p.marks}</span>}
          {p.votes > 0 && <span className="seat__votes tabular">{p.votes}</span>}
        </button>
      ))}
    </>
  )
}

function NightPanel({ g, m, desk }: { g: Game; m: BoardModel; desk: boolean }) {
  const { s, def, key } = m
  if (!def || !key) return null
  const v = viewOf(def.role)
  const victim = g.night.wolf ? playerById(g, g.night.wolf) : null
  const seerP = g.night.seer ? playerById(g, g.night.seer) : null
  const seerWolf = seerP ? isWolfTeam(seerP.roleId) : false
  const canHeal = g.witch.heal && !!victim

  return (
    <>
      <div className="call-order" aria-label="Thứ tự gọi">
        {m.steps.map((k, i) => (
          <span
            key={k}
            className="call-chip"
            data-state={i < g.step ? 'done' : i === g.step ? 'current' : 'todo'}
          >
            {i < g.step && <Icon name="check" size={14} />}
            {viewOf(k).name}
          </span>
        ))}
      </div>
      <div className="panel-card">
        <div className="call-head" data-team={v.team}>
          <RoleMedal team={v.team} icon={v.icon} size={52} iconSize={26} ring={false} />
          <div className="call-head__text">
            <h2>{def.title}</h2>
            <div className="badges">
              <TeamBadge view={v} />
              {(def.gm || v.gm) && <GmBadge />}
            </div>
          </div>
        </div>
        <div className="script">
          <div className="label-caps">Đọc to</div>
          <p className="script__text pretty">{def.script}</p>
        </div>
        {m.roleDead && (
          <p className="muted panel-note">
            <Icon name="skull" size={15} />
            Vai này đã bị loại. Vẫn gọi như bình thường và chờ vài giây để không lộ thông tin.
          </p>
        )}
        {key === 'whitewolf' && (
          <p className="muted panel-note">
            Nếu Sói trắng loại một Ma sói, chạm vào người đó và chọn “Loại khỏi ván”.
          </p>
        )}
        {def.hint && m.pickMode && (
          <div className="pick-hint">
            <span className="gold-text">{def.hint}</span>
            <span className="muted">· chạm vào người chơi để chọn</span>
            {m.pickNames.length > 0 && (
              <button className="btn btn-ghost" onClick={() => setState({ picks: [] })}>
                Bỏ chọn
              </button>
            )}
          </div>
        )}
        {key === 'witch' && !m.roleDead && (
          <div className="witch">
            <div className="witch__stock">
              <span className="inline-icon">
                <span className="potion" data-kind="heal" data-full={g.witch.heal} />
                Bình cứu: {g.witch.heal ? 'Còn' : 'Đã dùng'}
              </span>
              <span className="inline-icon">
                <span className="potion" data-kind="poison" data-full={g.witch.poison} />
                Bình độc: {g.witch.poison ? 'Còn' : 'Đã dùng'}
              </span>
            </div>
            {victim ? (
              <div className="witch__victim">
                Ma sói đã chọn: <strong className="danger-text">{victim.name}</strong>
              </div>
            ) : (
              <div className="witch__victim muted">Ma sói không chọn ai đêm nay.</div>
            )}
            <div className="witch__actions">
              <button
                className="btn btn-secondary witch__btn"
                data-on={s.wHeal}
                data-kind="heal"
                disabled={!canHeal}
                aria-pressed={s.wHeal}
                onClick={() => setState({ wHeal: !s.wHeal })}
              >
                <Icon name="flask" size={15} />
                {s.wHeal
                  ? `Đã chọn cứu ${victim?.name ?? ''}`
                  : `Dùng bình cứu cho ${victim?.name ?? '…'}`}
              </button>
              <button
                className="btn btn-secondary witch__btn"
                data-on={s.wPoison}
                data-kind="poison"
                disabled={!g.witch.poison}
                aria-pressed={s.wPoison}
                onClick={() => setState({ wPoison: !s.wPoison, picks: [] })}
              >
                <Icon name="skull" size={15} />
                {s.wPoison
                  ? m.pickNames[0]
                    ? `Đầu độc ${m.pickNames[0]}`
                    : 'Chạm một người để đầu độc'
                  : 'Dùng bình độc'}
              </button>
            </div>
          </div>
        )}
        {key === 'seer' && g.night.seerDone && seerP && (
          <div className="seer-result">
            <span className="muted">Kết quả soi {seerP.name}</span>
            <span className="seer-result__value" data-wolf={seerWolf}>
              {seerWolf ? 'Là Ma sói' : 'Không phải Ma sói'}
            </span>
            <span className="muted">{seerWolf ? 'Ra hiệu: gật đầu' : 'Ra hiệu: lắc đầu'}</span>
          </div>
        )}
        {desk && m.primary && (
          <div className="panel-card__foot">
            <button
              className="btn btn-ink btn-lg btn-block"
              onClick={m.primary.onClick}
              disabled={m.primary.disabled}
            >
              {m.primary.label}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function NightSummary({ g, m, desk }: { g: Game; m: BoardModel; desk: boolean }) {
  const n = g.night
  const name = (id: string) => playerById(g, id).name
  const rows: [string, string][] = []
  if (n.protect) rows.push(['Bảo vệ', name(n.protect)])
  if (n.wolf) rows.push(['Ma sói chọn', name(n.wolf)])
  if (n.heal && n.wolf) rows.push(['Phù thủy cứu', name(n.wolf)])
  if (n.poison) rows.push(['Phù thủy đầu độc', name(n.poison)])
  if (n.seer) rows.push(['Tiên tri soi', name(n.seer)])

  return (
    <div className="panel-card">
      <h2>Đã gọi xong mọi vai</h2>
      {rows.length > 0 && (
        <dl className="summary">
          {rows.map(([k, v]) => (
            <div key={k} className="summary__row">
              <dt className="muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="predicted">
        <span className="gold-text">
          <Icon name="alert" size={15} />
        </span>
        {m.predicted.length ? m.predicted.join(', ') + ' sẽ bị loại' : 'Không ai bị loại đêm nay'}
      </div>
      {desk && m.primary && (
        <button className="btn btn-ink btn-lg" onClick={m.primary.onClick}>
          <Icon name="sun" />
          {m.primary.label}
        </button>
      )}
    </div>
  )
}

export function BoardScreen() {
  const { game: g, hist, shared, logOpen } = useAppState()
  if (!g) return null
  return <Board g={g} hist={hist} shared={shared} logOpen={logOpen} />
}

function Board({
  g,
  hist,
  shared,
  logOpen,
}: {
  g: Game
  hist: { label: string }[]
  shared: boolean
  logOpen: boolean
}) {
  const desk = useIsDesktop()
  const m = useBoard(g)
  const undoLabel = hist.length ? 'Hoàn tác: ' + hist.at(-1)!.label : 'Chưa có thao tác'
  const sharedLabel = shared ? 'Màn hình chung' : 'Màn hình riêng'
  const logs = g.log
    .filter((e) => !shared || e.pub)
    .slice()
    .reverse()
  const toggleShared = () => {
    setState({ shared: !shared, picks: [], wPoison: false })
    toast(shared ? 'Màn hình riêng: hiện vai cho quản trò' : 'Màn hình chung: đã giấu vai')
  }

  return (
    <Paper
      size="board"
      label="Bàn quản trò"
      className={cx('board-paper', m.night && 'board-paper--night')}
    >
      <header className="board-top">
        <div className="board-top__inner">
          <span className="gold-text">
            <Icon name={m.night ? 'moon' : 'sun'} size={22} />
          </span>
          <div className="board-top__phase">
            <span className="board-top__label">{m.phaseLabel}</span>
            <span className="board-top__sub">
              {m.phaseSub} · {m.aliveLabel}
            </span>
          </div>
          <button
            className="btn btn-secondary board-top__btn"
            onClick={undo}
            disabled={!hist.length}
            title={undoLabel}
            aria-label={undoLabel}
          >
            <Icon name="undo" />
            {desk && 'Hoàn tác'}
          </button>
          <button
            className="btn btn-secondary board-top__btn"
            onClick={toggleShared}
            aria-pressed={shared}
            aria-label={'Chuyển ' + sharedLabel}
          >
            <Icon name={shared ? 'monitor' : 'lock'} />
            {desk && sharedLabel}
          </button>
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => setState({ sheet: { type: 'menu' } })}
            aria-label="Menu ván"
          >
            <Icon name="dots" />
          </button>
        </div>
        {shared && (
          <div role="status" className="shared-banner">
            <Icon name="monitor" />
            <span className="shared-banner__text">
              <strong>MÀN HÌNH CHUNG</strong> · Vai và thông tin đêm đang được giấu
            </span>
            <button className="btn btn-ghost shared-banner__exit" onClick={toggleShared}>
              Thoát
            </button>
          </div>
        )}
      </header>

      <div className="board">
        <section aria-label="Người chơi" className="board__ring">
          {desk ? (
            <div className="ring-wrap">
              <div className="ring">
                <div className="ring__circle ring__circle--outer" />
                <div className="ring__circle ring__circle--inner" />
                <div className="ring__center">
                  <span className="gold-text">
                    <Icon name={m.night ? 'moon' : 'sun'} size={34} />
                  </span>
                  <span className="ring__phase">{m.phaseLabel}</span>
                  <span className="muted">{m.phaseSub}</span>
                  <span className="muted tabular ring__alive">{m.aliveLabel}</span>
                </div>
                <Seats m={m} ring />
              </div>
            </div>
          ) : (
            <>
              <div className="section-head board__list-head">
                <h3>Người chơi</h3>
                <span className="section-head__aside tabular">{m.aliveLabel}</span>
              </div>
              <div className="seat-grid">
                <Seats m={m} ring={false} />
              </div>
            </>
          )}
        </section>

        <section aria-label="Điều hành" className="board__panel">
          {m.nightPriv && <NightPanel g={g} m={m} desk={desk} />}
          {m.nightShared && (
            <div className="eyes-closed">
              <span className="gold-text">
                <Icon name="moon" size={34} />
              </span>
              <h2>Mọi người nhắm mắt</h2>
              <p className="muted">
                Quản trò đang gọi vai. Thông tin đêm được giấu trên màn hình chung.
              </p>
              {desk && m.primary && (
                <button className="btn btn-ink btn-lg" onClick={m.primary.onClick}>
                  <Icon name="lock" />
                  {m.primary.label}
                </button>
              )}
            </div>
          )}
          {m.nightDone && <NightSummary g={g} m={m} desk={desk} />}
          {!m.night && <DayPanel g={g} m={m} desk={desk} />}
        </section>

        <section aria-label="Nhật ký ván" className="board__log">
          <button
            className="log-toggle"
            onClick={() => setState({ logOpen: !logOpen })}
            aria-expanded={logOpen}
          >
            <Icon name="list" />
            <span className="log-toggle__title">Nhật ký ván</span>
            <span className="muted">{logs.length} mục</span>
            <Icon name={logOpen ? 'up' : 'down'} />
          </button>
          {logOpen && (
            <ol className="log">
              {logs.map((e, i) => (
                <li key={logs.length - i}>
                  <span className="muted log__tag">{e.tag}</span>
                  <span>
                    {e.text}
                    {!e.pub && <span className="secret-tag">Bí mật</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {!desk && m.primary && (
        <div className="bottom-bar board-bar">
          <div className="board-bar__inner">
            {m.primary.hint && <span className="muted board-bar__hint">{m.primary.hint}</span>}
            <button
              className="btn btn-ink btn-lg btn-block"
              onClick={m.primary.onClick}
              disabled={m.primary.disabled}
            >
              {m.primary.label}
            </button>
          </div>
        </div>
      )}
    </Paper>
  )
}
