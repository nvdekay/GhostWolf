import { DEFAULT_GAME_NAME, setState, useAppState } from '@/app/store'
import { Icon } from '@/components/Icon'
import { Crescent, Ornament } from '@/components/ui'
import { resumeGame } from '@/features/board/actions'
import { openJoin } from '@/features/join/actions'
import './home.css'

export function HomeScreen() {
  const { savedGame: sg } = useAppState()

  const newGame = () =>
    setState({
      screen: 'choose',
      players: [],
      counts: {},
      gameName: DEFAULT_GAME_NAME,
      room: null,
      assign: null,
    })

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
        <div className="home__kicker">Ma Sói · 4–20 người</div>
        <h1 className="home__title">Trăng Sói</h1>
        <p className="home__lead">
          Mỗi người một chiếc điện thoại thay cho bộ thẻ. Quản trò tạo phòng và chia vai, vai bí mật
          hiện trên máy từng người.
        </p>
        <Ornament width={320} center />
        <div className="home__actions">
          <button className="btn btn-ink btn-block btn-xl home__primary" onClick={newGame}>
            Tạo ván mới
          </button>
          <button className="btn btn-secondary btn-block home__secondary" onClick={openJoin}>
            <Icon name="users" />
            Vào phòng bằng mã
          </button>
          {sg ? (
            <button className="home__resume" onClick={() => resumeGame(sg)}>
              <span className="gold-text">
                <Icon name="play" />
              </span>
              <span className="home__resume-text">
                <span className="home__resume-title">Tiếp tục ván</span>
                <span className="home__resume-meta">
                  {sg.name} · {sg.phase === 'night' ? 'Đêm' : 'Ngày'} {sg.day} ·{' '}
                  {sg.players.filter((p) => p.alive).length}/{sg.players.length} còn sống
                </span>
              </span>
              <Icon name="right" />
            </button>
          ) : (
            <p className="home__none">Chưa có ván nào đang lưu.</p>
          )}
        </div>
        <div className="home__links">
          <button
            className="link-btn"
            onClick={() => setState({ screen: 'lib', filter: 'all', query: '' })}
          >
            Thư viện vai
          </button>
          <span aria-hidden="true" className="gold-text">
            ·
          </span>
          <button className="link-btn" onClick={() => setState({ sheet: { type: 'howto' } })}>
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
    </div>
  )
}
