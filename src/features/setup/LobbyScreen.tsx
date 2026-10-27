import { useRef, useState } from 'react'
import { MIN_PLAYERS } from '@engine'
import { useNav } from '@/app/App'
import { useFeedback } from '@/app/feedback'
import { Icon } from '@/components/Icon'
import { Dialog } from '@/components/overlay'
import { BottomBar, EmptyState, Paper, Stepper, TopBar } from '@/components/ui'
import { copyText, inviteUrl } from '@/lib/clipboard'
import { refreshRoom } from '@/realtime/roomStore'
import { sendRoomCommand } from '@/services/game'
import {
  addMember,
  closeRoom,
  hostRecoveryKey,
  kickMember,
  lockRoom,
  unlockRoom,
} from '@/services/rooms'
import { useHost, useStepper } from '@/features/host/context'
import { RemoteChat } from '@/features/remote/RemoteChat'
import './setup.css'

export function LobbyScreen() {
  const nav = useNav()
  const fb = useFeedback()
  const { room, game, snap, setView } = useHost()
  const stepper = useStepper()
  const [manualName, setManualName] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [shareFallback, setShareFallback] = useState<string | null>(null)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)

  const members = snap.members.filter((m) => m.status === 'active')
  const n = members.length
  const open = room.status === 'open'
  const canLock = n >= MIN_PLAYERS
  const remote = room.options.mode === 'remote'
  const waitingReady = members.filter((member) => member.device && !member.ready)
  const rolesSent = !!game && !['setup', 'dealt', 'ended'].includes(game.status)

  const guard = async (fn: () => Promise<unknown>) => {
    // State chỉ cập nhật sau khi React render; ref chặn đồng bộ Enter lặp/double tap.
    if (inFlight.current) return false
    inFlight.current = true
    setBusy(true)
    try {
      await fn()
      await refreshRoom(room.id)
      return true
    } catch (e) {
      fb.error(e)
      return false
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const copy = async () => {
    if (await copyText(room.code)) fb.toast('Đã sao chép mã ' + room.code)
    else {
      setShareFallback(room.code)
      fb.error(new Error('Trình duyệt không cho sao chép. Chọn mã bên dưới để tự sao chép.'))
    }
  }

  const share = async () => {
    const url = inviteUrl(room.code)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Ghostwolf',
          text: `Vào phòng “${room.name}” (mã ${room.code})`,
          url,
        })
        return
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return
      }
    }
    if (await copyText(url)) fb.toast('Đã sao chép link mời')
    else {
      setShareFallback(url)
      fb.error(new Error('Trình duyệt không cho sao chép. Chọn link bên dưới để tự sao chép.'))
    }
  }

  const showRecovery = async () => {
    try {
      setRecoveryKey(await hostRecoveryKey(room.id))
    } catch (error) {
      fb.error(error)
    }
  }

  const add = () =>
    manualName.trim() &&
    guard(async () => {
      await addMember(room.id, manualName)
      setManualName('')
    })

  const lock = () =>
    guard(async () => {
      await lockRoom(room.id)
      await sendRoomCommand(room.id, { type: 'game.ensure' })
      fb.toast(`Đã chốt phòng · ${n} người`)
    })

  return (
    <Paper label="Phòng chờ">
      <TopBar onBack={() => setConfirmClose(true)} backLabel="Đóng phòng" title={room.name}>
        <button className="btn btn-ghost btn-ghost--muted" onClick={nav.home}>
          Về trang chủ
        </button>
        <Stepper steps={stepper} label="Tiến trình" />
      </TopBar>
      <div className="lobby">
        <section aria-label="Mã phòng" className="framed lobby__code">
          <div className="lobby__code-head">
            <div className="eyebrow">Mã phòng</div>
            {open ? (
              <span className="lobby__state lobby__state--open">
                <span className="dot" />
                Đang mở
              </span>
            ) : (
              <span className="lobby__state gold-text">
                <Icon name="lock" size={15} />
                Đã chốt
              </span>
            )}
          </div>
          <div
            aria-label={`Mã phòng ${room.code.split('').join(' ')}`}
            role="img"
            className="code-grid"
          >
            {room.code.split('').map((c, i) => (
              <span key={i} aria-hidden="true" className="code-grid__cell">
                {c}
              </span>
            ))}
          </div>
          <div className="lobby__code-actions">
            <button className="btn btn-secondary" onClick={copy}>
              <Icon name="check" />
              Sao chép mã
            </button>
            <button className="btn btn-secondary" onClick={share}>
              <Icon name="link" />
              Chia sẻ link mời
            </button>
            <button className="btn btn-secondary" onClick={() => void showRecovery()}>
              <Icon name="lock" />
              Mã khôi phục
            </button>
          </div>
          {shareFallback && <p className="lobby__share-text">{shareFallback}</p>}
          <ol className="lobby__steps">
            <li>
              <span>1</span>Người chơi mở Ghostwolf, chọn “Vào phòng bằng mã” hoặc mở link mời.
            </li>
            <li>
              <span>2</span>Nhập mã trên và tên của mình.
            </li>
            <li>
              <span>3</span>Đủ người thì bạn bấm “Chốt phòng”.
            </li>
          </ol>
        </section>

        <section aria-label="Người trong phòng" className="lobby__people">
          <div className="section-head">
            <h2>Người chơi</h2>
            <span aria-live="polite" className="gold-text tabular">
              {n} người trong phòng
            </span>
          </div>
          <p className="lobby__note">Quản trò không tính vào số người được chia vai.</p>
          {n === 0 ? (
            <EmptyState icon="users" title="Chưa ai vào phòng">
              <p>Đọc mã phòng hoặc gửi link mời. Tên sẽ hiện ở đây khi họ vào.</p>
            </EmptyState>
          ) : (
            <ol className="lobby__list">
              {members.map((p) => {
                const online = snap.online.has(p.id)
                return (
                  <li key={p.id} className="card lobby__player">
                    <span className="lobby__seat tabular">{p.seat}</span>
                    <span className="lobby__who">
                      <span className="lobby__name">{p.name}</span>
                      <span className="lobby__device">
                        {p.device ? (
                          <>
                            <span className="lobby__online" data-on={online} aria-hidden="true" />
                            {online ? 'Đang online' : 'Mất kết nối'}
                          </>
                        ) : (
                          <>
                            <Icon name="user" size={15} />
                            Không có điện thoại · xem vai trên máy quản trò
                          </>
                        )}
                      </span>
                      {remote && p.device && (
                        <span className="lobby__device">
                          {p.ready ? 'Đã sẵn sàng' : 'Chưa sẵn sàng'}
                        </span>
                      )}
                    </span>
                    {open && (
                      <button
                        className="btn btn-ghost btn-ghost--muted btn-icon"
                        disabled={busy}
                        onClick={() =>
                          guard(async () => {
                            await kickMember(p.id)
                            fb.toast('Đã mời ' + p.name + ' rời phòng')
                          })
                        }
                        aria-label={`Mời ${p.name} rời phòng`}
                      >
                        <Icon name="x" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
          {snap.members.some((m) => m.status === 'left') && (
            <p className="lobby__note">
              Đã rời phòng:{' '}
              {snap.members
                .filter((m) => m.status === 'left')
                .map((m) => m.name)
                .join(', ')}
            </p>
          )}
          {open && (
            <div className="field lobby__manual">
              <label htmlFor="mname">Thêm người không dùng điện thoại</label>
              <div className="lobby__manual-row">
                <input
                  id="mname"
                  className="input"
                  value={manualName}
                  maxLength={40}
                  disabled={busy}
                  onChange={(e) => setManualName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && add()}
                  placeholder="Tên người chơi"
                />
                <button
                  className="btn btn-secondary"
                  onClick={add}
                  disabled={!manualName.trim() || busy}
                >
                  <Icon name="plus" />
                  Thêm
                </button>
              </div>
            </div>
          )}
        </section>
        {remote && (
          <RemoteChat roomId={room.id} channel="lobby" members={members} canSend={open} isHost />
        )}
      </div>

      {open ? (
        <BottomBar>
          <div className="bottom-bar__hint">
            {canLock
              ? `Chốt phòng để chọn bộ vai cho ${n} người. Sau khi chốt, không ai vào thêm được.`
              : `Cần ít nhất ${MIN_PLAYERS} người · còn thiếu ${MIN_PLAYERS - n}`}
          </div>
          <button
            className="btn btn-ink btn-lg lobby__lock"
            onClick={lock}
            disabled={!canLock || busy || (remote && waitingReady.length > 0)}
          >
            <Icon name="lock" />
            {remote && waitingReady.length > 0
              ? `Chờ ${waitingReady.length} người sẵn sàng`
              : `Chốt phòng · ${n} người`}
          </button>
        </BottomBar>
      ) : (
        <BottomBar>
          {!rolesSent && (
            <button
              className="btn btn-secondary btn-lg"
              disabled={busy}
              onClick={() =>
                guard(async () => {
                  await unlockRoom(room.id)
                  fb.toast('Đã mở lại phòng')
                })
              }
            >
              Mở lại phòng
            </button>
          )}
          <button
            className="btn btn-ink btn-lg bar-push"
            disabled={busy}
            onClick={() =>
              guard(async () => {
                const g = game && game.status !== 'ended' ? game : null
                if (!g) await sendRoomCommand(room.id, { type: 'game.ensure' })
                setView(null)
              })
            }
          >
            {rolesSent ? 'Về ván đang chơi' : 'Tiếp tục: bộ vai'}
            <Icon name="right" />
          </button>
        </BottomBar>
      )}

      {confirmClose && (
        <Dialog
          title="Đóng phòng?"
          onClose={() => setConfirmClose(false)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmClose(false)}>
                Ở lại
              </button>
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() =>
                  guard(async () => {
                    await closeRoom(room.id)
                    nav.home()
                  })
                }
              >
                Đóng phòng
              </button>
            </>
          }
        >
          <p className="dialog__body">
            Mọi người trong phòng sẽ bị ngắt kết nối và mã phòng hết hiệu lực.
          </p>
        </Dialog>
      )}
      {recoveryKey && (
        <Dialog
          title="Mã khôi phục quản trò"
          onClose={() => setRecoveryKey(null)}
          actions={
            <>
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  if (await copyText(recoveryKey)) fb.toast('Đã sao chép mã khôi phục')
                  else fb.error(new Error('Không sao chép được. Chọn mã trong ô để tự sao chép.'))
                }}
              >
                Sao chép mã
              </button>
              <button className="btn btn-ink" onClick={() => setRecoveryKey(null)}>
                Đóng
              </button>
            </>
          }
        >
          <p className="dialog__body">
            Cất mã này riêng với link mời. Người có mã có thể chuyển quyền quản trò sang thiết bị
            khác.
          </p>
          <input
            className="input recovery-key"
            aria-label="Mã khôi phục quản trò"
            value={recoveryKey}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
        </Dialog>
      )}
    </Paper>
  )
}
