import {
  Suspense,
  createContext,
  lazy,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
} from 'react'
import { Crescent } from '@/components/ui'
import { supabaseConfigured } from '@/lib/supabase'
import { HomeScreen } from '@/features/home/HomeScreen'
import { FeedbackProvider } from './feedback'
import { initialRoute, navReducer, type NavAction, type Route } from './nav'
import { SessionProvider, useSession } from './session'

const ChooseScreen = lazy(() =>
  import('@/features/setup/ChooseScreen').then((module) => ({ default: module.ChooseScreen })),
)
const ConfigScreen = lazy(() =>
  import('@/features/setup/ConfigScreen').then((module) => ({ default: module.ConfigScreen })),
)
const JoinScreen = lazy(() =>
  import('@/features/join/JoinScreen').then((module) => ({ default: module.JoinScreen })),
)
const LibraryScreen = lazy(() =>
  import('@/features/roles/LibraryScreen').then((module) => ({ default: module.LibraryScreen })),
)
const HostRoom = lazy(() =>
  import('@/features/host/HostRoom').then((module) => ({ default: module.HostRoom })),
)
const PlayerRoom = lazy(() =>
  import('@/features/join/PlayerRoom').then((module) => ({ default: module.PlayerRoom })),
)

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
  const { userId, error, retry } = useSession()
  const [route, dispatch] = useReducer(navReducer, undefined, initialRoute)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])

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
  return (
    <NavContext.Provider value={dispatch}>
      <Suspense fallback={<Splash title="Đang mở…" sub="Đang tải màn hình cần thiết." />}>
        {screen}
      </Suspense>
    </NavContext.Provider>
  )
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
