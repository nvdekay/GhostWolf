import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CommandRequest, CommandResponse } from '../../supabase/functions/_shared/commands.ts'

/** Đọc URL/key của Supabase local (`supabase start`). */
function localEnv(): { url: string; anon: string; service?: string } {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    return {
      url: process.env.SUPABASE_URL,
      anon: process.env.SUPABASE_ANON_KEY,
      service: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }
  }
  const out = execSync('supabase status -o env', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const get = (k: string) => out.match(new RegExp(`^${k}="?([^"\\n]+)"?$`, 'm'))?.[1]
  const url = get('API_URL')
  const anon = get('ANON_KEY')
  if (!url || !anon)
    throw new Error('Không đọc được Supabase local. Chạy `npm run db:start` trước.')
  return { url, anon, service: get('SERVICE_ROLE_KEY') }
}

const env = localEnv()

export async function anonClient(): Promise<{ db: SupabaseClient; uid: string }> {
  const db = createClient(env.url, env.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.auth.signInAnonymously()
  if (error || !data.user) throw error ?? new Error('Không đăng nhập ẩn danh được')
  return { db, uid: data.user.id }
}

/** Client service role của Supabase local — chỉ dùng trong test để kiểm tra ràng buộc DB. */
export function serviceClient(): SupabaseClient {
  if (!env.service) throw new Error('Thiếu SERVICE_ROLE_KEY của Supabase local.')
  return createClient(env.url, env.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Gọi RPC, trả lỗi dạng { code, message } với code nằm ở `details`. */
export async function rpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn, args)
  return { data: data as T, error: error ? { code: error.details, message: error.message } : null }
}

type Body = CommandRequest extends infer R
  ? R extends unknown
    ? Omit<R, 'commandId'> & { commandId?: string }
    : never
  : never

export async function command(
  db: SupabaseClient,
  body: Body,
): Promise<{ status: number; data?: CommandResponse; error?: { code: string; message: string } }> {
  const { data: s } = await db.auth.getSession()
  const base = process.env.FUNCTIONS_URL ?? 'http://127.0.0.1:54329'
  const res = await fetch(`${base}/game-command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.anon,
      Authorization: `Bearer ${s.session!.access_token}`,
    },
    body: JSON.stringify({ ...body, commandId: body.commandId ?? randomUUID() }),
  })
  const json = (await res.json()) as CommandResponse & { error?: { code: string; message: string } }
  return res.ok ? { status: res.status, data: json } : { status: res.status, error: json.error }
}
