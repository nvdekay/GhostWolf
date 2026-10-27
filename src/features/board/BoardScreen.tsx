import { useState, type ReactNode } from 'react'
import {
  eligibleVoters,
  voteCandidates,
  type GameState,
  type Player,
  type PublicState,
} from '@engine'
import { useNav } from '@/app/App'
import { useFeedback } from '@/app/feedback'
import { Icon } from '@/components/Icon'
import { Dialog, Sheet } from '@/components/overlay'
import { Paper } from '@/components/ui'
import { cx } from '@/lib/css'
import { useIsDesktop } from '@/lib/media'
import { useHost } from '@/features/host/context'
import { HowToSheet } from '@/features/home/HowToSheet'
import { RoleDetailSheet } from '@/features/roles/RoleSheets'
import { RemoteChat } from '@/features/remote/RemoteChat'
import { viewOf } from '@/features/roles/roles'
import { EffectDialog, EndDialog, MenuSheet, PlayerSheet } from './BoardSheets'
import { DayPanel, Timer, type VoteDraft } from './DayPanel'
import { nightMarks, nightModel, type NightUi, type Primary } from './model'
import { NightPanel } from './NightPanel'
import { Seats, type SeatModel } from './Seats'
import './board.css'

type SheetState =
  | { type: 'player'; id: string }
  | { type: 'role'; id: string }
  | { type: 'menu' }
  | { type: 'howto' }
  | null
type DialogState =
  | { type: 'kill'; id: string; cause: 'vote' | 'gm'; reason?: string }
  | { type: 'reset' }
  | { type: 'end' }
  | null

const sharedKey = (gameId: string) => `gw.shared.${gameId}`
const readShared = (gameId: string) => {
  try {
    return localStorage.getItem(sharedKey(gameId)) === '1'
  } catch {
    return false
  }
}

