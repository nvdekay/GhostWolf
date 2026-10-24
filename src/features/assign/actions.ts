import { getState, setState, toast } from '@/app/store'
import type { AssignEntry, Deal } from '@/types/game'
import { startGame } from '@/features/board/actions'
import { buildDeck } from '@/features/roles/roles'
import { prefersReducedMotion } from '@/lib/media'
import { pickRandom, shuffle } from '@/lib/random'

let shuffleTimer: ReturnType<typeof setInterval> | undefined
let viewSim: ReturnType<typeof setInterval> | undefined

export function shuffleRoles() {
  const { counts, room } = getState()
  if (!room) return
  const deck = shuffle(buildDeck(counts))
  const order: AssignEntry[] = room.players.map((p, i) => ({
    pid: p.id,
    name: p.name,
    roleId: deck[i],
    device: p.device,
    viewed: false,
  }))

  clearInterval(shuffleTimer)
  if (prefersReducedMotion()) {
    setState({ assign: { order, deck, stage: 'done', tick: 0 } })
    return
  }
  setState({ assign: { order, deck, stage: 'shuffling', tick: 0 } })
  shuffleTimer = setInterval(() => {
    const a = getState().assign
    if (!a) return clearInterval(shuffleTimer)
    if (a.tick >= 14) {
      clearInterval(shuffleTimer)
      setState({ assign: { ...a, stage: 'done' } })
    } else {
      setState({ assign: { ...a, tick: a.tick + 1 } })
    }
  }, 85)
}

export function sendRoles() {
  const a = getState().assign
  if (!a) return
  setState({ assign: { ...a, stage: 'sent' } })
  toast('Đã gửi vai đến từng máy')

  // Chưa có backend: mô phỏng người chơi có điện thoại lần lượt mở vai.
  clearInterval(viewSim)
  viewSim = setInterval(() => {
    const x = getState().assign
    if (!x) return clearInterval(viewSim)
    const left = x.order.filter((o) => o.device && !o.viewed)
    if (!left.length) return clearInterval(viewSim)
    const pick = pickRandom(left)
    setState({
      assign: {
        ...x,
        order: x.order.map((o) => (o.pid === pick.pid ? { ...o, viewed: true } : o)),
      },
    })
  }, 650)
}

/** Người không có điện thoại xem vai trên máy quản trò. */
export function viewLocally(entry: AssignEntry) {
  if (!entry.roleId) return
  setState({
    screen: 'deal',
    deal: {
      order: [{ pid: entry.pid, name: entry.name, roleId: entry.roleId }],
      i: 0,
      stage: 'handoff',
      flipped: false,
      local: true,
    },
  })
}

export function startFromAssign() {
  const s = getState()
  const a = s.assign
  if (!a) return
  clearInterval(viewSim)
  startGame(
    s.gameName || 'Ván mới',
    a.order.map((o) => ({
      id: o.pid,
      name: o.name,
      roleId: o.roleId ?? 'villager',
      alive: true,
      lover: false,
      chief: false,
    })),
    s.counts,
  )
}

/* — Chuyền máy xem vai — */

function patchDeal(patch: Partial<Deal>) {
  setState((s) => (s.deal ? { deal: { ...s.deal, ...patch } } : null))
}

export function revealRole() {
  const reduce = prefersReducedMotion()
  patchDeal({ stage: 'reveal', flipped: reduce })
  if (!reduce) setTimeout(() => patchDeal({ flipped: true }), 80)
}

export function hideRole() {
  const d = getState().deal
  if (!d) return
  const next = d.i + 1
  patchDeal({ i: next, stage: next < d.order.length ? 'handoff' : 'done', flipped: false })
}

export function finishDeal() {
  const s = getState()
  const d = s.deal
  if (!d) return
  if (d.local && s.assign) {
    const ids = d.order.map((o) => o.pid)
    setState({
      screen: 'assign',
      deal: null,
      assign: {
        ...s.assign,
        order: s.assign.order.map((o) => (ids.includes(o.pid) ? { ...o, viewed: true } : o)),
      },
    })
    toast('Đã xem vai trên máy quản trò')
    return
  }
  startGame(
    s.gameName || 'Ván mới',
    d.order.map((o) => ({
      id: o.pid,
      name: o.name,
      roleId: o.roleId,
      alive: true,
      lover: false,
      chief: false,
    })),
    s.counts,
  )
}
