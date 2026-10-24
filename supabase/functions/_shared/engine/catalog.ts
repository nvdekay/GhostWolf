import type { Counts, RoleDef, RuleOptions, StatusDef, Team } from './types.ts'

/** Phiên bản bộ luật. Tăng khi đổi cách engine xử lý luật. */
export const RULESET_VERSION = 1

export const DEFAULT_OPTIONS: RuleOptions = {
  chief: true,
  revealOnDeath: false,
  hunterShootsWhenPoisoned: false,
  witchSelfHeal: true,
  callDeadRoles: true,
}

/** Mô tả trong thư viện phải khớp với cách engine xử lý (xem docs/ruleset.md). */
export const ROLES: RoleDef[] = [
  {
    id: 'villager',
    name: 'Dân làng',
    team: 'village',
    icon: 'house',
    short: 'Không có kỹ năng đặc biệt. Sức mạnh nằm ở lập luận và lá phiếu.',
    skill:
      'Không thức dậy ban đêm. Ban ngày thảo luận, tìm ra Ma sói và bỏ phiếu loại người bị nghi ngờ.',
    wake: 'Không thức dậy',
    note: 'Vai dùng để điền chỗ trống khi bộ vai còn thiếu.',
  },
  {
    id: 'seer',
    name: 'Tiên tri',
    team: 'village',
    icon: 'eye',
    short: 'Mỗi đêm soi một người để biết họ có phải Ma sói.',
    skill: 'Mỗi đêm chọn một người khác. Quản trò ra hiệu người đó có thuộc bầy sói hay không.',
    wake: 'Mỗi đêm, sau Phù thủy',
    note: 'Ứng dụng chỉ báo “là Ma sói” hoặc “không phải Ma sói”, không báo tên vai. Sói trắng hiện là Ma sói.',
  },
  {
    id: 'guard',
    name: 'Bảo vệ',
    team: 'village',
    icon: 'shield',
    short: 'Mỗi đêm che chở một người khỏi Ma sói.',
    skill:
      'Mỗi đêm chọn một người, có thể là chính mình, hoặc không chọn ai. Nếu bầy sói cắn người đó, họ sống sót. Không được bảo vệ cùng một người hai đêm liền.',
    wake: 'Mỗi đêm, trước Ma sói',
    note: 'Bảo vệ không chặn bình độc hay Sói trắng. Khi Bảo vệ và Phù thủy cùng cứu một người, ứng dụng coi là sống.',
  },
  {
    id: 'witch',
    name: 'Phù thủy',
    team: 'village',
    icon: 'flask',
    short: 'Một bình cứu và một bình độc, mỗi bình dùng một lần.',
    skill:
      'Quản trò cho Phù thủy biết ai bị bầy sói cắn. Phù thủy có thể dùng bình cứu cho người đó, và có thể dùng bình độc để loại một người. Mỗi bình chỉ dùng một lần trong cả ván.',
    wake: 'Mỗi đêm, sau Ma sói',
    note: 'Mặc định Phù thủy được tự cứu mình. Quản trò đổi trong “Luật biến thể” khi tạo phòng.',
  },
  {
    id: 'hunter',
    name: 'Thợ săn',
    team: 'village',
    icon: 'crosshair',
    gm: true,
    short: 'Khi bị loại, được kéo theo một người.',
    skill:
      'Khi bị loại, Thợ săn chọn ngay một người còn sống để bắn. Người đó bị loại theo. Thợ săn có thể không bắn.',
    wake: 'Không thức dậy · kích hoạt khi bị loại',
    note: 'Mặc định Thợ săn trúng độc không được bắn. Quản trò đổi trong “Luật biến thể”.',
  },
  {
    id: 'cupid',
    name: 'Cupid',
    team: 'village',
    icon: 'heart',
    gm: true,
    short: 'Đêm đầu tiên ghép đôi hai người.',
    skill:
      'Đêm đầu tiên chọn hai người khác nhau thành Cặp đôi. Nếu một người trong Cặp đôi bị loại, người kia bị loại theo.',
    win: 'Thắng cùng phe Dân làng. Cặp đôi khác phe thắng riêng khi chỉ còn lại hai người.',
    wake: 'Chỉ đêm đầu tiên, gọi đầu tiên',
    note: 'Cặp đôi là trạng thái liên kết, không phải thẻ vai.',
  },
  {
    id: 'idiot',
    name: 'Thằng ngốc',
    team: 'village',
    icon: 'smile',
    gm: true,
    short: 'Bị dân bỏ phiếu loại thì lật thẻ, ở lại nhưng mất quyền bầu.',
    skill:
      'Lần đầu bị loại bằng phiếu bầu ban ngày, Thằng ngốc lật thẻ, vẫn còn sống nhưng không còn được bỏ phiếu. Bị loại bằng cách khác thì chết như thường.',
    wake: 'Không thức dậy',
  },
  {
    id: 'wolf',
    name: 'Ma sói',
    team: 'wolf',
    icon: 'paw',
    short: 'Mỗi đêm cùng bầy chọn một người để cắn.',
    skill:
      'Mỗi đêm bầy sói thức dậy, nhận ra nhau và thống nhất chọn một người không thuộc bầy để cắn. Ban ngày giả làm dân thường.',
    wake: 'Mỗi đêm, sau Bảo vệ',
    note: 'Nên có khoảng một Ma sói cho mỗi 3–4 người chơi.',
  },
  {
    id: 'whitewolf',
    name: 'Sói trắng',
    team: 'solo',
    icon: 'moon',
    gm: true,
    short: 'Thức cùng bầy sói nhưng muốn sống sót một mình.',
    skill:
      'Thức dậy và cắn cùng bầy sói mỗi đêm. Vào các đêm chẵn, Sói trắng có thêm một lượt riêng để chọn loại một Ma sói khác; người đó bị loại lúc trời sáng.',
    win: 'Thắng một mình khi là người duy nhất còn sống.',
    wake: 'Mỗi đêm cùng Ma sói · thêm lượt vào đêm chẵn',
    note: 'Bầy sói nhìn thấy Sói trắng như một Ma sói bình thường. Sói trắng tính vào bầy khi cắn, nhưng thuộc phe riêng khi tính thắng.',
  },
  {
    id: 'tanner',
    name: 'Kẻ chán đời',
    team: 'solo',
    icon: 'ghost',
    gm: true,
    short: 'Thắng nếu bị dân làng bỏ phiếu loại.',
    skill: 'Không có kỹ năng ban đêm. Tìm cách khiến cả làng nghi ngờ mình.',
    win: 'Thắng một mình ngay khi bị loại bằng phiếu bầu ban ngày.',
    wake: 'Không thức dậy',
  },
  {
    id: 'piper',
    name: 'Người thổi sáo',
    team: 'solo',
    icon: 'music',
    gm: true,
    short: 'Mỗi đêm mê hoặc hai người.',
    skill:
      'Mỗi đêm chọn hai người còn sống chưa bị mê hoặc. Quản trò chạm vai những người bị mê hoặc để họ biết.',
    win: 'Thắng một mình khi còn sống và mọi người còn sống khác đều bị mê hoặc.',
    wake: 'Mỗi đêm, gọi cuối cùng',
  },
]

