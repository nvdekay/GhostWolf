import { setState, useAppState } from '@/app/store'
import { Icon } from '@/components/Icon'
import { BottomBar, EmptyState, Paper, Stepper, TopBar } from '@/components/ui'
import { DEMO_NAMES } from '@/features/board/demo'
import {
  MIN_PLAYERS,
  addManualPlayer,
  copyCode,
  kickPlayer,
  lockRoom,
  shareInvite,
  unlockRoom,
} from './actions'
import { useSetupStepper } from './useSetupStepper'
import './setup.css'

export function LobbyScreen() {
  const { room, manualName } = useAppState()
  const stepper = useSetupStepper()
  if (!room) return null

  const n = room.players.length
  const open = !room.locked
  const canLock = n >= MIN_PLAYERS

  return (
    <Paper label="Phòng chờ">
      <TopBar
        onBack={() => setState({ dialog: 'leaveRoom' })}
        backLabel="Đóng phòng"
        title={room.name}
      >
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
          <div aria-label={`Mã phòng ${room.code}`} className="code-grid">
            {room.code.split('').map((c, i) => (
              <span key={i} aria-hidden="true" className="code-grid__cell">
                {c}
              </span>
            ))}
          </div>
          <div className="lobby__code-actions">
            <button className="btn btn-secondary" onClick={() => copyCode(room.code)}>
              <Icon name="check" />
              Sao chép mã
            </button>
            <button className="btn btn-secondary" onClick={() => shareInvite(room.code)}>
              <Icon name="link" />
              Chia sẻ link mời
            </button>
          </div>
          <ol className="lobby__steps">
            <li>
              <span>1</span>Người chơi mở Trăng Sói, chọn “Người chơi”.
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
              <p>Đọc mã phòng cho mọi người. Tên sẽ hiện ở đây khi họ vào.</p>
            </EmptyState>
          ) : (
            <ol className="lobby__list">
              {room.players.map((p, i) => (
                <li key={p.id} className="card lobby__player">
                  <span className="lobby__seat tabular">{i + 1}</span>
                  <span className="lobby__who">
                    <span className="lobby__name">{p.name}</span>
                    <span className="lobby__device">
                      <Icon name={p.device ? 'check' : 'user'} size={15} />
                      {p.device
                        ? 'Đã vào bằng điện thoại'
                        : 'Không có điện thoại · xem vai trên máy quản trò'}
                    </span>
                  </span>
                  {open && (
                    <button
                      className="btn btn-ghost btn-ghost--muted btn-icon"
                      onClick={() => kickPlayer(p.id, p.name)}
                      aria-label={`Mời ${p.name} rời phòng`}
                    >
                      <Icon name="x" />
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
          {open && n < DEMO_NAMES.length && (
            <p className="lobby__note inline-icon">
              <Icon name="vote" size={15} />
              Mô phỏng: người chơi đang lần lượt vào phòng…
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
                  onChange={(e) => setState({ manualName: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && addManualPlayer()}
                  placeholder="Tên người chơi"
                />
                <button
                  className="btn btn-secondary"
                  onClick={addManualPlayer}
                  disabled={!manualName.trim()}
                >
                  <Icon name="plus" />
                  Thêm
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {open ? (
        <BottomBar>
          <div className="bottom-bar__hint">
            {canLock
              ? `Chốt phòng để chọn bộ vai cho ${n} người. Sau khi chốt, không ai vào thêm được.`
              : `Cần ít nhất ${MIN_PLAYERS} người · còn thiếu ${MIN_PLAYERS - n}`}
          </div>
          <button className="btn btn-ink btn-lg lobby__lock" onClick={lockRoom} disabled={!canLock}>
            <Icon name="lock" />
            Chốt phòng · {n} người
          </button>
        </BottomBar>
      ) : (
        <BottomBar>
          <button className="btn btn-secondary btn-lg" onClick={unlockRoom}>
            Mở lại phòng
          </button>
          <button
            className="btn btn-ink btn-lg bar-push"
            onClick={() => setState({ screen: 'roles' })}
          >
            Tiếp tục: bộ vai
            <Icon name="right" />
          </button>
        </BottomBar>
      )}
    </Paper>
  )
}
