import { getState, setState, toast } from '@/app/store'
import { DEMO_NAMES } from '@/features/board/demo'
import { PRESETS, presetSizeFor } from '@/features/roles/catalog'
import { totalCards } from '@/features/roles/roles'
import { genRoomCode, nextId } from '@/lib/random'

/** Số người tối thiểu để chốt phòng. */
export const MIN_PLAYERS = 4

let joinSim: ReturnType<typeof setInterval> | undefined

export function createRoom() {
  const { cfg } = getState()
  const name = cfg.name.trim() || 'Ván mới'
  setState({
    room: { code: genRoomCode(), name, locked: false, players: [] },
    gameName: name,
    chief: cfg.chief,
    counts: {},
    screen: 'lobby',
  })

  // Chưa có backend: mô phỏng người chơi lần lượt vào phòng bằng điện thoại.
  clearInterval(joinSim)
  let i = 0
  joinSim = setInterval(() => {
    const r = getState().room
    if (!r || r.locked || i >= DEMO_NAMES.length) {
      clearInterval(joinSim)
      return
    }
    const name = DEMO_NAMES[i++]!
    if (r.players.some((p) => p.name === name)) return
    setState({ room: { ...r, players: [...r.players, { id: nextId(), name, device: true }] } })
  }, 850)
}

export function lockRoom() {
  clearInterval(joinSim)
  const r = getState().room
  if (!r) return
  const n = r.players.length
  const size = presetSizeFor(n)
  const counts = { ...(size ? PRESETS[size] : {}) }
  const total = totalCards(counts)
  if (total < n) counts.villager = (counts.villager ?? 0) + (n - total)
  setState({
    room: { ...r, locked: true },
    players: r.players.map((p) => ({ id: p.id, name: p.name })),
    counts,
    screen: 'roles',
    autoSug: true,
    assign: null,
  })
  toast(`Đã chốt phòng · gợi ý bộ vai cho ${n} người`)
}

export function unlockRoom() {
  setState((s) => (s.room ? { room: { ...s.room, locked: false }, assign: null } : null))
  toast('Đã mở lại phòng')
}

export function kickPlayer(id: string, name: string) {
  setState((s) =>
    s.room ? { room: { ...s.room, players: s.room.players.filter((q) => q.id !== id) } } : null,
  )
  toast('Đã mời ' + name + ' rời phòng')
}

export function addManualPlayer() {
  const name = getState().manualName.trim()
  if (!name) return
  setState((s) =>
    s.room
      ? {
          manualName: '',
          room: { ...s.room, players: [...s.room.players, { id: nextId(), name, device: false }] },
        }
      : null,
  )
}

export function closeRoom() {
  clearInterval(joinSim)
  setState({ dialog: null, room: null, screen: 'home' })
}

export function copyCode(code: string) {
  navigator.clipboard?.writeText(code).catch(() => {})
  toast('Đã sao chép mã ' + code)
}

export function shareInvite(code: string) {
  const invite = `Vào ${location.origin}, chọn “Người chơi” và nhập mã ${code}`
  navigator.clipboard?.writeText(invite).catch(() => {})
  toast('Đã sao chép lời mời vào phòng ' + code)
}
