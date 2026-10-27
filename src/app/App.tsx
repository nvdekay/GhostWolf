import { createContext, useContext, useEffect, useReducer, type Dispatch } from 'react'
import { Turnstile } from '@/components/Turnstile'
import { Crescent } from '@/components/ui'
import { supabaseConfigured } from '@/lib/supabase'
import { HomeScreen } from '@/features/home/HomeScreen'
import { HostRoom } from '@/features/host/HostRoom'
import { JoinScreen } from '@/features/join/JoinScreen'
import { PlayerRoom } from '@/features/join/PlayerRoom'
import { LibraryScreen } from '@/features/roles/LibraryScreen'
import { ChooseScreen } from '@/features/setup/ChooseScreen'
import { ConfigScreen } from '@/features/setup/ConfigScreen'
import { FeedbackProvider } from './feedback'
import { initialRoute, navReducer, type NavAction, type Route } from './nav'
import { SessionProvider, useSession } from './session'

const NavContext = createContext<Dispatch<NavAction>>(() => {})
// eslint-disable-next-line react-refresh/only-export-components
export const useNav = () => {
  const dispatch = useContext(NavContext)
  return {
    go: (route: Route) => dispatch({ type: 'go', route }),
    home: () => dispatch({ type: 'home' }),
  }
}

function Splash({ title, sub, action }: { title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="home">
      <main className="home__card" aria-live="polite">
        <div className="home__moon">
          <Crescent size={50} />
        </div>
        <h1 className="home__title">Ghostwolf</h1>
        <p className="home__lead">
          <strong>{title}</strong>
          <br />
          {sub}
        </p>
        {action}
      </main>
    </div>
  )
}

function Screens() {
  const { userId, error, captchaSiteKey, captchaAttempt, verifyCaptcha, captchaError, retry } =
    useSession()
  const [route, dispatch] = useReducer(navReducer, undefined, initialRoute)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])

  if (!userId && captchaSiteKey)
    return (
      <Splash
        title="Xác minh kết nối"
        sub={error ?? 'Hoàn tất kiểm tra bảo mật để bắt đầu phiên chơi.'}
        action={
          <div className="captcha-panel">
            <Turnstile
              key={captchaAttempt}
              siteKey={captchaSiteKey}
              onVerify={verifyCaptcha}
              onError={captchaError}
            />
            {error && (
              <button className="btn btn-ghost" onClick={retry}>
                Thử lại
              </button>
            )}
          </div>
        }
      />
    )
  if (error)
    return (
      <Splash
        title="Mất kết nối"
        sub={error}
        action={
          <button className="btn btn-ink btn-lg" onClick={retry}>
            Thử lại
          </button>
        }
      />
    )
  if (!userId) return <Splash title="Đang kết nối…" sub="Đang chuẩn bị phiên chơi ẩn danh." />

  let screen: React.ReactNode
  switch (route.name) {
    case 'home':
      screen = <HomeScreen />
      break
    case 'choose':
      screen = <ChooseScreen />
      break
    case 'gmConfig':
      screen = <ConfigScreen />
      break
    case 'join':
      screen = <JoinScreen initialCode={route.code} />
      break
    case 'lib':
      screen = <LibraryScreen />
      break
    case 'host':
      screen = <HostRoom key={route.roomId} roomId={route.roomId} />
      break
    case 'player':
      screen = <PlayerRoom key={route.roomId} roomId={route.roomId} />
      break
  }
  return <NavContext.Provider value={dispatch}>{screen}</NavContext.Provider>
}

export default function App() {
  if (!supabaseConfigured) {
    return (
      <div className="app">
        <Splash
          title="Chưa cấu hình máy chủ"
          sub="Đặt VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trong .env.local (xem README) rồi chạy lại."
        />
      </div>
    )
  }
  return (
    <div className="app" id="app-root">
      <SessionProvider>
        <FeedbackProvider>
          <Screens />
        </FeedbackProvider>
      </SessionProvider>
    </div>
  )
}