export function BoardScreen() {
  const nav = useNav()
  const fb = useFeedback()
  const desk = useIsDesktop()
  const { snap, room, game, run, setView, startDeal } = useHost()
  const s = snap.secrets
  const [shared, setSharedState] = useState(() => (game ? readShared(game.id) : false))
  const [ui, setUiState] = useState<NightUi>({
    picks: [],
    heal: false,
    poisonMode: false,
    note: '',
  })
  const [draft, setDraft] = useState<VoteDraft>({ votes: {}, chiefVote: null })
  const [logOpen, setLogOpen] = useState(false)
  const [sheet, setSheet] = useState<SheetState>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [busy, setBusy] = useState(false)
  // Lựa chọn tạm của bước đêm/phiếu gắn với revision: dữ liệu đổi (kể cả từ tab khác) thì xóa.
  const [uiRev, setUiRev] = useState(game?.revision)
  if (game && uiRev !== game.revision) {
    setUiRev(game.revision)
    setUiState({ picks: [], heal: false, poisonMode: false, note: '' })
  }

  if (!s || !game) return null
  const pub = game.public_state
  const setUi = (patch: Partial<NightUi>) => setUiState((u) => ({ ...u, ...patch }))
  const setShared = (v: boolean) => {
    setSharedState(v)
    setSheet(null)
    try {
      localStorage.setItem(sharedKey(game.id), v ? '1' : '0')
    } catch {
      // bỏ qua
    }
  }

  const exec = async (cmd: Parameters<typeof run>[0], after?: () => void) => {
    setBusy(true)
    const ok = await run(cmd)
    setBusy(false)
    if (ok) after?.()
    return ok
  }

  const night = s.phase === 'night'
  const nm = !shared ? nightModel(s, ui) : null
  const voteMode =
    !night && s.dayState?.step === 'vote' && !s.dayState.result && !s.dayState.resolved
  const candidates = new Set(voteMode ? voteCandidates(s).map((p) => p.id) : [])
  const viewedAt = new Map(snap.assignments.map((a) => [a.member_id, a.viewed_at]))
  const alive = s.players.filter((p) => p.alive)
  const effect = s.effects[0]
  const blocked = !!effect || !!s.winner
  const remoteMissing =
    room.options.mode === 'remote' && snap.remotePhase
      ? snap.prompts.filter(
          (prompt) =>
            prompt.phase_sequence === snap.remotePhase!.sequence && prompt.status !== 'submitted',
        )
      : []

  const togglePick = (id: string) => {
    const max = nm?.pickMax ?? 0
    setUiState((u) => {
      let p = u.picks.includes(id) ? u.picks.filter((x) => x !== id) : [...u.picks, id]
      if (max === 1) p = u.picks.includes(id) ? [] : [id]
      if (p.length > max) p = p.slice(-max)
      return { ...u, picks: p }
    })
  }

  const seats: SeatModel[] = shared
    ? pub.players.map((p) => ({
        id: p.id,
        seat: p.seat,
        name: p.name,
        alive: p.alive,
        chief: p.chief,
        lover: false,
        roleName: p.role?.name ?? 'Vai ẩn',
        roleIcon: p.role?.icon ?? 'lock',
        team: p.role ? p.role.team : 'hidden',
        marks: '',
        picked: false,
        dimmed: !p.alive,
        votes: 0,
        ariaLabel: `${p.name}${p.alive ? '' : ', đã bị loại'}`,
        onTap: () => setSheet({ type: 'player', id: p.id }),
      }))
    : s.players.map((p) => {
        const v = viewOf(p.roleId, s.customRoles)
        const reason = nm?.disabledReason(p) ?? null
        const picked = ui.picks.includes(p.id)
        return {
          id: p.id,
          seat: p.seat,
          name: p.name,
          alive: p.alive,
          chief: p.chief,
          lover: p.lover,
          roleName: v.name,
          roleIcon: v.icon,
          team: v.team,
          marks: [
            night ? nightMarks(s, p) : p.charmed ? 'Bị mê hoặc' : '',
            !p.canVote && p.alive ? 'Mất quyền bầu' : '',
            nm?.pickMode && reason && p.alive ? reason : '',
          ]
            .filter(Boolean)
            .join(' · '),
          picked,
          dimmed: !p.alive || (!!nm?.pickMode && !!reason),
          votes: voteMode ? (draft.votes[p.id] ?? 0) : 0,
          ariaLabel: `${p.name}, ${v.name}${p.alive ? '' : ', đã bị loại'}${picked ? ', đang chọn' : ''}${nm?.pickMode && reason ? ', ' + reason : ''}`,
          onTap: () => {
            if (nm?.pickMode && !blocked) {
              if (!reason) togglePick(p.id)
              return
            }
            if (voteMode && candidates.has(p.id) && !blocked) {
              setDraft((d) => ({ ...d, votes: { ...d.votes, [p.id]: (d.votes[p.id] ?? 0) + 1 } }))
              return
            }
            setSheet({ type: 'player', id: p.id })
          },
        }
      })

  // Hành động chính của bước hiện tại.
  let primary: Primary | null = null
  if (!shared && !blocked) {
    if (night && nm) primary = nm.primary
    else if (s.dayState) {
      const d = s.dayState
      const sum = Object.values(draft.votes).reduce((a, b) => a + b, 0)
      const max = eligibleVoters(s).length
      if (d.step === 'announce')
        primary = {
          label: 'Bắt đầu thảo luận',
          command: { type: 'day.goto', step: 'discuss' },
          disabled: false,
          hint: '',
        }
      else if (d.step === 'discuss')
        primary = {
          label: 'Chuyển sang bỏ phiếu',
          command: { type: 'day.goto', step: 'vote' },
          disabled: false,
          hint: '',
        }
      else if (d.step === 'vote' && !d.result)
        primary = {
          label: 'Xem kết quả',
          command: { type: 'vote.tally', votes: draft.votes, chiefVote: draft.chiefVote },
          disabled: sum === 0 || sum > max,
          hint:
            sum > max
              ? `Vượt ${sum - max} phiếu so với ${max} người có quyền bầu`
              : sum
                ? `${sum} phiếu`
                : 'Chưa có phiếu',
        }
      else if (d.step === 'after')
        primary = {
          label: `Đi ngủ · bắt đầu Đêm ${s.day + 1}`,
          command: { type: 'night.start' },
          disabled: false,
          hint: '',
        }
    }
  }
  const single =
    !shared && !blocked && s.dayState?.step === 'vote' && s.dayState.result?.top.length === 1
      ? s.dayState.result.top[0]!
      : null

  const fire = (p: Primary) =>
    exec(p.command, () => {
      if (p.command.type === 'night.end') fb.curtain('Trời sáng', 'Ngày ' + s.day, 'sun')
      if (p.command.type === 'night.start')
        fb.curtain('Màn đêm buông xuống', 'Đêm ' + (s.day + 1), 'moon')
      if (p.command.type === 'vote.tally' || p.command.type === 'night.start')
        setDraft({ votes: {}, chiefVote: null })
    })

  const primaryButton = (cls: string) => (
    <>
      {primary && (
        <button
          className={cx('btn btn-ink btn-lg btn-block', cls)}
          onClick={() => void fire(primary!)}
          disabled={primary.disabled || busy}
        >
          {primary.label}
        </button>
      )}
      {single && (
        <button
          className={cx('btn btn-ink btn-lg btn-block', cls)}
          disabled={busy}
          onClick={() => setDialog({ type: 'kill', id: single, cause: 'vote' })}
        >
          Loại {s.players.find((p) => p.id === single)?.name}
        </button>
      )}
    </>
  )
  const footer: ReactNode =
    desk && (primary || single) ? <div className="panel-card__foot">{primaryButton('')}</div> : null

  const phaseLabel = (night ? 'Đêm ' : 'Ngày ') + s.day
  const phaseSub = night
    ? shared
      ? 'Mọi người nhắm mắt'
      : nm?.info
        ? `${nm.key === 'wolf' ? 'Bầy sói' : nm.info.title.replace('Gọi ', '')} · bước ${s.night!.step + 1}/${s.night!.steps.length}`
        : 'Đã gọi xong'
    : { announce: 'Công bố', discuss: 'Thảo luận', vote: 'Bỏ phiếu', after: 'Kết thúc ngày' }[
        s.dayState!.step
      ]
  const aliveLabel = `${(shared ? pub.players.filter((p) => p.alive) : alive).length}/${s.players.length} còn sống`
  const logs = (shared ? pub.log : s.log).slice().reverse()

  const killTarget = dialog?.type === 'kill' ? s.players.find((p) => p.id === dialog.id) : null

  return (
    <Paper label="Bàn quản trò" className={cx('board-paper', night && 'board-paper--night')}>
      <header className="board-top">
        <div className="board-top__inner">
          <span className="gold-text">
            <Icon name={night ? 'moon' : 'sun'} size={22} />
          </span>
          <div className="board-top__phase">
            <span className="board-top__label">{phaseLabel}</span>
            <span className="board-top__sub">
              {phaseSub} · {aliveLabel}
            </span>
          </div>
          <button
            className="btn btn-secondary board-top__btn"
            onClick={() => void exec({ type: 'undo' })}
            disabled={busy}
            aria-label="Hoàn tác thao tác vừa rồi"
          >
            <Icon name="undo" />
            {desk && 'Hoàn tác'}
          </button>
          <button
            className="btn btn-secondary board-top__btn"
            onClick={() => {
              setShared(!shared)
              fb.toast(
                shared ? 'Màn hình riêng: hiện vai cho quản trò' : 'Màn hình chung: đã giấu vai',
              )
            }}
            aria-pressed={shared}
            aria-label={
              shared
                ? 'Đang ở màn hình chung, chuyển về màn hình riêng'
                : 'Chuyển sang màn hình chung'
            }
          >
            <Icon name={shared ? 'monitor' : 'lock'} />
            {desk && (shared ? 'Màn hình chung' : 'Màn hình riêng')}
          </button>
          <button
            className="btn btn-secondary btn-icon"
            onClick={() => setSheet({ type: 'menu' })}
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
            <button className="btn btn-ghost shared-banner__exit" onClick={() => setShared(false)}>
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
                    <Icon name={night ? 'moon' : 'sun'} size={34} />
                  </span>
                  <span className="ring__phase">{phaseLabel}</span>
                  <span className="muted">{phaseSub}</span>
                  <span className="muted tabular ring__alive">{aliveLabel}</span>
                </div>
                <Seats seats={seats} ring />
              </div>
            </div>
          ) : (
            <>
              <div className="section-head board__list-head">
                <h3>Người chơi</h3>
                <span className="section-head__aside tabular">{aliveLabel}</span>
              </div>
              <div className="seat-grid">
                <Seats seats={seats} ring={false} />
              </div>
            </>
          )}
        </section>

        <section aria-label="Điều hành" className="board__panel">
          {room.options.mode === 'remote' && snap.remotePhase && !shared && (
            <div className="effect-note remote-progress" role="status">
              <Icon name="users" size={18} />
              <span>
                Remote · {snap.remotePhase.submitted_count}/{snap.remotePhase.required_count} đã gửi
              </span>
              {remoteMissing[0] && (
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    void exec({
                      type: 'remote.timeout',
                      promptId: remoteMissing[0]!.id,
                      reason: 'Quản trò ghi nhận người chơi quá hạn hoặc mất kết nối.',
                    })
                  }
                >
                  Bỏ lượt hộ{' '}
                  {snap.members.find((member) => member.id === remoteMissing[0]!.member_id)?.name}
                </button>
              )}
              {snap.remotePhase.deadline && (
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    void exec({
                      type: 'remote.extend',
                      seconds: 30,
                      reason: 'Quản trò gia hạn phase.',
                    })
                  }
                >
                  +30 giây
                </button>
              )}
              {['night_action', 'effect_resolution', 'day_voting'].includes(
                snap.remotePhase.kind,
              ) && (
                <button
                  className="btn btn-ink"
                  disabled={busy || remoteMissing.length > 0}
                  onClick={() => void exec({ type: 'remote.lock' })}
                >
                  Khóa lượt và áp dụng
                </button>
              )}
            </div>
          )}
          {effect && !shared && (
            <div className="effect-note" role="status">
              <Icon name="alert" size={18} />
              Còn hiệu ứng cần xử lý trước khi tiếp tục.
            </div>
          )}
          {shared ? (
            <SharedPanel pub={pub} gameId={game.id} onPrivate={() => setShared(false)} />
          ) : night && nm ? (
            <NightPanel s={s} m={nm} ui={ui} setUi={setUi} footer={footer} />
          ) : (
            <>
              <DayPanel
                s={s}
                gameId={game.id}
                draft={draft}
                setDraft={setDraft}
                onEliminate={(id, reason) => setDialog({ type: 'kill', id, cause: 'vote', reason })}
                footer={footer}
              />
              {room.options.mode === 'remote' && s.dayState?.step === 'discuss' && (
                <RemoteChat
                  roomId={room.id}
                  gameId={game.id}
                  channel="public"
                  members={snap.members}
                  canSend
                  isHost
                />
              )}
            </>
          )}
        </section>

        <section aria-label="Nhật ký ván" className="board__log">
          <button
            className="log-toggle"
            onClick={() => setLogOpen(!logOpen)}
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

      {!desk && (primary || single) && (
        <div className="bottom-bar board-bar">
          <div className="board-bar__inner">
            {primary?.hint && <span className="muted board-bar__hint">{primary.hint}</span>}
            {primaryButton('')}
          </div>
        </div>
      )}

      {sheet && (
        <Sheet onClose={() => setSheet(null)} label="Chi tiết">
          {sheet.type === 'player' && (
            <PlayerSheet
              s={s}
              pub={pub}
              id={sheet.id}
              shared={shared}
              viewed={!!viewedAt.get(sheet.id)}
              onRole={(roleId) => setSheet({ type: 'role', id: roleId })}
              onChief={(p) =>
                void exec({ type: 'player.setChief', playerId: p.chief ? null : p.id }, () =>
                  setSheet(null),
                )
              }
              onKill={(p) => {
                setSheet(null)
                setDialog({ type: 'kill', id: p.id, cause: 'gm' })
              }}
              onRevive={(p) =>
                void exec({ type: 'player.revive', playerId: p.id }, () => setSheet(null))
              }
              onShowRole={(p) => startDeal([p.id], 'board')}
            />
          )}
          {sheet.type === 'role' && <RoleDetailSheet view={viewOf(sheet.id, s.customRoles)} />}
          {sheet.type === 'howto' && <HowToSheet />}
          {sheet.type === 'menu' && (
            <MenuSheet
              name={s.name}
              onLog={() => {
                setSheet(null)
                setLogOpen(true)
              }}
              onHowto={() => setSheet({ type: 'howto' })}
              onLobby={() => setView('lobby')}
              onHome={() => {
                nav.home()
                fb.toast('Ván vẫn được lưu. Mở lại từ trang chủ.')
              }}
              onEnd={() => {
                setSheet(null)
                setDialog({ type: 'end' })
              }}
              onReset={() => {
                setSheet(null)
                setDialog({ type: 'reset' })
              }}
            />
          )}
        </Sheet>
      )}

      {dialog?.type === 'kill' && killTarget && (
        <KillDialog
          p={killTarget}
          s={s}
          cause={dialog.cause}
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            void exec(
              dialog.cause === 'vote'
                ? { type: 'vote.eliminate', target: killTarget.id, reason: dialog.reason }
                : { type: 'player.kill', playerId: killTarget.id },
              () => setDialog(null),
            )
          }
        />
      )}
      {dialog?.type === 'reset' && (
        <Dialog
          title="Reset ván về Đêm 1?"
          onClose={() => setDialog(null)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setDialog(null)}>
                Hủy
              </button>
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() =>
                  void exec({ type: 'reset' }, () => {
                    setDialog(null)
                    fb.curtain('Màn đêm buông xuống', 'Đêm 1', 'moon')
                  })
                }
              >
                Reset ván
              </button>
            </>
          }
        >
          <p className="dialog__body">
            Mọi người sống lại; Cặp đôi, Trưởng làng, bình của Phù thủy và nhật ký bắt đầu lại. Vai
            đã chia được giữ nguyên. Bạn vẫn có thể Hoàn tác.
          </p>
        </Dialog>
      )}
      {dialog?.type === 'end' && (
        <EndDialog
          onClose={() => setDialog(null)}
          onPick={(team) => void exec({ type: 'finish', team }, () => setDialog(null))}
        />
      )}
      {effect && !shared && (
        <EffectDialog
          s={s}
          effect={effect}
          busy={busy}
          onResolve={(target) => void exec({ type: 'effect.resolve', effectId: effect.id, target })}
        />
      )}
      {s.winner && !effect && (
        <Dialog
          layer="winner"
          className="dialog--center"
          title={
            <>
              <span className="gold-text winner__crown">
                <Icon name="crown" />
              </span>
              {s.winner.title}
            </>
          }
          actions={
            <>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void exec({ type: 'undo' })}
              >
                <Icon name="undo" />
                Hoàn tác
              </button>
              <button
                className="btn btn-ink"
                disabled={busy}
                onClick={() => void exec({ type: 'finish' })}
              >
                Công bố kết quả
              </button>
            </>
          }
        >
          <p className="dialog__body">{shared ? 'Quản trò công bố kết quả.' : s.winner.reason}</p>
        </Dialog>
      )}
    </Paper>
  )
}

