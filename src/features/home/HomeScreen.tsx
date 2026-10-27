import { useEffect, useState } from 'react'
import { useNav } from '@/app/App'
import { useSession } from '@/app/session'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/overlay'
import { Crescent, Ornament, WolfEmblem } from '@/components/ui'
import { mySessions, recoverRoomHost, type SessionSummary } from '@/services/rooms'
import { toAppError } from '@/services/errors'
import { HowToSheet } from './HowToSheet'
import './home.css'

export function HomeScreen() {
  const nav = useNav()
  const { userId } = useSession()
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [howto, setHowto] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [recoveryError, setRecoveryError] = useState('')
  const [recoveryBusy, setRecoveryBusy] = useState(false)

  const recover = async () => {
    if (recoveryCode.length !== 6 || !recoveryKey.trim()) return
    setRecoveryBusy(true)
    setRecoveryError('')
    try {
      const result = await recoverRoomHost(recoveryCode, recoveryKey)
      nav.go({ name: 'host', roomId: result.roomId })
      setRecovering(false)
    } catch (error) {
      setRecoveryError(toAppError(error).message)
    } finally {
      setRecoveryBusy(false)
    }
  }

  useEffect(() => {
    let alive = true
    mySessions(userId!)
      .then((s) => alive && setSessions(s))
      .catch(() => alive && (setLoadError(true), setSessions([])))
    return () => {
      alive = false
    }
  }, [userId])

  return (
    <div className="home">
      <main className="home__card" data-screen-label="Trang chủ">
        <div aria-hidden="true" className="home__stamp">
          <div className="home__stamp-inner">
            <Crescent size={24} className="crescent--pale" />
          </div>
        </div>
        <div aria-hidden="true" className="home__birds">
          <span />
          <span />
          <span />
        </div>
        <div className="home__brand">
          <div className="home__moon">
            <WolfEmblem size={68} />
          </div>
          <h1 className="home__title">Ghost Wolf</h1>
          <p className="home__lead">
            Khi trăng lên, có kẻ trong làng không còn là người. Ai cũng giữ một bí mật — và không
            phải ai cũng sống đến sáng.
          </p>
          <Ornament width={320} center />
        </div>
        <div className="home__panel">
          <div className="home__actions">
            <button
              className="btn btn-ink btn-block btn-xl home__primary"
              onClick={() => nav.go({ name: 'choose' })}
            >
              Tạo ván mới
            </button>
            <button
              className="btn btn-secondary btn-block home__secondary"
              onClick={() => nav.go({ name: 'join' })}
            >
              <Icon name="users" />
              Vào phòng bằng mã
            </button>
            {sessions?.map((s) => (
              <button
                key={s.room.id}
                className="home__resume"
                onClick={() =>
                  nav.go(
                    s.asHost
                      ? { name: 'host', roomId: s.room.id }
                      : { name: 'player', roomId: s.room.id },
                  )
                }
              >
                <span className="gold-text">
                  <Icon name="play" />
                </span>
                <span className="home__resume-text">
                  <span className="home__resume-title">
                    {s.asHost ? 'Tiếp tục ván' : 'Quay lại phòng'}
                  </span>
                  <span className="home__resume-meta">
                    {s.meta} · {s.asHost ? 'Quản trò' : 'Người chơi'}
                  </span>
                </span>
                <Icon name="right" />
              </button>
            ))}
            {loadError && (
              <p className="home__none">Không tải được danh sách ván. Kiểm tra mạng.</p>
            )}
          </div>
          <div className="home__links">
            <button className="link-btn" onClick={() => nav.go({ name: 'lib' })}>
              Thư viện vai
            </button>
            <span aria-hidden="true" className="gold-text">
              ·
            </span>
            <button className="link-btn" onClick={() => setHowto(true)}>
              Cách chơi
            </button>
            <span aria-hidden="true" className="gold-text">
              ·
            </span>
            <button className="link-btn" onClick={() => setRecovering(true)}>
              Khôi phục quản trò
            </button>
          </div>
          <div className="home__footer">
            <span className="gold-text">
              <Icon name="moon" size={15} />
            </span>
            <span className="heading-font">Đêm buông xuống, cả làng đi ngủ.</span>
            <span aria-hidden="true" className="home__rule" />
          </div>
        </div>
      </main>
      {howto && (
        <Sheet onClose={() => setHowto(false)} label="Cách chơi">
          <HowToSheet />
        </Sheet>
      )}
      {recovering && (
        <Sheet onClose={() => setRecovering(false)} label="Khôi phục quyền quản trò">
          <div className="recovery-form">
            <div>
              <div className="eyebrow">Thiết bị mới</div>
              <h2 className="sheet__title">Khôi phục quyền quản trò</h2>
              <p className="muted">
                Nhập mã phòng và mã khôi phục đã lưu khi tạo phòng. Thiết bị cũ sẽ mất quyền điều
                khiển.
              </p>
            </div>
            <label className="field">
              <span>Mã phòng</span>
              <input
                className="input"
                aria-label="Mã phòng khôi phục"
                value={recoveryCode}
                maxLength={6}
                autoCapitalize="characters"
                spellCheck={false}
                onChange={(event) => {
                  setRecoveryCode(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 6),
                  )
                  setRecoveryError('')
                }}
              />
            </label>
            <label className="field">
              <span>Mã khôi phục quản trò</span>
              <input
                className="input recovery-key"
                aria-label="Mã khôi phục quản trò"
                value={recoveryKey}
                maxLength={27}
                autoCapitalize="characters"
                spellCheck={false}
                onChange={(event) => {
                  setRecoveryKey(event.target.value.toUpperCase())
                  setRecoveryError('')
                }}
                onKeyDown={(event) => event.key === 'Enter' && void recover()}
              />
            </label>
            {recoveryError && (
              <p className="join__err" role="alert">
                <Icon name="alert" size={15} />
                {recoveryError}
              </p>
            )}
            <button
              className="btn btn-ink btn-lg btn-block"
              disabled={recoveryCode.length !== 6 || !recoveryKey.trim() || recoveryBusy}
              onClick={() => void recover()}
            >
              {recoveryBusy ? 'Đang khôi phục…' : 'Khôi phục quyền quản trò'}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
