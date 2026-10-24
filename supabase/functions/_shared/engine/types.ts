/*
 * Kiểu dữ liệu của game engine. Engine là TypeScript thuần (không DOM, không npm),
 * chạy được ở cả Edge Function (Deno) và trình duyệt.
 */

export type Team = 'village' | 'wolf' | 'solo'

export type IconName =
  | 'house'
  | 'eye'
  | 'shield'
  | 'flask'
  | 'crosshair'
  | 'heart'
  | 'smile'
  | 'paw'
  | 'moon'
  | 'ghost'
  | 'music'
  | 'sparkles'
  | 'link'
  | 'crown'

export interface RoleDef {
  id: string
  name: string
  team: Team
  icon: IconName
  short: string
  skill: string
  wake: string
  win?: string
  note?: string
  /** Quản trò xử lý thủ công, engine không tự áp luật. */
  gm?: boolean
  custom?: boolean
  /** Vai tùy chỉnh có lượt gọi ban đêm. */
  wakes?: boolean
}

export interface StatusDef {
  id: string
  name: string
  kind: string
  icon: IconName
  short: string
  skill: string
  win: string
  wake: string
  note: string
}

export type Counts = Record<string, number>

/** Luật biến thể quản trò chọn khi tạo phòng. */
export interface RuleOptions {
  /** Trưởng làng: bầu Ngày 1, phiếu tính 2, khi chết chỉ định người kế nhiệm. */
  chief: boolean
  /** Công khai vai của người bị loại trên máy người chơi. */
  revealOnDeath: boolean
  /** Thợ săn trúng độc vẫn được bắn. */
  hunterShootsWhenPoisoned: boolean
  /** Phù thủy được dùng bình cứu cho chính mình. */
  witchSelfHeal: boolean
  /** Vẫn gọi vai đã chết để không lộ thông tin (không cho hành động). */
  callDeadRoles: boolean
}

export type DeathCause = 'wolf' | 'whitewolf' | 'poison' | 'vote' | 'hunter' | 'lover' | 'gm'

export interface Death {
  cause: DeathCause
  day: number
  phase: 'night' | 'day'
}

export interface Player {
  /** Id membership trong phòng. */
  id: string
  name: string
  seat: number
  /** Có điện thoại riêng (false: quản trò thêm thủ công). */
  device: boolean
  roleId: string
  alive: boolean
  death: Death | null
  lover: boolean
  chief: boolean
  charmed: boolean
  /** Vai đã được công khai (Thằng ngốc lật thẻ, hoặc công bố khi chết). */
  revealed: boolean
  canVote: boolean
  /** Hiệu ứng khi chết đã được kích hoạt — không kích hoạt lại. */
  triggered: { hunter?: boolean; succession?: boolean; idiot?: boolean }
}

export type Effect =
  | { id: number; kind: 'hunter'; playerId: string }
  | { id: number; kind: 'succession'; playerId: string }

export interface NightActions {
  cupid?: [string, string]
  guard?: string | null
  wolf?: string | null
  whitewolf?: string | null
  witchHeal?: boolean
  witchPoison?: string | null
  seer?: string
  piper?: string[]
  /** Quản trò loại thủ công trong đêm — công bố lúc trời sáng. */
  gmKills?: string[]
  /** Ghi chú xử lý thủ công theo id bước. */
  notes?: Record<string, string>
}

export interface NightState {
  /** Thứ tự bước, cố định khi bắt đầu đêm. */
  steps: string[]
  step: number
  actions: NightActions
}

export type DayStep = 'announce' | 'discuss' | 'vote' | 'after'

export interface VoteResult {
  /** Số phiếu đã cân trọng số theo người. */
  tally: Record<string, number>
  top: string[]
  max: number
  abstain: number
}

export interface DayState {
  step: DayStep
  /** Bầu lại chỉ giữa những người này. */
  voteOnly: string[] | null
  result: VoteResult | null
  /** Đã có người bị loại (hoặc quyết định không loại) trong ngày. */
  resolved: boolean
}

export interface LogEntry {
  tag: string
  text: string
  /** Công khai cho mọi người; false là nhật ký riêng của quản trò. */
  pub: boolean
}

export type WinnerTeam = Team | 'lovers' | 'whitewolf' | 'tanner' | 'piper' | 'none'

export interface Winner {
  team: WinnerTeam
  title: string
  reason: string
  /** Id người thắng — để highlight đúng, kể cả phe riêng. */
  winners: string[]
  manual: boolean
}

export type GameStatus = 'setup' | 'dealt' | 'sent' | 'playing' | 'ended'

export interface GameState {
  version: 1
  rulesetVersion: number
  name: string
  options: RuleOptions
  status: GameStatus
  /** Bộ vai nháp (setup) / bộ vai đã chia. */
  counts: Counts
  /** Ảnh chụp định nghĩa vai tùy chỉnh dùng trong ván. */
  customRoles: RoleDef[]
  players: Player[]
  day: number
  phase: 'setup' | 'night' | 'day'
  night: NightState | null
  dayState: DayState | null
  witch: { heal: boolean; poison: boolean }
  lastProtect: string | null
  /** Người bị loại được công bố gần nhất (sáng nay hoặc theo phiếu). */
  lastDeaths: string[]
  effects: Effect[]
  nextEffectId: number
  /** Kẻ chán đời vừa bị loại bằng phiếu — điều kiện thắng một lần. */
  tannerVoted: string | null
  winner: Winner | null
  log: LogEntry[]
}

/** Người trong phòng, đầu vào khi chia bài. */
export interface SeatInput {
  id: string
  name: string
  seat: number
  device: boolean
}
