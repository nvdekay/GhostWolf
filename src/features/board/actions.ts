import { curtain, getState, setState, toast, type AppState } from '@/app/store'
import type { Game, GamePlayer, KillCause, WinnerTeam } from '@/types/game'
import { findRole, isWolfTeam } from '@/features/roles/roles'
import { addLog, checkWin, killPlayer, nightDeaths, playerById, type StepDef } from './logic'

const FRESH_TIMER = { left: 180, total: 180, running: false }

function currentGame(): Game {
  const g = getState().game
  if (!g) throw new Error('Chưa có ván')
  return g
}

/** Thao tác có thể hoàn tác: chép ván, áp fn, lưu lịch sử (tối đa 40 bước). */
export function act(label: string, fn: (g: Game) => void, extra: Partial<AppState> = {}) {
  setState((s) => {
    if (!s.game) return null
    const g = structuredClone(s.game)
    fn(g)
    return {
      game: g,
      savedGame: g,
      hist: [...s.hist, { g: s.game, label }].slice(-40),
      picks: [],
      wHeal: false,
      wPoison: false,
      ...extra,
    }
  })
}

/** Cập nhật ván không ghi lịch sử (phiếu bầu, tab ban ngày…). */
export function updateGame(fn: (g: Game) => void) {
  setState((s) => {
    if (!s.game) return null
    const g = structuredClone(s.game)
    fn(g)
    return { game: g, savedGame: g }
  })
}

export function undo() {
  const { hist } = getState()
  const last = hist.at(-1)
  if (!last) return
  setState({
    game: last.g,
    savedGame: last.g,
    hist: hist.slice(0, -1),
    picks: [],
    wHeal: false,
    wPoison: false,
    winnerSeen: false,
    dialog: null,
  })
  toast('Đã hoàn tác: ' + last.label)
}

export function resumeGame(g: Game) {
  setState({
    game: g,
    hist: [],
    screen: 'board',
    players: g.players.map((p) => ({ id: p.id, name: p.name })),
    counts: { ...g.counts },
    gameName: g.name,
    shared: false,
    picks: [],
    winnerSeen: false,
    sheet: null,
    dialog: null,
  })
}

export function startGame(name: string, players: GamePlayer[], counts: Game['counts']) {
  const g: Game = {
    name,
    players,
    day: 1,
    phase: 'night',
    step: 0,
    night: {},
    witch: { heal: true, poison: true },
    lastProtect: null,
    dayStep: 'announce',
    votes: {},
    voteRes: null,
    voteOnly: null,
    lastDeaths: [],
    pendingHunter: null,
    winner: null,
    counts: { ...counts },
    log: [{ tag: 'Đêm 1', text: `Ván bắt đầu với ${players.length} người chơi.`, pub: true }],
  }
  setState({
    game: g,
    hist: [],
    screen: 'board',
    deal: null,
    shared: false,
    picks: [],
    winnerSeen: false,
    savedGame: g,
  })
  curtain('Màn đêm buông xuống', 'Đêm 1', 'moon')
}

/** Xác nhận lượt gọi vai hiện tại với những người quản trò đã chọn. */
export function confirmStep(key: string, def: StepDef, roleDead: boolean) {
  const s = getState()
  const picks = s.picks
  const names = (g: Game, ids: string[]) => ids.map((id) => playerById(g, id).name).join(' và ')

  if (roleDead) {
    act(def.title, (g) => {
      addLog(g, `${findRole(def.role).name} đã bị loại, gọi cho có.`, false)
      g.step++
    })
    return
  }
  if (key === 'seer') {
    act('Tiên tri soi', (g) => {
      const p = playerById(g, picks[0]!)
      g.night.seer = p.id
      g.night.seerDone = true
      addLog(
        g,
        `Tiên tri soi ${p.name}: ${isWolfTeam(p.roleId) ? 'Ma sói' : 'không phải Ma sói'}.`,
        false,
      )
    })
    return
  }
  act(def.title, (g) => {
    if (key === 'cupid') {
      picks.forEach((id) => (playerById(g, id).lover = true))
      addLog(g, `Cupid ghép đôi ${names(g, picks)}.`, false)
    } else if (key === 'guard') {
      g.night.protect = picks[0] ?? null
      addLog(g, picks[0] ? `Bảo vệ che chở ${names(g, picks)}.` : 'Bảo vệ không chọn ai.', false)
    } else if (key === 'wolf') {
      g.night.wolf = picks[0] ?? null
      addLog(g, picks[0] ? `Ma sói chọn ${names(g, picks)}.` : 'Ma sói không chọn ai.', false)
    } else if (key === 'witch') {
      const parts: string[] = []
      if (s.wHeal && g.night.wolf) {
        g.night.heal = true
        g.witch.heal = false
        parts.push('dùng bình cứu cho ' + playerById(g, g.night.wolf).name)
      }
      if (s.wPoison && picks[0]) {
        g.night.poison = picks[0]
        g.witch.poison = false
        parts.push('đầu độc ' + names(g, picks))
      }
      addLog(
        g,
        parts.length ? 'Phù thủy ' + parts.join(', ') + '.' : 'Phù thủy không dùng bình.',
        false,
      )
    } else {
      addLog(g, `${def.title.replace('Gọi ', '')}: quản trò xử lý.`, false)
    }
    g.step++
  })
}

export function finishSeer() {
  act('Xong Tiên tri', (g) => {
    g.step++
  })
}

