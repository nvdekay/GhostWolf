import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Backend local cấu hình bằng 127.0.0.1 nhưng trang được mở qua IP LAN (điện thoại cùng Wi-Fi):
 * trỏ backend về cùng máy với trang để không phải sửa .env.local mỗi lần đổi mạng.
 * URL hosted (không phải loopback) giữ nguyên.
 */
export function sameHostUrl(raw: string): string {
  try {
    const u = new URL(raw)
    const page = location.hostname
    if (LOOPBACK.has(u.hostname) && page && !LOOPBACK.has(page)) u.hostname = page
    return u.toString().replace(/\/$/, '')
  } catch {
    return raw
  }
}

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const url = envUrl ? sameHostUrl(envUrl) : undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Thiếu cấu hình thì app hiện hướng dẫn thay vì chạy giả lập. */
export const supabaseConfigured = !!url && !!key

export const supabase: SupabaseClient = createClient(
  url ?? 'http://localhost:54321',
  key ?? 'missing',
  {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'gw.auth' },
    realtime: { params: { eventsPerSecond: 20 } },
  },
)
