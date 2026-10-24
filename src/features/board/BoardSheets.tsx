import { setState, toast, useAppState } from '@/app/store'
import { Icon } from '@/components/Icon'
import { Dialog } from '@/components/overlay'
import { RoleMedal } from '@/components/ui'
import type { KillCause } from '@/types/game'
import { viewOf } from '@/features/roles/roles'
import {
  confirmKill,
  endGameAs,
  hunterShoot,
  hunterSkip,
  resetToNightOne,
  revivePlayer,
  toggleChiefOf,
  undo,
} from './actions'
import { playerById } from './logic'
import './board.css'

export function PlayerSheet({ id }: { id: string }) {
  const { game: g, shared } = useAppState()
  if (!g) return null
  const p = playerById(g, id)
  const v = viewOf(p.roleId)
  const partner = p.lover ? g.players.find((x) => x.lover && x.id !== p.id) : null

  return (
    <>
      <div className="player-sheet__head">
        <span className="player-sheet__seat tabular">{g.players.indexOf(p) + 1}</span>
        <div className="player-sheet__who">
          <h2>{p.name}</h2>
          <span className="muted">{p.alive ? 'Còn sống' : 'Đã bị loại'}</span>
        </div>
      </div>
      {shared ? (
        <div className="player-sheet__hidden">
          <Icon name="lock" />
          Vai được giấu trên màn hình chung
        </div>
      ) : (
        <button
          className="player-sheet__role"
          data-team={v.team}
          onClick={() => setState({ sheet: { type: 'role', id: p.roleId } })}
        >
          <RoleMedal team={v.team} icon={v.icon} size={48} iconSize={26} ring={false} />
          <span className="player-sheet__role-text">
            <span className="player-sheet__role-name">{v.name}</span>
            <span className="team-ink">{v.teamLabel}</span>
          </span>
          <Icon name="right" />
        </button>
      )}
      {(p.lover || p.chief) && (
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
        </div>
      )}
      <div className="player-sheet__actions">
        {p.alive ? (
          <>
            <button className="btn btn-secondary" onClick={() => toggleChiefOf(p.id)}>
              <Icon name="crown" />
              {p.chief ? 'Bỏ chức Trưởng làng' : 'Đặt làm Trưởng làng'}
            </button>
            <button
              className="btn btn-secondary btn-danger"
              onClick={() =>
                setState({ dialog: { type: 'kill', id: p.id, cause: 'gm' }, sheet: null })
              }
            >
              <Icon name="skull" />
              Loại khỏi ván
            </button>
          </>
        ) : (
          <button className="btn btn-secondary" onClick={() => revivePlayer(p.id)}>
            <Icon name="reset" />
            Hồi sinh (sửa nhầm)
          </button>
        )}
      </div>
    </>
  )
}

export function MenuSheet() {
  const { game: g } = useAppState()
  const items = [
    {
      icon: 'list' as const,
      label: 'Mở nhật ký ván',
      onClick: () => setState({ sheet: null, logOpen: true }),
    },
    {
      icon: 'info' as const,
      label: 'Cách chơi',
      onClick: () => setState({ sheet: { type: 'howto' } }),
    },
    {
      icon: 'home' as const,
      label: 'Lưu và về trang chủ',
      onClick: () => {
        setState({ screen: 'home', sheet: null })
        toast('Đã lưu ván. Có thể tiếp tục từ trang chủ.')
      },
    },
    {
      icon: 'check' as const,
      label: 'Kết thúc ván',
      onClick: () => setState({ sheet: null, dialog: 'endGame' }),
    },
  ]

  return (
    <>
      <h2 className="sheet__title menu__title">{g?.name}</h2>
      <div className="menu">
        {items.map((it) => (
          <button key={it.label} className="menu__item" onClick={it.onClick}>
            <Icon name={it.icon} />
            {it.label}
          </button>
        ))}
        <button
          className="menu__item menu__item--danger"
          onClick={() => setState({ sheet: null, dialog: 'reset' })}
        >
          <Icon name="reset" />
          Reset ván về Đêm 1
        </button>
      </div>
    </>
  )
}

const closeDialog = () => setState({ dialog: null })

