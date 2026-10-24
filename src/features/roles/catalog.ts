import type { IconName } from '@/components/Icon'
import type { Counts, Role, StatusDef, Team } from '@/types/game'

export const ROLES: Role[] = [
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
    skill: 'Mỗi đêm chọn một người. Quản trò ra hiệu người đó có thuộc phe Ma sói hay không.',
    wake: 'Mỗi đêm, sau Phù thủy',
    note: 'Có nhóm cho Tiên tri biết đúng tên vai thay vì chỉ phe. Hãy thống nhất trước ván.',
  },
  {
    id: 'guard',
    name: 'Bảo vệ',
    team: 'village',
    icon: 'shield',
    short: 'Mỗi đêm che chở một người khỏi Ma sói.',
    skill:
      'Mỗi đêm chọn một người, có thể là chính mình. Nếu Ma sói cắn người đó, họ sống sót. Không được bảo vệ cùng một người hai đêm liền.',
    wake: 'Mỗi đêm, trước Ma sói',
    note: 'Khi Bảo vệ và Phù thủy cùng cứu một người, có biến thể coi người đó vẫn chết. Ứng dụng coi là sống.',
  },
  {
    id: 'witch',
    name: 'Phù thủy',
    team: 'village',
    icon: 'flask',
    short: 'Một bình cứu và một bình độc, mỗi bình dùng một lần.',
    skill:
      'Quản trò cho Phù thủy biết ai bị cắn. Phù thủy có thể dùng bình cứu cho người đó, và có thể dùng bình độc để loại một người. Mỗi bình chỉ dùng một lần trong cả ván.',
    wake: 'Mỗi đêm, sau Ma sói',
    note: 'Có nhóm không cho Phù thủy tự cứu mình. Quản trò quyết định trước ván.',
  },
  {
    id: 'hunter',
    name: 'Thợ săn',
    team: 'village',
    icon: 'crosshair',
    gm: true,
    short: 'Khi bị loại, được kéo theo một người.',
    skill:
      'Khi bị loại bằng bất kỳ cách nào, Thợ săn chọn ngay một người để bắn. Người đó bị loại theo.',
    wake: 'Không thức dậy · kích hoạt khi bị loại',
    note: 'Nếu Thợ săn trúng độc, nhiều nhóm không cho bắn. Quản trò xử lý.',
  },
  {
    id: 'cupid',
    name: 'Cupid',
    team: 'village',
    icon: 'heart',
    gm: true,
    short: 'Đêm đầu tiên ghép đôi hai người.',
    skill:
      'Đêm đầu tiên chọn hai người thành Cặp đôi. Nếu một người trong Cặp đôi bị loại, người kia bị loại theo.',
    win: 'Thắng cùng phe Dân làng. Nếu Cặp đôi khác phe, họ thắng khi chỉ còn lại hai người.',
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
      'Nếu bị loại bằng phiếu bầu ban ngày, Thằng ngốc lật thẻ và tiếp tục chơi nhưng không còn được bỏ phiếu.',
    wake: 'Không thức dậy',
  },
  {
    id: 'wolf',
    name: 'Ma sói',
    team: 'wolf',
    icon: 'paw',
    short: 'Mỗi đêm cùng bầy chọn một người để cắn.',
    skill:
      'Mỗi đêm các Ma sói thức dậy, nhận ra nhau và thống nhất chọn một người để loại. Ban ngày giả làm dân thường.',
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
      'Thức dậy cùng Ma sói mỗi đêm. Cứ hai đêm một lần, Sói trắng được thức thêm một lượt để loại một Ma sói khác.',
    win: 'Thắng một mình khi là người duy nhất còn sống.',
    wake: 'Mỗi đêm cùng Ma sói · thêm lượt vào đêm chẵn',
    note: 'Bầy sói nhìn thấy Sói trắng như một Ma sói bình thường.',
  },
  {
    id: 'tanner',
    name: 'Kẻ chán đời',
    team: 'solo',
    icon: 'ghost',
    gm: true,
    short: 'Thắng nếu bị dân làng bỏ phiếu loại.',
    skill: 'Không có kỹ năng ban đêm. Tìm cách khiến cả làng nghi ngờ mình.',
    win: 'Thắng một mình nếu bị loại bằng phiếu bầu ban ngày.',
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
      'Mỗi đêm chọn hai người để mê hoặc. Quản trò chạm vai những người bị mê hoặc để họ biết.',
    win: 'Thắng một mình khi mọi người còn sống đều bị mê hoặc.',
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
    win: 'Cùng phe thì thắng cùng phe. Khác phe thì thắng khi chỉ còn hai người.',
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
    note: 'Không cộng vào số thẻ vai. Có thể tắt ở bước chọn bộ vai.',
  },
]

/** Bộ vai gợi ý theo số người chơi. */
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

export const PRESET_SIZES = Object.keys(PRESETS).map(Number)

/** Bộ gợi ý khớp đúng số người, hoặc bộ lớn nhất không vượt quá. */
export function presetSizeFor(n: number): number | undefined {
  if (PRESETS[n]) return n
  return PRESET_SIZES.filter((k) => k <= n).pop()
}

export const TEAMS: Record<Team, { label: string; icon: IconName }> = {
  village: { label: 'Phe Dân', icon: 'house' },
  wolf: { label: 'Phe Sói', icon: 'paw' },
  solo: { label: 'Phe riêng', icon: 'sparkles' },
}

export const TEAM_FILTERS: { key: Team | 'all'; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'village', label: 'Dân làng' },
  { key: 'wolf', label: 'Ma sói' },
  { key: 'solo', label: 'Phe riêng' },
]
