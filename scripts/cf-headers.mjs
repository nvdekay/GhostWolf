// Ghi dist/_headers cho Cloudflare (static assets): CSP chỉ cho phép kết nối tới Supabase của bản build này.
// Đọc VITE_SUPABASE_URL / VITE_FUNCTIONS_URL giống Vite (biến môi trường hoặc .env.production.local).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

function envFile(path) {
  if (!existsSync(path)) return {}
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.replace(/^["']|["']$/g, '')]),
  )
}

const env = { ...envFile('.env.production'), ...envFile('.env.production.local'), ...process.env }
const origins = [env.VITE_SUPABASE_URL, env.VITE_FUNCTIONS_URL]
  .filter(Boolean)
  .map((u) => new URL(u).origin)
if (!origins.length || origins.some((o) => !o.startsWith('https://'))) {
  console.error('Cần VITE_SUPABASE_URL dạng https:// (Supabase hosted) để build bản deploy.')
  process.exit(1)
}
const connect = [...new Set(origins.flatMap((o) => [o, o.replace(/^https:/, 'wss:')]))].join(' ')

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  // Biến CSS đặt qua thuộc tính style (vòng ghế, thanh phiếu).
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  // Vite nhúng font nhỏ dạng data: vào CSS.
  "font-src 'self' data:",
  `connect-src 'self' ${connect}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

writeFileSync(
  'dist/_headers',
  `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`,
)
console.log('dist/_headers: connect-src', connect)
