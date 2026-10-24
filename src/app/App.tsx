import { useEffect, type ReactNode } from 'react'
import { AssignScreen } from '@/features/assign/AssignScreen'
import { DealScreen } from '@/features/assign/DealScreen'
import { tickTimer } from '@/features/board/actions'
import { BoardScreen } from '@/features/board/BoardScreen'
import { HomeScreen } from '@/features/home/HomeScreen'
import { JoinScreen } from '@/features/join/JoinScreen'
import { ResultScreen } from '@/features/result/ResultScreen'
import { LibraryScreen } from '@/features/roles/LibraryScreen'
import { RolesScreen } from '@/features/roles/RolesScreen'
import { ChooseScreen } from '@/features/setup/ChooseScreen'
import { ConfigScreen } from '@/features/setup/ConfigScreen'
import { LobbyScreen } from '@/features/setup/LobbyScreen'
import { Overlays } from './Overlays'
import { useAppState, type Screen } from './store'

const SCREENS: Record<Screen, () => ReactNode> = {
  home: HomeScreen,
  choose: ChooseScreen,
  gmConfig: ConfigScreen,
  lobby: LobbyScreen,
  roles: RolesScreen,
  assign: AssignScreen,
  deal: DealScreen,
  join: JoinScreen,
  board: BoardScreen,
  result: ResultScreen,
  lib: LibraryScreen,
}

export default function App() {
  const { screen, game } = useAppState()
  const Current = SCREENS[screen]

  // Đồng hồ thảo luận chạy nền, kể cả khi quản trò mở sheet khác.
  useEffect(() => {
    const id = setInterval(tickTimer, 1000)
    return () => clearInterval(id)
  }, [])

  // Lên đầu trang mỗi khi đổi màn hình.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])

  return (
    <div className="app" data-night={screen === 'board' && game?.phase === 'night'}>
      <Current />
      <Overlays />
    </div>
  )
}
