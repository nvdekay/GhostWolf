import type { GameState } from '@engine'
import { Icon } from '@/components/Icon'
import { GmBadge, RoleMedal, TeamBadge } from '@/components/ui'
import { viewOf } from '@/features/roles/roles'
import type { NightModel, NightUi } from './model'

const nameOf = (s: GameState, id: string | null | undefined) =>
  s.players.find((p) => p.id === id)?.name ?? ''

export function NightPanel({
  s,
  m,
  ui,
  setUi,
  footer,
}: {
  s: GameState
  m: NightModel
  ui: NightUi
  setUi: (patch: Partial<NightUi>) => void
  footer: React.ReactNode
}) {
  const night = s.night!

  if (!m.key || !m.info) {
    const a = night.actions
    const rows: [string, string][] = []
    if (a.cupid) rows.push(['Cupid ghép đôi', a.cupid.map((id) => nameOf(s, id)).join(' và ')])
    if (a.guard) rows.push(['Bảo vệ', nameOf(s, a.guard)])
    if (a.wolf) rows.push(['Bầy sói chọn', nameOf(s, a.wolf)])
    if (a.whitewolf) rows.push(['Sói trắng chọn', nameOf(s, a.whitewolf)])
    if (a.witchHeal) rows.push(['Phù thủy cứu', nameOf(s, a.wolf)])
    if (a.witchPoison) rows.push(['Phù thủy đầu độc', nameOf(s, a.witchPoison)])
    if (a.seer) rows.push(['Tiên tri soi', nameOf(s, a.seer)])
    if (a.piper?.length) rows.push(['Bị mê hoặc', a.piper.map((id) => nameOf(s, id)).join(', ')])
    if (a.gmKills?.length)
      rows.push(['Quản trò loại', a.gmKills.map((id) => nameOf(s, id)).join(', ')])
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
          {m.predicted.length
            ? m.predicted.map((id) => nameOf(s, id)).join(', ') +
              ' sẽ bị loại (chưa tính Cặp đôi đi theo)'
            : 'Không ai bị loại đêm nay'}
        </div>
        {footer}
      </div>
    )
  }

  const info = m.info
  const v = viewOf(info.role === 'wolf' ? 'wolf' : info.role, s.customRoles)
  const victim = night.actions.wolf

  return (
    <>
      <div className="call-order" aria-label="Thứ tự gọi">
        {night.steps.map((k, i) => (
          <span
            key={k}
            className="call-chip"
            data-state={i < night.step ? 'done' : i === night.step ? 'current' : 'todo'}
          >
            {i < night.step && <Icon name="check" size={14} />}
            {k === 'wolf' ? 'Bầy sói' : viewOf(k, s.customRoles).name}
          </span>
        ))}
      </div>
      <div className="panel-card">
        <div className="call-head" data-team={v.team}>
          <RoleMedal team={v.team} icon={v.icon} size={52} iconSize={26} ring={false} />
          <div className="call-head__text">
            <h2>{info.title}</h2>
            <div className="badges">
              <TeamBadge view={v} />
              {(info.gm || v.gm) && <GmBadge />}
            </div>
          </div>
        </div>
        <div className="script">
          <div className="label-caps">Đọc to</div>
          <p className="script__text pretty">{info.script}</p>
        </div>
        {!m.actorsAlive && (
          <p className="muted panel-note">
            <Icon name="skull" size={15} />
            Vai này đã bị loại. Vẫn gọi như bình thường và chờ vài giây để không lộ thông tin.
          </p>
        )}
        {m.pickMode && (
          <div className="pick-hint">
            <span className="gold-text">{info.hint}</span>
            <span className="muted">· chạm vào người chơi để chọn</span>
            {ui.picks.length > 0 && (
              <button className="btn btn-ghost" onClick={() => setUi({ picks: [] })}>
                Bỏ chọn
              </button>
            )}
          </div>
        )}
        {m.key === 'witch' && m.actorsAlive && (
          <div className="witch">
            <div className="witch__stock">
              <span className="inline-icon">
                <span className="potion" data-kind="heal" data-full={s.witch.heal} />
                Bình cứu: {s.witch.heal ? 'Còn' : 'Đã dùng'}
              </span>
              <span className="inline-icon">
                <span className="potion" data-kind="poison" data-full={s.witch.poison} />
                Bình độc: {s.witch.poison ? 'Còn' : 'Đã dùng'}
              </span>
            </div>
            {victim ? (
              <div className="witch__victim">
                Bầy sói đã chọn: <strong className="danger-text">{nameOf(s, victim)}</strong>
              </div>
            ) : (
              <div className="witch__victim muted">Bầy sói không chọn ai đêm nay.</div>
            )}
            <div className="witch__actions">
              <button
                className="btn btn-secondary witch__btn"
                data-on={ui.heal}
                data-kind="heal"
                disabled={!m.canHeal}
                aria-pressed={ui.heal}
                onClick={() => setUi({ heal: !ui.heal })}
              >
                <Icon name="flask" size={15} />
                {ui.heal
                  ? `Đã chọn cứu ${nameOf(s, victim)}`
                  : `Dùng bình cứu cho ${nameOf(s, victim) || '…'}`}
              </button>
              <button
                className="btn btn-secondary witch__btn"
                data-on={ui.poisonMode}
                data-kind="poison"
                disabled={!s.witch.poison}
                aria-pressed={ui.poisonMode}
                onClick={() => setUi({ poisonMode: !ui.poisonMode, picks: [] })}
              >
                <Icon name="skull" size={15} />
                {ui.poisonMode
                  ? ui.picks[0]
                    ? `Đầu độc ${nameOf(s, ui.picks[0])}`
                    : 'Chạm một người để đầu độc'
                  : 'Dùng bình độc'}
              </button>
            </div>
            {!s.options.witchSelfHeal && (
              <p className="muted panel-note">Luật ván này: Phù thủy không được tự cứu.</p>
            )}
          </div>
        )}
        {m.seer && (
          <div className="seer-result">
            <span className="muted">Kết quả soi {m.seer.name}</span>
            <span className="seer-result__value" data-wolf={m.seer.wolf}>
              {m.seer.wolf ? 'Là Ma sói' : 'Không phải Ma sói'}
            </span>
            <span className="muted">{m.seer.wolf ? 'Ra hiệu: gật đầu' : 'Ra hiệu: lắc đầu'}</span>
          </div>
        )}
        {m.actorsAlive && info.pick[1] === 0 && m.key !== 'witch' && (
          <div className="field">
            <label htmlFor="gmnote">Ghi chú xử lý (riêng quản trò)</label>
            <textarea
              id="gmnote"
              className="input"
              maxLength={500}
              value={ui.note}
              onChange={(e) => setUi({ note: e.target.value })}
              placeholder={m.key === 'whitewolf' ? '' : 'Ví dụ: chọn ai, kết quả…'}
            />
          </div>
        )}
        {footer}
      </div>
    </>
  )
}
