/* Giá trị dẫn xuất cho bàn quản trò — dùng hàm của engine để UI và server kiểm tra giống nhau. */
import {
  availableTargets,
  currentStep,
  predictedDeaths,
  seerResult,
  stepActors,
  stepInfo,
  targetProblem,
  witchCanHeal,
  type GameState,
  type Player,
} from '@engine'
import type { GameCommand } from '@shared/commands.ts'

export interface NightUi {
  picks: string[]
  heal: boolean
  poisonMode: boolean
  note: string
}

export interface Primary {
  label: string
  command: GameCommand
  disabled: boolean
  hint: string
}

export function nightModel(s: GameState, ui: NightUi) {
  const key = currentStep(s)
  const night = s.night
  if (s.phase !== 'night' || !night) return null
  const names = (ids: string[]) =>
    ids.map((id) => s.players.find((p) => p.id === id)?.name ?? '').join(', ')

  if (!key) {
    return {
      key: null,
      info: null,
      actorsAlive: true,
      pickMode: false,
      pickMax: 0,
      disabledReason: () => null as string | null,
      seer: null,
      predicted: predictedDeaths(s),
      primary: {
        label: 'Trời sáng · công bố',
        command: { type: 'night.end' },
        disabled: false,
        hint: '',
      } as Primary,
    }
  }

  const info = stepInfo(s, key)
  const actorsAlive = stepActors(s, key).length > 0
  const seerDone = key === 'seer' && !!night.actions.seer
  const mode = key === 'witch' ? 'poison' : 'main'
  const pickMode = actorsAlive && !seerDone && (key === 'witch' ? ui.poisonMode : info.pick[1] > 0)
  const pickMax = key === 'witch' ? 1 : info.pick[1]
  const available = pickMode ? availableTargets(s, key, mode).length : 0
  const pickMin = Math.min(info.pick[0], available)
  const disabledReason = (p: Player) => (pickMode ? targetProblem(s, key, p, mode) : null)
  const base = { stepIndex: night.step, step: key }

  let primary: Primary
  if (!actorsAlive) {
    primary = {
      label: 'Tiếp tục',
      command: { type: 'night.act', ...base },
      disabled: false,
      hint: 'Vai này đã bị loại.',
    }
  } else if (seerDone) {
    primary = {
      label: 'Tiên tri đi ngủ · tiếp tục',
      command: { type: 'night.sleep', ...base },
      disabled: false,
      hint: '',
    }
  } else if (key === 'witch') {
    const poison = ui.poisonMode ? (ui.picks[0] ?? null) : null
    primary = {
      label: 'Xác nhận · Phù thủy',
      command: { type: 'night.act', ...base, heal: ui.heal, poison },
      disabled: ui.poisonMode && !poison,
      hint: ui.poisonMode && !poison ? 'Chạm một người để đầu độc' : '',
    }
  } else if (info.pick[1] === 0) {
    primary = {
      label: 'Xác nhận · ' + info.title.replace('Gọi ', ''),
      command: { type: 'night.act', ...base, note: ui.note },
      disabled: false,
      hint: 'Quản trò xử lý thủ công',
    }
  } else {
    const n = ui.picks.length
    const valid = n >= pickMin && n <= info.pick[1]
    const roleName = info.title.replace('Gọi ', '')
    primary = {
      label:
        key === 'seer'
          ? 'Xem kết quả soi'
          : n === 0 && pickMin === 0
            ? `Không chọn ai · tiếp tục`
            : 'Xác nhận · ' + roleName,
      command: { type: 'night.act', ...base, targets: ui.picks },
      disabled: !valid,
      hint: n ? names(ui.picks) : available === 0 ? 'Không còn ai hợp lệ để chọn' : info.hint,
    }
  }

  return {
    key,
    info,
    actorsAlive,
    pickMode,
    pickMax,
    disabledReason,
    seer: seerDone ? seerResult(s) : null,
    canHeal: witchCanHeal(s),
    predicted: [] as string[],
    primary,
  }
}

export type NightModel = NonNullable<ReturnType<typeof nightModel>>

/** Nhãn đánh dấu trên ghế ban đêm (chỉ máy quản trò, màn hình riêng). */
export function nightMarks(s: GameState, p: Player): string {
  const a = s.night?.actions
  const marks: string[] = []
  if (p.charmed) marks.push('Bị mê hoặc')
  if (!a) return marks.join(' · ')
  if (a.guard === p.id) marks.push('Được bảo vệ')
  if (a.wolf === p.id) marks.push('Bị sói chọn')
  if (a.witchHeal && a.wolf === p.id) marks.push('Được cứu')
  if (a.whitewolf === p.id) marks.push('Sói trắng chọn')
  if (a.witchPoison === p.id) marks.push('Trúng độc')
  if (a.seer === p.id) marks.push('Đã soi')
  if (a.gmKills?.includes(p.id)) marks.push('Quản trò loại')
  return marks.join(' · ')
}
