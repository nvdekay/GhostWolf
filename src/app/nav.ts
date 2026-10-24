/* Điều hướng bằng useReducer. Phòng đang mở được nhớ trong localStorage để khôi phục sau refresh. */

export type Route =
  | { name: 'home' }
  | { name: 'choose' }
  | { name: 'gmConfig' }
  | { name: 'join'; code?: string }
  | { name: 'lib' }
  | { name: 'host'; roomId: string }
  | { name: 'player'; roomId: string }

export type NavAction = { type: 'go'; route: Route } | { type: 'home' }

const KEY = 'gw.route'

export function navReducer(_s: Route, a: NavAction): Route {
  const next = a.type === 'home' ? ({ name: 'home' } as const) : a.route
  try {
    if (next.name === 'host' || next.name === 'player')
      localStorage.setItem(KEY, JSON.stringify(next))
    else if (next.name === 'home') localStorage.removeItem(KEY)
  } catch {
    // localStorage có thể bị chặn — chỉ mất tính năng tự mở lại phòng.
  }
  return next
}

/** Route ban đầu: link mời `?join=CODE`, hoặc phòng đang mở trước khi refresh. */
export function initialRoute(): Route {
  const code = new URLSearchParams(window.location.search).get('join')
  if (code) {
    const u = new URL(window.location.href)
    u.searchParams.delete('join')
    window.history.replaceState(null, '', u.toString())
    return {
      name: 'join',
      code: code
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6),
    }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Route | null
    if (
      saved &&
      (saved.name === 'host' || saved.name === 'player') &&
      typeof saved.roomId === 'string'
    )
      return saved
  } catch {
    // bỏ qua
  }
  return { name: 'home' }
}
