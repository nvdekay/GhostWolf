import { curtain, freshJoin, getState, setState, type JoinState } from '@/app/store'
import { pickRandom } from '@/lib/random'

/** Mã phòng demo — chưa có backend nên phía người chơi được mô phỏng. */
export const DEMO_CODE = 'TRANG6'

let lockTimer: ReturnType<typeof setTimeout> | undefined
let roleTimer: ReturnType<typeof setTimeout> | undefined
let dayTimer: ReturnType<typeof setTimeout> | undefined

function patchJoin(patch: Partial<JoinState>) {
  setState((s) => ({ join: { ...s.join, ...patch } }))
}

export function openJoin() {
  setState({ screen: 'join', join: freshJoin() })
}

export function setCode(raw: string) {
  patchJoin({
    code: raw
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6),
    err: '',
  })
}

export function fillDemoCode() {
  patchJoin({ code: DEMO_CODE, err: '' })
}

export function submitCode() {
  const { join, room } = getState()
  const c = join.code
  if (c.length !== 6) return patchJoin({ err: 'Mã phòng gồm 6 ký tự.' })
  if (c !== DEMO_CODE && room?.code !== c) {
    return patchJoin({ err: `Không tìm thấy phòng ${c}. Kiểm tra lại mã với quản trò.` })
  }
  patchJoin({ stage: 'name', err: '' })
}

export function submitName() {
  if (!getState().join.name.trim()) return
  patchJoin({ stage: 'wait', locked: false })
  clearTimeout(lockTimer)
  clearTimeout(roleTimer)
  lockTimer = setTimeout(() => patchJoin({ locked: true }), 3500)
  roleTimer = setTimeout(() => {
    const pool = ['seer', 'wolf', 'witch', 'guard', 'hunter', 'villager']
    setState((s) => ({
      join: { ...s.join, stage: 'role' },
      myRole: pickRandom(pool),
      pFlip: false,
    }))
  }, 7000)
}

export function markRoleSeen() {
  setState((s) => ({ join: { ...s.join, stage: 'game' }, pFlip: false }))
  clearTimeout(dayTimer)
  dayTimer = setTimeout(() => {
    patchJoin({ phase: 'Ngày 1', phaseSub: 'Thảo luận và bỏ phiếu theo hiệu lệnh quản trò' })
    curtain('Trời sáng', 'Ngày 1', 'sun')
  }, 9000)
}

export function leaveRoom() {
  clearTimeout(lockTimer)
  clearTimeout(roleTimer)
  clearTimeout(dayTimer)
  setState({ screen: 'home' })
}