export const STATUSES: StatusDef[] = [
  {
    id: 'lovers',
    name: 'Cặp đôi',
    kind: 'Trạng thái liên kết',
    icon: 'link',
    short: 'Hai người được Cupid ghép đôi. Một người bị loại thì người kia đi theo.',
    skill: 'Không phải thẻ vai. Quản trò đánh dấu hai người trong lượt gọi Cupid.',
    win: 'Cùng phe thì thắng cùng phe. Khác phe thì thắng riêng khi chỉ còn hai người.',
    wake: 'Mở mắt nhìn nhau ở đêm đầu tiên',
    note: 'Không cộng vào số thẻ vai.',
  },
  {
    id: 'chief',
    name: 'Trưởng làng',
    kind: 'Chức danh',
    icon: 'crown',
    short: 'Được bầu vào Ngày 1. Phiếu bầu tính gấp đôi.',
    skill:
      'Cả làng bầu một Trưởng làng vào Ngày 1. Phiếu của Trưởng làng tính 2. Khi bị loại, Trưởng làng chỉ định người kế nhiệm.',
    win: 'Giữ điều kiện thắng của vai gốc.',
    wake: 'Không thức dậy',
    note: 'Không cộng vào số thẻ vai. Có thể tắt khi tạo phòng hoặc ở bước chọn bộ vai.',
  },
]

/** Bộ vai gợi ý theo số người chơi (dữ liệu của mock). */
export const PRESETS: Record<number, Counts> = {
  6: { wolf: 1, seer: 1, guard: 1, villager: 3 },
  8: { wolf: 2, seer: 1, guard: 1, witch: 1, villager: 3 },
  10: { wolf: 2, seer: 1, guard: 1, witch: 1, hunter: 1, cupid: 1, villager: 3 },
  12: { wolf: 3, seer: 1, guard: 1, witch: 1, hunter: 1, cupid: 1, villager: 4 },
  16: {
    wolf: 3,
    whitewolf: 1,
    seer: 1,
    guard: 1,
    witch: 1,
    hunter: 1,
    cupid: 1,
    idiot: 1,
    villager: 6,
  },
  20: {
    wolf: 4,
    whitewolf: 1,
    seer: 1,
    guard: 1,
    witch: 1,
    hunter: 1,
    cupid: 1,
    idiot: 1,
    tanner: 1,
    villager: 8,
  },
}

export const MIN_PLAYERS = 4

export const TEAMS: Record<Team, { label: string; icon: 'house' | 'paw' | 'sparkles' }> = {
  village: { label: 'Phe Dân', icon: 'house' },
  wolf: { label: 'Phe Sói', icon: 'paw' },
  solo: { label: 'Phe riêng', icon: 'sparkles' },
}

/**
 * Gợi ý bộ vai cho n người: dùng preset đúng số, hoặc preset lớn nhất ≤ n rồi điền Dân làng.
 * Dưới 6 người: 1 Ma sói, 1 Tiên tri, còn lại Dân làng.
 */
export function suggestCounts(n: number): { counts: Counts; base: number | null } {
  const sizes = Object.keys(PRESETS).map(Number)
  const base = PRESETS[n] ? n : (sizes.filter((k) => k <= n).pop() ?? null)
  const counts: Counts = base ? { ...PRESETS[base] } : { wolf: 1, seer: 1 }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (total < n) counts.villager = (counts.villager ?? 0) + (n - total)
  return { counts, base }
}

export function findRoleDef(id: string, custom: RoleDef[] = []): RoleDef | undefined {
  return ROLES.find((r) => r.id === id) ?? custom.find((r) => r.id === id)
}
