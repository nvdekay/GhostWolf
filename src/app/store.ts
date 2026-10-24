import { useSyncExternalStore } from 'react'
import type { IconName } from '@/components/Icon'
import type { Assign, Counts, Deal, Game, KillCause, Role, Room, Team } from '@/types/game'
import { createDemoGame } from '@/features/board/demo'

export type Screen =
  | 'home'
  | 'choose'
  | 'gmConfig'
  | 'lobby'
  | 'roles'
  | 'assign'
  | 'deal'
  | 'join'
  | 'board'
  | 'result'
  | 'lib'

export type Sheet =
  | { type: 'role'; id: string }
  | { type: 'player'; id: string }
  | { type: 'howto' }
  | { type: 'custom' }
  | { type: 'menu' }

export type Dialog =
  | 'leaveRoom'
  | 'startEarly'
  | 'reset'
  | 'exitDeal'
  | 'endGame'
  | { type: 'kill'; id: string; cause: KillCause }

export interface JoinState {
  code: string
  name: string
  err: string
  stage: 'code' | 'name' | 'wait' | 'role' | 'game'
  locked: boolean
  phase: string
  phaseSub: string
}

export interface CustomRoleDraft {
  name: string
  team: Team
  short: string
  wakes: boolean
}

export interface AppState {
  screen: Screen
  gameName: string
  players: { id: string; name: string }[]
  counts: Counts
  filter: Team | 'all'
  query: string
  chief: boolean
  customRoles: Role[]
  rolesSheet: boolean
  sheet: Sheet | null
  dialog: Dialog | null
  toast: { text: string; key: number } | null
  curtain: { title: string; sub: string; icon: IconName; key: number } | null
  cfg: { name: string; chief: boolean; reveal: boolean }
  room: Room | null
  manualName: string
  autoSug: boolean
  assign: Assign | null
  hideAssigned: boolean
  deal: Deal | null
  game: Game | null
  hist: { g: Game; label: string }[]
  savedGame: Game | null
  shared: boolean
  logOpen: boolean
  picks: string[]
  wHeal: boolean
  wPoison: boolean
  winnerSeen: boolean
  timer: { left: number; total: number; running: boolean }
  cr: CustomRoleDraft
  join: JoinState
  myRole: string | null
  pFlip: boolean
  pHold: boolean
}

export const DEFAULT_GAME_NAME = 'Ván tối thứ Sáu'

export const freshJoin = (): JoinState => ({
  code: '',
  name: '',
  err: '',
  stage: 'code',
  locked: false,
  phase: 'Đêm 1',
  phaseSub: 'Mọi người nhắm mắt',
})

const initialState: AppState = {
  screen: 'home',
  gameName: DEFAULT_GAME_NAME,
  players: [],
  counts: {},
  filter: 'all',
  query: '',
  chief: true,
  customRoles: [],
  rolesSheet: false,
  sheet: null,
  dialog: null,
  toast: null,
  curtain: null,
  cfg: { name: DEFAULT_GAME_NAME, chief: true, reveal: false },
  room: null,
  manualName: '',
  autoSug: false,
  assign: null,
  hideAssigned: false,
  deal: null,
  game: null,
  hist: [],
  // Ván demo để trang chủ có mục "Tiếp tục ván", giống prototype.
  savedGame: createDemoGame(),
  shared: false,
  logOpen: false,
  picks: [],
  wHeal: false,
  wPoison: false,
  winnerSeen: false,
  timer: { left: 180, total: 180, running: false },
  cr: { name: '', team: 'village', short: '', wakes: false },
  join: freshJoin(),
  myRole: null,
  pFlip: false,
  pHold: false,
}

let state = initialState
const listeners = new Set<() => void>()

export function getState(): AppState {
  return state
}

type Patch = Partial<AppState> | null | undefined

export function setState(patch: Patch | ((s: AppState) => Patch)) {
  const p = typeof patch === 'function' ? patch(state) : patch
  if (!p) return
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState)
}

/** Chuyển màn hình và đóng mọi lớp phủ. */
export function go(screen: Screen) {
  setState({ screen, sheet: null, dialog: null, rolesSheet: false })
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function toast(text: string) {
  clearTimeout(toastTimer)
  setState({ toast: { text, key: Date.now() } })
  toastTimer = setTimeout(() => setState({ toast: null }), 2600)
}

let curtainTimer: ReturnType<typeof setTimeout> | undefined
export function curtain(title: string, sub: string, icon: IconName) {
  clearTimeout(curtainTimer)
  setState({ curtain: { title, sub, icon, key: Date.now() } })
  curtainTimer = setTimeout(() => setState({ curtain: null }), 1700)
}
