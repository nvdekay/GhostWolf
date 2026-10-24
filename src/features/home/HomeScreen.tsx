import { useEffect, useState } from 'react'
import { useNav } from '@/app/App'
import { useSession } from '@/app/session'
import { Icon } from '@/components/Icon'
import { Sheet } from '@/components/overlay'
import { Crescent, Ornament } from '@/components/ui'
import { mySessions, type SessionSummary } from '@/services/rooms'
import { HowToSheet } from './HowToSheet'
import './home.css'

export function HomeScreen() {
  const nav = useNav()
  const { userId } = useSession()
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [howto, setHowto] = useState(false)

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
        <div className="home__moon">
          <Crescent size={50} />
        </div>
        <div className="home__kicker">Ma Sói · từ 4 người chơi</div>
        <h1 className="home__title">Ghostwolf</h1>
        <p className="home__lead">
          Mỗi người một chiếc điện thoại thay cho bộ thẻ. Quản trò tạo phòng và chia vai, vai bí mật
          hiện trên máy từng người.
        </p>
        <Ornament width={320} center />
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
          {sessions === null && <p className="home__none">Đang tìm ván đang chơi…</p>}
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
          {sessions?.length === 0 && (
            <p className="home__none">
              {loadError
                ? 'Không tải được danh sách ván. Kiểm tra mạng.'
                : 'Chưa có ván nào đang lưu.'}
            </p>
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
        </div>
        <div className="home__footer">
          <span className="gold-text">
            <Icon name="moon" size={15} />
          </span>
          <span className="heading-font">Đêm buông xuống, cả làng đi ngủ.</span>
          <span aria-hidden="true" className="home__rule" />
        </div>
      </main>
      {howto && (
        <Sheet onClose={() => setHowto(false)} label="Cách chơi">
          <HowToSheet />
        </Sheet>
      )}
    </div>
  )
}