function KillDialog({
  p,
  s,
  cause,
  busy,
  onClose,
  onConfirm,
}: {
  p: Player
  s: GameState
  cause: 'vote' | 'gm'
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const night = s.phase === 'night'
  const extra = [
    p.lover ? 'Người còn lại trong Cặp đôi sẽ bị loại theo.' : '',
    p.roleId === 'hunter' ? 'Thợ săn sẽ được chọn một người để bắn.' : '',
    p.chief && s.options.chief ? 'Trưởng làng sẽ chỉ định người kế nhiệm.' : '',
    p.roleId === 'idiot' && cause === 'vote' && !p.triggered.idiot
      ? 'Đây là Thằng ngốc: sẽ lật thẻ, ở lại làng và mất quyền bỏ phiếu.'
      : '',
    night ? 'Đang là ban đêm: người này được công bố bị loại lúc trời sáng.' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Dialog
      title={`Loại ${p.name}?`}
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-danger" disabled={busy} onClick={onConfirm}>
            <Icon name="skull" />
            Xác nhận loại
          </button>
        </>
      }
    >
      <p className="dialog__body">
        {cause === 'vote'
          ? `${p.name} bị loại theo kết quả bỏ phiếu.`
          : `Quản trò đánh dấu ${p.name} là đã bị loại.`}{' '}
        {extra}
      </p>
    </Dialog>
  )
}