export function endNight() {
  const day = currentGame().day
  act(
    'Kết thúc đêm',
    (g) => {
      const dead = nightDeaths(g)
      g.lastProtect = g.night.protect ?? null
      g.phase = 'day'
      g.dayStep = 'announce'
      g.votes = {}
      g.voteRes = null
      g.voteOnly = null
      g.lastDeaths = []
      if (!dead.length) addLog(g, 'Đêm qua không ai bị loại.', true)
      dead.forEach((id) => killPlayer(g, id, 'night'))
      checkWin(g)
    },
    { timer: FRESH_TIMER },
  )
  curtain('Trời sáng', 'Ngày ' + day, 'sun')
}

export function startNight() {
  const d = currentGame().day + 1
  act(
    'Sang đêm ' + d,
    (g) => {
      g.day = d
      g.phase = 'night'
      g.step = 0
      g.night = {}
      g.voteOnly = null
      g.voteRes = null
      g.votes = {}
      addLog(g, 'Màn đêm buông xuống.', true)
    },
    { timer: FRESH_TIMER },
  )
  curtain('Màn đêm buông xuống', 'Đêm ' + d, 'moon')
}

export function confirmKill(id: string, cause: KillCause) {
  const p = playerById(currentGame(), id)
  act(
    (cause === 'vote' ? 'Loại ' : 'Quản trò loại ') + p.name,
    (g) => {
      if (cause === 'vote') g.lastDeaths = []
      killPlayer(g, id, cause)
      if (cause === 'vote') {
        g.dayStep = 'after'
        g.voteRes = null
        g.voteOnly = null
      }
      checkWin(g)
    },
    { dialog: null },
  )
}

export function hunterShoot(targetId: string) {
  const target = playerById(currentGame(), targetId)
  act('Thợ săn bắn ' + target.name, (g) => {
    g.pendingHunter = null
    killPlayer(g, targetId, 'hunter')
    checkWin(g)
  })
}

export function hunterSkip() {
  const g0 = currentGame()
  const hunter = g0.pendingHunter ? playerById(g0, g0.pendingHunter) : null
  act('Thợ săn không bắn', (g) => {
    g.pendingHunter = null
    addLog(g, `Thợ săn ${hunter?.name ?? ''} không bắn ai.`, true)
    checkWin(g)
  })
}

export function revivePlayer(id: string) {
  const p = playerById(currentGame(), id)
  act(
    'Hồi sinh ' + p.name,
    (g) => {
      playerById(g, id).alive = true
      g.winner = null
      addLog(g, `${p.name} được quản trò hồi sinh (sửa nhầm).`, false)
    },
    { sheet: null },
  )
}

export function toggleChiefOf(id: string) {
  const p = playerById(currentGame(), id)
  act(
    p.chief ? 'Bỏ chức Trưởng làng' : 'Bầu Trưởng làng',
    (g) => {
      g.players.forEach((x) => (x.chief = x.id === id ? !p.chief : false))
      if (!p.chief) addLog(g, `${p.name} được bầu làm Trưởng làng.`, true)
    },
    { sheet: null },
  )
}

export function resetToNightOne() {
  act(
    'Reset ván',
    (g) => {
      g.players.forEach((p) => {
        p.alive = true
        p.lover = false
        p.chief = false
      })
      Object.assign(g, {
        day: 1,
        phase: 'night',
        step: 0,
        night: {},
        witch: { heal: true, poison: true },
        lastProtect: null,
        dayStep: 'announce',
        votes: {},
        voteRes: null,
        voteOnly: null,
        lastDeaths: [],
        pendingHunter: null,
        winner: null,
        log: [{ tag: 'Đêm 1', text: 'Ván được reset về Đêm 1.', pub: true }],
      } satisfies Partial<Game>)
    },
    { dialog: null, winnerSeen: false },
  )
  curtain('Màn đêm buông xuống', 'Đêm 1', 'moon')
}

export function endGameAs(team: WinnerTeam, title: string) {
  act(
    'Kết thúc ván',
    (g) => {
      g.winner = team === 'none' ? null : { team, title, reason: 'Quản trò công bố kết thúc ván.' }
    },
    { dialog: null, screen: 'result', winnerSeen: true },
  )
}

/* — Bỏ phiếu — */

export function addVote(id: string, delta = 1) {
  updateGame((g) => {
    g.votes[id] = Math.max(0, (g.votes[id] ?? 0) + delta)
  })
}

export function showVoteResult(rows: { id: string; v: number }[]) {
  const max = Math.max(0, ...rows.map((r) => r.v))
  if (!max) {
    toast('Chưa nhập phiếu nào')
    return
  }
  const top = rows.filter((r) => r.v === max).map((r) => r.id)
  updateGame((g) => {
    g.voteRes = { top, max }
  })
}

export function revote() {
  act('Bỏ phiếu lại', (g) => {
    const top = g.voteRes?.top ?? []
    g.voteOnly = top
    g.votes = {}
    g.voteRes = null
    addLog(
      g,
      `Hòa phiếu, bỏ phiếu lại giữa ${top.map((id) => playerById(g, id).name).join(', ')}.`,
      true,
    )
  })
}

export function noElimination() {
  act('Không loại ai', (g) => {
    g.dayStep = 'after'
    g.voteRes = null
    addLog(g, 'Hòa phiếu, hôm nay không ai bị loại.', true)
  })
}

/* — Đồng hồ thảo luận — */

export function tickTimer() {
  const t = getState().timer
  if (!t.running) return
  if (t.left <= 1) {
    setState({ timer: { ...t, left: 0, running: false } })
    toast('Hết giờ thảo luận')
  } else {
    setState({ timer: { ...t, left: t.left - 1 } })
  }
}
