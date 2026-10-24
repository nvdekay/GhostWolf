import { useEffect, useState } from 'react'

/** Đồng hồ thảo luận dựa trên timestamp: không lệch khi tab chạy nền. Lưu cục bộ theo ván. */
interface TimerState {
  total: number
  /** Đang chạy: thời điểm hết giờ (ms). */
  endsAt: number | null
  /** Đang dừng: số giây còn lại. */
  left: number
}

const load = (key: string): TimerState => {
  try {
    const t = JSON.parse(localStorage.getItem(key) ?? 'null') as TimerState | null
    if (t && typeof t.total === 'number') return t
  } catch {
    // bỏ qua
  }
  return { total: 180, endsAt: null, left: 180 }
}

export function useTimer(gameId: string, day: number) {
  const key = `gw.timer.${gameId}.${day}`
  const [t, setT] = useState<TimerState>(() => load(key))
  const [now, setNow] = useState(() => Date.now())

  const save = (next: TimerState) => {
    setT(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // bỏ qua
    }
  }

  useEffect(() => {
    if (!t.endsAt) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [t.endsAt])

  const left = t.endsAt ? Math.max(0, Math.ceil((t.endsAt - now) / 1000)) : t.left
  const running = !!t.endsAt && left > 0
  const expired = !!t.endsAt && left === 0

  return {
    left,
    total: t.total,
    running,
    expired,
    start: () => save({ ...t, endsAt: Date.now() + left * 1000 }),
    pause: () => save({ ...t, endsAt: null, left }),
    reset: () => save({ total: t.total, endsAt: null, left: t.total }),
    add: (s: number) =>
      save(
        t.endsAt
          ? { ...t, total: t.total + s, endsAt: t.endsAt + s * 1000 }
          : { ...t, total: t.total + s, left: left + s },
      ),
    preset: (s: number) => save({ total: s, endsAt: null, left: s }),
  }
}
