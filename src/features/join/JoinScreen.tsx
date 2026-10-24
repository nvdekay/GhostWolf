import { setState, useAppState } from '@/app/store'
import { Icon } from '@/components/Icon'
import { Crescent, FlipCard, Ornament, Paper } from '@/components/ui'
import { prefersReducedMotion } from '@/lib/media'
import { viewOf } from '@/features/roles/roles'
import {
  DEMO_CODE,
  fillDemoCode,
  leaveRoom,
  markRoleSeen,
  setCode,
  submitCode,
  submitName,
} from './actions'
import './join.css'

const ROOM_NAME = 'Phòng của Quân'
const OTHERS = ['Quân', 'Minh', 'Lan', 'Huy', 'Thảo', 'Vy', 'Đức', 'Ngọc']

export function JoinScreen() {
  const { join: j, myRole, pFlip, pHold } = useAppState()
  const role = myRole ? viewOf(myRole) : null
  const me = j.name.trim()

  return (
    <Paper size="narrow" label="Người chơi">
      {j.stage === 'code' && (
        <main className="join">
          <div className="join__bar">
            <button
              className="btn btn-secondary btn-icon"
              onClick={leaveRoom}
              aria-label="Về trang chủ"
            >
              <Icon name="left" />
            </button>
            <span className="eyebrow eyebrow--muted">Người chơi</span>
          </div>
          <div className="join__hero">
            <h1>Nhập mã phòng</h1>
            <Ornament />
            <p className="muted">Mã gồm 6 ký tự, quản trò đọc hoặc gửi cho bạn.</p>
          </div>
          <div className="code-entry">
            <div aria-hidden="true" className="code-entry__cells" data-error={!!j.err}>
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} data-active={!j.err && i === Math.min(j.code.length, 5)}>
                  {j.code[i] ?? ''}
                </span>
              ))}
            </div>
            <input
              className="code-entry__input"
              aria-label="Mã phòng"
              aria-invalid={!!j.err}
              aria-describedby="codeerr"
              value={j.code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitCode()}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={6}
              inputMode="text"
            />
          </div>
          {j.err && (
            <p id="codeerr" role="alert" className="join__err">
              <Icon name="alert" size={15} />
              {j.err}
            </p>
          )}
          <button className="join__demo" onClick={fillDemoCode}>
            Dùng mã demo {DEMO_CODE}
          </button>
          <div className="join__bottom">
            <button
              className="btn btn-ink btn-xl btn-block"
              onClick={submitCode}
              disabled={j.code.length === 0}
            >
              Tìm phòng
              <Icon name="right" />
            </button>
          </div>
        </main>
      )}

      {j.stage === 'name' && (
        <main className="join">
          <div className="join__bar">
            <button
              className="btn btn-secondary btn-icon"
              onClick={() => setState((s) => ({ join: { ...s.join, stage: 'code' } }))}
              aria-label="Đổi mã"
            >
              <Icon name="left" />
            </button>
            <span className="success-text inline-icon join__found">
              <Icon name="check" size={15} />
              Đã tìm thấy {ROOM_NAME}
            </span>
          </div>
          <div className="join__hero">
            <h1>Tên của bạn</h1>
            <p className="muted">Tên này hiện trên bàn của quản trò.</p>
          </div>
          <input
            className="input join__name"
            aria-label="Tên của bạn"
            value={j.name}
            onChange={(e) => setState((s) => ({ join: { ...s.join, name: e.target.value } }))}
            onKeyDown={(e) => e.key === 'Enter' && submitName()}
            placeholder="Ví dụ: Hà"
            autoComplete="nickname"
          />
          <div className="join__bottom">
            <button className="btn btn-ink btn-xl btn-block" onClick={submitName} disabled={!me}>
              Vào phòng
            </button>
          </div>
        </main>
      )}

      {j.stage === 'wait' && (
        <main className="join">
          <div className="join__bar join__bar--split">
            <span className="muted join__meta">
              {ROOM_NAME} · {DEMO_CODE}
            </span>
            <button className="btn btn-ghost btn-ghost--muted" onClick={leaveRoom}>
              Rời phòng
            </button>
          </div>
          <div className="join__waiting">
            <div className="moon-ring">
              <Crescent size={60} />
            </div>
            <h1 aria-live="polite">{j.locked ? 'Phòng đã chốt' : 'Đã vào phòng'}</h1>
            <p className="muted pretty">
              {j.locked
                ? 'Quản trò đang chọn bộ vai. Vai sẽ hiện ra ngay trên máy bạn.'
                : 'Chờ quản trò chốt phòng. Giữ màn hình này mở.'}
            </p>
          </div>
          <section className="join__room">
            <h2>Trong phòng</h2>
            <ul className="pills">
              <li className="pill pill--me">{me} · Bạn</li>
              {OTHERS.map((name, i) => (
                <li key={name} className="pill">
                  {name}
                  {i === 0 && <span className="muted pill__host">· Quản trò</span>}
                </li>
              ))}
            </ul>
          </section>
        </main>
      )}

      {j.stage === 'role' && (
        <main className="join">
          <div className="join__role-head">
            <div className="eyebrow">Quản trò đã gửi vai</div>
            <p className="muted">Che màn hình khỏi người bên cạnh rồi lật thẻ.</p>
          </div>
          <FlipCard
            role={role}
            flipped={pFlip}
            animate={!prefersReducedMotion()}
            backAction={
              !pFlip && (
                <button
                  className="btn btn-ink join__flip"
                  onClick={() => setState({ pFlip: true })}
                >
                  <Icon name="eye" />
                  Chạm để lật thẻ
                </button>
              )
            }
          />
          {pFlip && (
            <button className="btn btn-ink btn-xl btn-block" onClick={markRoleSeen}>
              <Icon name="eyeOff" />
              Tôi đã nhớ vai · ẩn đi
            </button>
          )}
        </main>
      )}

      {j.stage === 'game' && (
        <main className="join">
          <div className="join__bar join__bar--split">
            <span className="muted join__meta">
              {ROOM_NAME} · {me}
            </span>
            <button className="btn btn-ghost btn-ghost--muted" onClick={leaveRoom}>
              Rời phòng
            </button>
          </div>
          <div className="join__phase">
            <span className="gold-text">
              <Icon name={j.phase.startsWith('Đêm') ? 'moon' : 'sun'} size={28} />
            </span>
            <h1 aria-live="polite">{j.phase}</h1>
            <p className="muted">{j.phaseSub}</p>
          </div>
          <div className="join__alive">
            <span className="dot success-text" />
            Bạn đang còn sống
          </div>
          <button
            className="hold"
            onPointerDown={() => setState({ pHold: true })}
            onPointerUp={() => setState({ pHold: false })}
            onPointerLeave={() => setState({ pHold: false })}
            onPointerCancel={() => setState({ pHold: false })}
            aria-label="Nhấn giữ để xem vai"
          >
            {pHold && role ? (
              <span className="hold__content" data-team={role.team}>
                <span className="team-ink">
                  <Icon name={role.icon} size={44} />
                </span>
                <span className="hold__text">
                  <span className="hold__role">{role.name}</span>
                  <span className="team-ink">{role.teamLabel}</span>
                </span>
              </span>
            ) : (
              <span className="hold__content">
                <span className="gold-text">
                  <Icon name="lock" />
                </span>
                <span className="hold__text">
                  <span className="hold__title">Nhấn giữ để xem vai</span>
                  <span className="muted hold__sub">Thả tay là vai ẩn ngay</span>
                </span>
              </span>
            )}
          </button>
          <p className="muted pretty join__rules">
            Làm theo hiệu lệnh của quản trò. Ban đêm nhắm mắt, chỉ mở khi được gọi. Bỏ phiếu bằng
            tay vào ban ngày.
          </p>
        </main>
      )}
    </Paper>
  )
}
