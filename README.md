# Ghostwolf

Web hỗ trợ cả chơi Ma Sói cùng phòng và chơi từ xa hoàn toàn trong trình duyệt. Ở chế độ từ xa,
mỗi người dùng thiết bị riêng để ready, xem vai, chat, hành động ban đêm và bỏ phiếu.

**Production:** [ghostwolf.khanhnvd.click](https://ghostwolf.khanhnvd.click)

## Tổng quan

- React 19, TypeScript và Vite; frontend build thành static assets trong `dist/`.
- Supabase cung cấp Postgres, đăng nhập ẩn danh, RLS, Realtime và Edge Function chạy Deno.
- Game engine thuần TypeScript nằm tại `supabase/functions/_shared/engine` và là nguồn luật dùng chung.
- Mọi lệnh có thẩm quyền đi qua `game-command` → engine → RPC `commit_game` có transaction, revision và idempotency.

Người chơi chỉ đọc assignment của chính mình sau khi quản trò gửi vai. Trạng thái bí mật nằm trong `game_secrets`; `games.public_state` chỉ chứa dữ liệu công khai. Frontend chỉ sử dụng anon/publishable key, không chứa service-role key.

| Thành phần              | Vị trí                                         |
| ----------------------- | ---------------------------------------------- |
| Màn hình và UI          | `src/features`, `src/components`, `src/app`    |
| API client và Realtime  | `src/services`, `src/realtime/roomStore.ts`    |
| Engine và Edge Function | `supabase/functions`                           |
| Schema, RPC và RLS      | `supabase/migrations`                          |
| Kiểm thử                | `tests/unit`, `tests/integration`, `tests/e2e` |

## Chạy local

Yêu cầu Node.js 20.19+ (khuyến nghị 22+), npm, Docker, Supabase CLI và Deno 2.x.

```bash
npm ci
npm run db:start
cp .env.example .env.local
supabase status
```

Điền anon key từ `supabase status` vào `.env.local`, sau đó chạy hai terminal:

```bash
npm run functions:serve   # game-command + player-command tại http://127.0.0.1:54329
npm run dev               # frontend tại http://localhost:5173
```

Mỗi trình duyệt hoặc cửa sổ ẩn danh là một người chơi khác. Để thử trên điện thoại cùng Wi-Fi, chạy `npm run dev -- --host` rồi mở `http://<IP-máy>:5173`; app tự ánh xạ backend local sang cùng hostname.

Khi tạo phòng, quản trò nên mở “Mã khôi phục” và lưu riêng mã này. Nếu đổi hoặc mất thiết bị,
chọn “Khôi phục quản trò” ở trang chủ, nhập mã phòng cùng mã khôi phục; mã cũ sẽ bị vô hiệu và
thiết bị mới nhận một mã mới.

## Kiểm thử

```bash
npm run typecheck
npm run lint
npm test
deno check supabase/functions/game-command/index.ts
npm run build
```

Sau khi `db:start` và `functions:serve` đang chạy:

```bash
npm run test:integration
npm run test:e2e
# Hoặc dùng trình duyệt đã cài: PW_CHANNEL=msedge npm run test:e2e
```

## Triển khai

Production dùng Supabase Free cho backend và Vercel (Hobby) cho frontend tại `ghostwolf.khanhnvd.click` (CNAME ở DNS Tenten trỏ về Vercel). Cấu hình Supabase hosted nằm trong `[remotes.production]` của `supabase/config.toml`; header bảo mật và rewrite nằm trong `vercel.json`.

Backend (khi đổi migration, Edge Function hoặc cấu hình auth):

```bash
supabase link --project-ref ztyefvgplgafhfukmkxh
supabase db push
supabase functions deploy game-command --use-api
supabase functions deploy player-command --use-api
supabase config push --project-ref ztyefvgplgafhfukmkxh   # chạy không --yes trước để xem diff
```

Frontend: project Vercel `ghostwolf` nối với repo GitHub, mỗi lần push lên `main` tự build và deploy. Biến `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` (publishable key) khai trong Vercel, không nằm trong repo. Deploy tay: `npx vercel@latest deploy --prod`.

## Tài liệu

- [Luật game](docs/ruleset.md)
- [Hướng dẫn chơi từ xa](docs/remote-play.md)
- [Kế hoạch/kiến trúc chế độ từ xa](docs/remote-play-plan.md)
- [Checklist triển khai](docs/implementation-checklist.md)
- [Bảo mật, monitoring, cleanup và rollback production](docs/production-hardening.md)
- [Hướng dẫn đóng góp](AGENTS.md)
