import { setState, useAppState } from '@/app/store'
import { isWolfTeam, totalCards } from '@/features/roles/roles'

const STEP_SCREENS = ['lobby', 'roles', 'assign'] as const

/** Bộ vai hợp lệ: số thẻ bằng số người và có ít nhất một sói. */
export function useDeckReady(): boolean {
  const { players, counts } = useAppState()
  const n = players.length
  const wolves = Object.entries(counts).reduce((a, [id, c]) => a + (isWolfTeam(id) ? c : 0), 0)
  return n > 0 && totalCards(counts) === n && wolves > 0
}

/** Ba bước thiết lập của quản trò: Phòng → Bộ vai → Chia vai. */
export function useSetupStepper() {
  const { screen, room } = useAppState()
  const ready = useDeckReady()
  const locked = !!room?.locked
  const idx = Math.max(0, STEP_SCREENS.indexOf(screen as (typeof STEP_SCREENS)[number]))

  return ['Phòng', 'Bộ vai', 'Chia vai'].map((label, i) => ({
    label,
    current: i === idx,
    done: i < idx,
    onGo: () => {
      if (i === 0) setState({ screen: 'lobby' })
      if (i === 1 && locked) setState({ screen: 'roles' })
      if (i === 2 && locked && ready) setState({ screen: 'assign' })
    },
  }))
}
