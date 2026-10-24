import { setState, useAppState } from '@/app/store'
import type { Game } from '@/types/game'
import { findRole, isWolfTeam } from '@/features/roles/roles'
import {
  addVote,
  confirmStep,
  endNight,
  finishSeer,
  showVoteResult,
  startNight,
  updateGame,
} from './actions'
import { nightDeaths, nightSteps, playerById, stepDef } from './logic'

export interface PrimaryAction {
  label: string
  onClick: () => void
  disabled: boolean
  hint: string
}

/** Mọi giá trị dẫn xuất của bàn quản trò từ trạng thái ván. */
export function useBoard(g: Game) {
  const s = useAppState()
  const night = g.phase === 'night'
  const steps = nightSteps(g)
  const key = night && g.step < steps.length ? steps[g.step]! : null
  const def = key ? stepDef(key) : null
  const roleDead = !!def && !g.players.some((p) => p.roleId === def.role && p.alive)

  let pickN = 0
  let pickMode = false
  if (night && !s.shared && def && !roleDead) {
    if (key === 'witch') {
      pickMode = s.wPoison
      pickN = 1
    } else if (!(key === 'seer' && g.night.seerDone)) {
      pickN = def.pick
      pickMode = pickN > 0
    }
  }

  const voteMode = !night && g.dayStep === 'vote' && !g.voteRes
  const eligible = (id: string) => !g.voteOnly || g.voteOnly.includes(id)
  const alive = g.players.filter((p) => p.alive)
  const pickNames = s.picks.map((id) => playerById(g, id).name)

  const togglePick = (id: string) =>
    setState((x) => {
      let p = x.picks.includes(id) ? x.picks.filter((y) => y !== id) : [...x.picks, id]
      if (pickN === 1) p = x.picks.includes(id) ? [] : [id]
      if (p.length > pickN) p = p.slice(-pickN)
      return { picks: p }
    })

  const seats = g.players.map((p, i) => {
    const r = findRole(p.roleId)
    let disabled = false
    if (pickMode) {
      if (!p.alive) disabled = true
      if (key === 'wolf' && isWolfTeam(p.roleId)) disabled = true
      if (key === 'guard' && g.lastProtect === p.id) disabled = true
    }
    const marks: string[] = []
    if (!s.shared && night) {
      if (g.night.protect === p.id) marks.push('Được bảo vệ')
      if (g.night.wolf === p.id) marks.push('Bị sói chọn')
      if (g.night.heal && g.night.wolf === p.id) marks.push('Được cứu')
      if (g.night.poison === p.id) marks.push('Trúng độc')
      if (g.night.seer === p.id) marks.push('Đã soi')
    }
    if (pickMode && key === 'guard' && g.lastProtect === p.id) marks.push('Đêm trước đã bảo vệ')
    const picked = s.picks.includes(p.id)
    const votes = g.votes[p.id] ?? 0
    return {
      ...p,
      seat: i + 1,
      angle: -Math.PI / 2 + (i * 2 * Math.PI) / g.players.length,
      roleName: s.shared ? 'Vai ẩn' : r.name,
      roleIcon: s.shared ? ('lock' as const) : r.icon,
      team: s.shared ? ('hidden' as const) : 'team' in r ? r.team : ('status' as const),
      marks: marks.join(' · '),
      picked,
      dimmed: !p.alive || disabled,
      votes: !night ? votes : 0,
      ariaLabel: `${p.name}${p.alive ? '' : ', đã bị loại'}${picked ? ', đang chọn' : ''}`,
      onTap: () => {
        if (pickMode) {
          if (!disabled) togglePick(p.id)
          return
        }
        if (voteMode && p.alive && eligible(p.id)) {
          addVote(p.id)
          return
        }
        setState({ sheet: { type: 'player', id: p.id } })
      },
    }
  })

  const voteRows = g.players
    .filter((p) => p.alive && eligible(p.id))
    .map((p) => ({ id: p.id, name: p.name, v: g.votes[p.id] ?? 0 }))
  const voteTotal = voteRows.reduce((a, r) => a + r.v, 0)
  const top = g.voteRes ? g.voteRes.top.map((id) => playerById(g, id)) : []
  const elim = (id: string) => setState({ dialog: { type: 'kill', id, cause: 'vote' } })

  // Hành động chính của bước hiện tại (nút cuối panel / thanh đáy điện thoại).
  let primary: PrimaryAction | null = null
  if (night && s.shared) {
    primary = {
      label: 'Về màn hình riêng để gọi vai',
      onClick: () => setState({ shared: false }),
      disabled: false,
      hint: 'Thông tin đêm đang được giấu.',
    }
  } else if (night && def && key) {
    if (roleDead) {
      primary = {
        label: 'Tiếp tục',
        onClick: () => confirmStep(key, def, true),
        disabled: false,
        hint: 'Vai này đã bị loại.',
      }
    } else if (key === 'seer' && g.night.seerDone) {
      primary = {
        label: 'Tiên tri đi ngủ · tiếp tục',
        onClick: finishSeer,
        disabled: false,
        hint: '',
      }
    } else {
      let valid = true
      let hint = ''
      if (key === 'cupid') {
        valid = s.picks.length === 2
        hint = `Đã chọn ${s.picks.length}/2`
      } else if (key === 'wolf') {
        valid = s.picks.length === 1
        hint = valid ? 'Mục tiêu: ' + pickNames[0] : 'Chạm một người để chọn'
      } else if (key === 'guard') {
        hint = pickNames[0] ? 'Bảo vệ: ' + pickNames[0] : 'Có thể để trống'
      } else if (key === 'seer') {
        valid = s.picks.length === 1
        hint = valid ? 'Soi: ' + pickNames[0] : 'Chạm một người để soi'
      } else if (key === 'witch') {
        valid = !s.wPoison || s.picks.length === 1
        hint = s.wPoison && !pickNames[0] ? 'Chạm một người để đầu độc' : ''
      }
      const roleName = def.title.replace('Gọi ', '')
      primary = {
        label:
          key === 'seer'
            ? 'Xem kết quả soi'
            : key === 'guard' && !pickNames[0]
              ? 'Không bảo vệ ai · tiếp tục'
              : 'Xác nhận · ' + roleName,
        onClick: () => confirmStep(key, def, false),
        disabled: !valid,
        hint,
      }
    }
  } else if (night) {
    primary = { label: 'Trời sáng · công bố', onClick: endNight, disabled: false, hint: '' }
  } else if (g.dayStep === 'announce') {
    primary = {
      label: 'Bắt đầu thảo luận',
      onClick: () =>
        updateGame((x) => {
          x.dayStep = 'discuss'
        }),
      disabled: false,
      hint: '',
    }
  } else if (g.dayStep === 'discuss') {
    primary = {
      label: 'Chuyển sang bỏ phiếu',
      onClick: () => {
        setState((x) => ({ timer: { ...x.timer, running: false } }))
        updateGame((x) => {
          x.dayStep = 'vote'
        })
      },
      disabled: false,
      hint: '',
    }
  } else if (g.dayStep === 'vote' && !g.voteRes) {
    primary = {
      label: 'Xem kết quả',
      onClick: () => showVoteResult(voteRows),
      disabled: voteTotal === 0,
      hint: voteTotal ? `${voteTotal} phiếu` : 'Chưa có phiếu',
    }
  } else if (g.dayStep === 'vote' && top.length === 1) {
    primary = {
      label: 'Loại ' + top[0]!.name,
      onClick: () => elim(top[0]!.id),
      disabled: false,
      hint: `${g.voteRes!.max} phiếu`,
    }
  } else if (g.dayStep === 'after') {
    primary = {
      label: `Đi ngủ · bắt đầu Đêm ${g.day + 1}`,
      onClick: startNight,
      disabled: false,
      hint: '',
    }
  }

  const phaseLabel = (night ? 'Đêm ' : 'Ngày ') + g.day
  const phaseSub = night
    ? s.shared
      ? 'Mọi người nhắm mắt'
      : def
        ? `${def.title.replace('Gọi ', '')} · bước ${g.step + 1}/${steps.length}`
        : 'Đã gọi xong'
    : { announce: 'Công bố', discuss: 'Thảo luận', vote: 'Bỏ phiếu', after: 'Kết thúc ngày' }[
        g.dayStep
      ]

  return {
    s,
    night,
    steps,
    key,
    def,
    roleDead,
    pickMode,
    pickNames,
    seats,
    alive,
    aliveLabel: `${alive.length}/${g.players.length} còn sống`,
    phaseLabel,
    phaseSub,
    nightPriv: night && !s.shared && !!def,
    nightShared: night && s.shared,
    nightDone: night && !def && !s.shared,
    predicted: night && !def ? nightDeaths(g).map((id) => playerById(g, id).name) : [],
    voteRows,
    voteTotal,
    top,
    elim,
    primary,
  }
}

export type BoardModel = ReturnType<typeof useBoard>
