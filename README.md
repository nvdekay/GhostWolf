# Ghostwolf

Web chơi Ma Sói trực tiếp: quản trò điều hành trên một máy, mỗi người chơi xem vai bí mật trên điện thoại của mình. React + TypeScript + Vite (static `dist/`), Supabase (Postgres + RLS, đăng nhập ẩn danh, Realtime, Edge Function).

- Luật chơi: [`docs/ruleset.md`](docs/ruleset.md)
- Tiến độ và phạm vi: [`docs/implementation-checklist.md`](docs/implementation-checklist.md)
- Vận hành production (header bảo mật, rate limit, monitoring, dọn dữ liệu, rollback): [`docs/production-hardening.md`](docs/production-hardening.md)

## Kiến trúc

| Phần                                             | Vị trí                                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Giao diện                                        | `src/features/*`, `src/components/*`                                                                 |
| Game engine (TS thuần, dùng chung client/server) | `supabase/functions/_shared/engine` (alias `@engine`)                                                |
| Lệnh ván (có thẩm quyền)                         | Edge Function `supabase/functions/game-command` → `commit_game` (transaction, revision, idempotency) |
| Lệnh phòng, RLS, schema                          | `supabase/migrations/*.sql` (RPC `security definer`)                                                 |
| Gọi backend                                      | `src/services/*`                                                                                     |
| Realtime + khôi phục                             | `src/realtime/roomStore.ts`                                                                          |
| Phiên ẩn danh, điều hướng                        | `src/app/session.tsx`, `src/app/nav.ts`                                                              |

Bảo mật: người chơi chỉ đọc được vai của chính mình sau khi quản trò gửi (RLS trên `assignments`); toàn bộ trạng thái bí mật nằm trong `game_secrets` chỉ quản trò đọc; `games.public_state` chỉ chứa dữ liệu công khai. Realtime `postgres_changes` áp RLS theo từng người nhận. Frontend chỉ dùng anon key; service-role key chỉ có trong Edge Function.

## Yêu cầu

- Node.js 20.19+ (khuyến nghị 22+), npm
- Chạy local: [Supabase CLI](https://supabase.com/docs/guides/cli) + Docker, [Deno](https://deno.com) 2.x

## Chạy local

```bash
npm install
npm run db:start          # Supabase local (Postgres, Auth, Realtime), áp migrations
npm run functions:serve   # Edge Function game-command bằng Deno, cổng 54329 (để terminal này chạy)
```

Tạo `.env.local` (không commit) từ `supabase status`:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key trong `supabase status`>
VITE_FUNCTIONS_URL=http://127.0.0.1:54329
```

```bash
npm run dev               # http://localhost:5173
```

Mở thêm cửa sổ ẩn danh/thiết bị khác để làm người chơi (mỗi trình duyệt là một danh tính ẩn danh riêng). Điện thoại trong cùng mạng: `npm run dev -- --host` rồi mở `http://<IP máy>:5173`. Khi `.env.local` trỏ tới `127.0.0.1`, app tự gọi backend ở cùng máy với trang nên không cần sửa `.env.local` khi đổi mạng.

> `npm run db:start` bỏ container edge-runtime của CLI (`-x edge-runtime`) vì runtime đó cần tải từ jsr.io; `functions:serve` chạy đúng mã Edge Function bằng Deno. Nếu mạng của bạn tải được jsr.io, có thể dùng `supabase start` + `supabase functions serve` và bỏ `VITE_FUNCTIONS_URL`.

## Kiểm thử

```bash
npm run typecheck
npm run lint
npm test                    # Vitest: engine (chia bài, đêm, dây chuyền, phiếu, thắng, public view)
npm run test:integration    # Cần db:start + functions:serve: RLS, lobby, idempotency, revision, realtime, undo/replay
npm run test:e2e            # Cần thêm dev server (tự khởi động): quản trò + 2 người chơi, responsive 360–1440px
                            # Dùng trình duyệt cài sẵn: PW_CHANNEL=msedge npm run test:e2e
                            # hoặc cài Chromium của Playwright: npx playwright install chromium
deno check supabase/functions/game-command/index.ts
```

## Triển khai (gói miễn phí: Cloudflare + Supabase Free)

Bản đang chạy: https://ghostwolf.visual-lab-dm4.workers.dev (frontend tĩnh trên Cloudflare Workers static assets, backend ở Supabase project `ztyefvgplgafhfukmkxh`, Singapore). Cấu hình header bảo mật, giới hạn, monitoring và rollback: [`docs/production-hardening.md`](docs/production-hardening.md).

Cần: `supabase login` và `npx wrangler@4 login` (một lần trên máy deploy).

### 1. Backend (Supabase)

```bash
supabase link --project-ref ztyefvgplgafhfukmkxh                # mật khẩu DB: .env.deploy.local (không commit)
supabase db push                                                 # migrations: bảng, RLS, RPC, realtime
supabase functions deploy game-command --use-api                 # Edge Function (verify_jwt=false: function tự xác thực)
supabase config push --project-ref ztyefvgplgafhfukmkxh          # auth: bật ẩn danh, Site URL — xem [remotes.production] trong config.toml
```

`config push` đẩy cả `config.toml`; mục `[remotes.production]` ghi đè các giá trị local (Site URL, rate limit, xác nhận email, MFA). Luôn chạy thử không `--yes` để xem diff trước.

### 2. Frontend (Cloudflare)

Tạo `.env.production.local` (không commit):

```bash
VITE_SUPABASE_URL=https://ztyefvgplgafhfukmkxh.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key: supabase projects api-keys --project-ref ztyefvgplgafhfukmkxh>
VITE_FUNCTIONS_URL=                                             # rỗng: ghi đè giá trị local trong .env.local
```

```bash
npm run deploy:cf     # build → dist/_headers (CSP theo URL Supabase) → wrangler deploy
```

Đổi domain (domain riêng hoặc tên Worker khác): sửa `site_url` / `additional_redirect_urls` trong `[remotes.production.auth]` rồi `supabase config push`.

## Scripts

| Lệnh                                     | Việc                                               |
| ---------------------------------------- | -------------------------------------------------- |
| `dev` / `build` / `preview`              | Vite                                               |
| `typecheck` / `lint` / `format`          | TypeScript, ESLint, Prettier                       |
| `test` / `test:integration` / `test:e2e` | Vitest unit / Vitest + Supabase local / Playwright |
| `db:start` / `db:reset`                  | Supabase local / áp lại migrations từ đầu          |
| `functions:serve`                        | Chạy Edge Function local bằng Deno                 |
| `build:cf` / `deploy:cf`                 | Build kèm `_headers` / deploy lên Cloudflare       |