function KillDialog({ id, cause }: { id: string; cause: KillCause }) {
  const { game: g } = useAppState()
  if (!g) return null
  const p = playerById(g, id)
  const extra = [
    p.lover ? 'Người còn lại trong Cặp đôi sẽ bị loại theo.' : '',
    p.roleId === 'hunter' ? 'Thợ săn sẽ được chọn một người để bắn.' : '',
    p.roleId === 'idiot' && cause === 'vote'
      ? 'Đây là Thằng ngốc: quản trò có thể Hoàn tác để giữ người này lại.'
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Dialog
      title={`Loại ${p.name}?`}
      onClose={closeDialog}
      actions={
        <>
          <button className="btn btn-secondary" onClick={closeDialog}>
            Hủy
          </button>
          <button className="btn btn-danger" onClick={() => confirmKill(id, cause)}>
            <Icon name="skull" />
            Xác nhận loại
          </button>
        </>
      }
    >
      <p className="dialog__body">
        {cause === 'vote'
          ? `${p.name} nhận nhiều phiếu nhất và sẽ bị loại khỏi ván.`
          : `Đánh dấu ${p.name} là đã bị loại.`}{' '}
        {extra}
      </p>
    </Dialog>
  )
}

const END_OPTIONS = [
  ['village', 'Phe Dân làng chiến thắng'],
  ['wolf', 'Phe Ma sói chiến thắng'],
  ['none', 'Kết thúc không phân thắng bại'],
] as const

/** Hộp thoại của bàn quản trò: loại người, Thợ săn, người thắng, reset, kết thúc. */
export function BoardDialogs() {
  const { screen, game: g, dialog, winnerSeen } = useAppState()
  if (!g) return null
  const hunter = g.pendingHunter ? playerById(g, g.pendingHunter) : null
  const showWinner = screen === 'board' && g.winner && !g.pendingHunter && !winnerSeen

  return (
    <>
      {dialog === 'reset' && (
        <Dialog
          title="Reset ván về Đêm 1?"
          onClose={closeDialog}
          actions={
            <>
              <button className="btn btn-secondary" onClick={closeDialog}>
                Hủy
              </button>
              <button className="btn btn-danger" onClick={resetToNightOne}>
                Reset ván
              </button>
            </>
          }
        >
          <p className="dialog__body">
            Mọi người sống lại, Cặp đôi và Trưởng làng bị xóa, nhật ký bắt đầu lại. Vai đã chia được
            giữ nguyên. Bạn vẫn có thể Hoàn tác.
          </p>
        </Dialog>
      )}
      {dialog === 'endGame' && (
        <Dialog
          title="Kết thúc ván"
          onClose={closeDialog}
          actions={
            <button className="btn btn-ghost" onClick={closeDialog}>
              Hủy
            </button>
          }
        >
          <p className="dialog__body">Chọn kết quả để công bố vai của mọi người.</p>
          <div className="dialog__stack">
            {END_OPTIONS.map(([team, title]) => (
              <button
                key={team}
                className="btn btn-secondary"
                onClick={() => endGameAs(team, title)}
              >
                {title}
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {typeof dialog === 'object' && dialog?.type === 'kill' && screen === 'board' && (
        <KillDialog id={dialog.id} cause={dialog.cause} />
      )}
      {screen === 'board' && hunter && (
        <Dialog
          layer="hunter"
          title={`Thợ săn ${hunter.name} bị loại`}
          actions={
            <button className="btn btn-ghost" onClick={hunterSkip}>
              Thợ săn không bắn
            </button>
          }
        >
          <span className="gm-badge hunter__badge">Quản trò xử lý</span>
          <p className="dialog__body">Hỏi Thợ săn muốn bắn ai, rồi chọn bên dưới.</p>
          <div className="hunter__targets">
            {g.players
              .filter((p) => p.alive)
              .map((p) => (
                <button key={p.id} className="btn btn-secondary" onClick={() => hunterShoot(p.id)}>
                  {p.name}
                </button>
              ))}
          </div>
        </Dialog>
      )}
      {showWinner && (
        <Dialog
          layer="winner"
          className="dialog--center"
          title={
            <>
              <span className="gold-text winner__crown">
                <Icon name="crown" />
              </span>
              {g.winner!.title}
            </>
          }
          actions={
            <>
              <button className="btn btn-secondary" onClick={undo}>
                <Icon name="undo" />
                Hoàn tác
              </button>
              <button
                className="btn btn-ink"
                onClick={() => setState({ screen: 'result', winnerSeen: true })}
              >
                Xem kết quả
              </button>
            </>
          }
        >
          <p className="dialog__body">{g.winner!.reason}</p>
        </Dialog>
      )}
    </>
  )
}
