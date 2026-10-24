import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Thiếu cấu hình thì app hiện hướng dẫn thay vì chạy giả lập. */
export const supabaseConfigured = !!url && !!key

export const supabase: SupabaseClient = createClient(url ?? 'http://localhost:54321', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'gw.auth' },
  realtime: { params: { eventsPerSecond: 20 } },
})
