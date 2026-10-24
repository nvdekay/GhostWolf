// Chạy Edge Function `game-command` bằng Deno với env của Supabase local.
// Dùng khi edge runtime của Supabase CLI không khởi động được (ví dụ mạng chặn jsr.io).
// Hosted Supabase: deploy bằng `supabase functions deploy game-command`, không cần script này.
import { execSync, spawn } from 'node:child_process'

const out = execSync('supabase status -o env', {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})
const get = (k) => out.match(new RegExp(`^${k}="?([^"\\n]+)"?$`, 'm'))?.[1]
const env = {
  ...process.env,
  SUPABASE_URL: get('API_URL'),
  SUPABASE_ANON_KEY: get('ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: get('SERVICE_ROLE_KEY'),
}
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Không đọc được Supabase local. Chạy `npm run db:start` trước.')
  process.exit(1)
}
const port = process.env.FUNCTIONS_PORT ?? '54329'
console.log(`game-command: http://127.0.0.1:${port}/game-command`)
spawn(
  'deno',
  [
    'run',
    '--allow-net',
    '--allow-env',
    `--watch=supabase/functions`,
    'supabase/functions/game-command/index.ts',
  ],
  {
    env: { ...env, PORT: port },
    stdio: 'inherit',
  },
)
