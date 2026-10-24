import type { Game, LogEntry } from '@/types/game'
import { PRESETS } from '@/features/roles/catalog'

/** Tên mẫu cho dữ liệu demo (chưa có backend nên phòng chờ được mô phỏng). */
export const DEMO_NAMES = ['Minh', 'Lan', 'Huy', 'Thảo', 'Quân', 'Vy', 'Đức', 'Ngọc', 'Tùng', 'Hà']

/** Ván demo đang ở Ngày 1, bước bỏ phiếu — giống ván lưu sẵn trong prototype. */
export function createDemoGame(): Game {
  const roles = [
    'wolf',
    'seer',
    'villager',
    'guard',
    'wolf',
    'witch',
    'villager',
    'hunter',
    'cupid',
    'villager',
  ]
  const L = (tag: string, text: string, pub: boolean): LogEntry => ({ tag, text, pub })
  return {
    name: 'Ván tối thứ Sáu',
    players: DEMO_NAMES.map((name, i) => ({
      id: 'd' + i,
      name,
      roleId: roles[i]!,
      alive: i !== 2,
      lover: i === 5 || i === 6,
      chief: i === 1,
    })),
    day: 1,
    phase: 'day',
    step: 0,
    night: {},
    witch: { heal: true, poison: true },
    lastProtect: 'd3',
    dayStep: 'vote',
    votes: {},
    voteRes: null,
    voteOnly: null,
    lastDeaths: ['d2'],
    pendingHunter: null,
    winner: null,
    counts: { ...PRESETS[10] },
    log: [
      L('Đêm 1', 'Ván bắt đầu với 10 người chơi.', true),
      L('Đêm 1', 'Cupid ghép đôi Vy và Đức.', false),
      L('Đêm 1', 'Bảo vệ che chở Thảo.', false),
      L('Đêm 1', 'Ma sói chọn Huy.', false),
      L('Đêm 1', 'Phù thủy không dùng bình.', false),
      L('Đêm 1', 'Tiên tri soi Minh: Ma sói.', false),
      L('Ngày 1', 'Huy bị loại trong đêm.', true),
      L('Ngày 1', 'Lan được bầu làm Trưởng làng.', true),
    ],
  }
}
