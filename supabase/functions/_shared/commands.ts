/*
 * Hợp đồng giữa máy quản trò và Edge Function `game-command`.
 * Dùng chung cho cả client (src/services) và server.
 */
import type { Command } from './engine/index.ts'

export type RoomCommand = { type: 'game.ensure' } | { type: 'game.replay' }

export type GameCommand = Command | { type: 'undo' }

export type CommandRequest =
  | { scope: 'room'; roomId: string; commandId: string; command: RoomCommand }
  | {
      scope: 'game'
      gameId: string
      commandId: string
      expectedRevision: number
      command: GameCommand
    }

export interface CommandResponse {
  gameId: string
  revision: number
  duplicate: boolean
  /** Nhãn thao tác vừa hoàn tác (lệnh undo). */
  undone?: string
}

export interface CommandErrorBody {
  error: { code: string; message: string }
}

/** Nhãn hoàn tác: chung chung, không chứa tên mục tiêu hay vai (an toàn khi hiện trên màn hình chung). */
export const COMMAND_LABELS: Partial<Record<GameCommand['type'], string>> = {
  'night.act': 'Xác nhận lượt gọi',
  'night.sleep': 'Kết thúc lượt Tiên tri',
  'night.end': 'Trời sáng',
  'night.start': 'Sang đêm mới',
  'day.goto': 'Đổi bước ban ngày',
  'vote.tally': 'Xem kết quả phiếu',
  'vote.clear': 'Sửa phiếu',
  'vote.revote': 'Bỏ phiếu lại',
  'vote.eliminate': 'Loại theo phiếu',
  'vote.skip': 'Không loại ai',
  'effect.resolve': 'Xử lý hiệu ứng',
  'player.kill': 'Loại thủ công',
  'player.revive': 'Hồi sinh',
  'player.setChief': 'Đổi Trưởng làng',
  reset: 'Reset ván',
}

const KNOWN = new Set<string>([
  'deck.set',
  'options.set',
  'deal',
  'send',
  'start',
  'night.act',
  'night.sleep',
  'night.end',
  'day.goto',
  'vote.tally',
  'vote.clear',
  'vote.revote',
  'vote.eliminate',
  'vote.skip',
  'effect.resolve',
  'night.start',
  'player.kill',
  'player.revive',
  'player.setChief',
  'reset',
  'finish',
  'undo',
])

const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 200
const isStrOrNull = (x: unknown) => x === null || x === undefined || isStr(x)
const isNumMap = (x: unknown) =>
  !!x &&
  typeof x === 'object' &&
  !Array.isArray(x) &&
  Object.entries(x).length <= 200 &&
  Object.entries(x).every(([k, v]) => isStr(k) && Number.isInteger(v))

/** Kiểm tra hình dạng lệnh trước khi đưa vào engine (engine kiểm tra nghiệp vụ). */
export function parseGameCommand(x: unknown): GameCommand | null {
  if (!x || typeof x !== 'object') return null
  const c = x as Record<string, unknown>
  if (!isStr(c.type) || !KNOWN.has(c.type)) return null
  switch (c.type) {
    case 'deck.set':
      return isNumMap(c.counts) ? (c as GameCommand) : null
    case 'options.set':
      return !!c.options &&
        typeof c.options === 'object' &&
        Object.values(c.options).every((v) => typeof v === 'boolean')
        ? (c as GameCommand)
        : null
    case 'night.act':
      return Number.isInteger(c.stepIndex) &&
        isStr(c.step) &&
        (c.targets === undefined ||
          (Array.isArray(c.targets) && c.targets.length <= 4 && c.targets.every(isStr))) &&
        isStrOrNull(c.poison) &&
        (c.heal === undefined || typeof c.heal === 'boolean') &&
        (c.note === undefined || (typeof c.note === 'string' && c.note.length <= 500))
        ? (c as GameCommand)
        : null
    case 'night.sleep':
      return Number.isInteger(c.stepIndex) && isStr(c.step) ? (c as GameCommand) : null
    case 'day.goto':
      return ['announce', 'discuss', 'vote'].includes(c.step as string) ? (c as GameCommand) : null
    case 'vote.tally':
      return isNumMap(c.votes) && isStrOrNull(c.chiefVote) ? (c as GameCommand) : null
    case 'vote.eliminate':
      return isStr(c.target) &&
        (c.reason === undefined || (typeof c.reason === 'string' && c.reason.length <= 200))
        ? (c as GameCommand)
        : null
    case 'effect.resolve':
      return Number.isInteger(c.effectId) && isStrOrNull(c.target) ? (c as GameCommand) : null
    case 'player.kill':
    case 'player.revive':
      return isStr(c.playerId) ? (c as GameCommand) : null
    case 'player.setChief':
      return isStrOrNull(c.playerId) ? (c as GameCommand) : null
    case 'finish':
      return c.team === undefined || ['village', 'wolf', 'none'].includes(c.team as string)
        ? (c as GameCommand)
        : null
    default:
      return c as GameCommand
  }
}