/** Màn hình chung: chỉ dữ liệu công khai. */
function SharedPanel({
  pub,
  gameId,
  onPrivate,
}: {
  pub: PublicState
  gameId: string
  onPrivate: () => void
}) {
  if (pub.phase === 'night')
    return (
      <div className="eyes-closed">
        <span className="gold-text">
          <Icon name="moon" size={34} />
        </span>
        <h2>Mọi người nhắm mắt</h2>
        <p className="muted">Quản trò đang gọi vai. Thông tin đêm được giấu trên màn hình chung.</p>
        <button className="btn btn-ink btn-lg" onClick={onPrivate}>
          <Icon name="lock" />
          Về màn hình riêng để gọi vai
        </button>
      </div>
    )
  return (
    <div className="panel-card">
      {pub.dayStep === 'discuss' ? (
        <Timer gameId={gameId} day={pub.day} readOnly />
      ) : (
        <>
          <h2>
            {pub.dayStep === 'vote'
              ? 'Bỏ phiếu'
              : pub.dayStep === 'after'
                ? `Ngày ${pub.day} đã xong`
                : 'Trời sáng'}
          </h2>
          {pub.announcements.length > 0 ? (
            <ul className="deaths">
              {pub.announcements.map((d) => (
                <li key={d.id}>
                  <Icon name="skull" size={15} />
                  <span className="deaths__name">
                    <strong>{d.name}</strong> đã bị loại
                  </span>
                  {d.role && <span className="muted deaths__role">{d.role.name}</span>}
                </li>
              ))}
            </ul>
          ) : (
            pub.dayStep === 'announce' && <p className="big-line">Đêm qua không ai bị loại.</p>
          )}
        </>
      )}
      <button className="btn btn-secondary" onClick={onPrivate}>
        <Icon name="lock" />
        Về màn hình riêng
      </button>
    </div>
  )
}
