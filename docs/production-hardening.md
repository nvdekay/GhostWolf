# Ghostwolf — vận hành production

Bổ sung cho phần "Triển khai" trong README. Không thay đổi được từ code frontend (static), cần cấu hình ở host và Supabase.

Trạng thái phát hành 2026-10-27: migrations và hai Edge Function đã deploy lên Supabase project
`ztyefvgplgafhfukmkxh`; frontend Vercel production chứa implementation baseline `703c8df`,
được build từ `main` và đang phục vụ tại `https://ghostwolf.khanhnvd.click`. Các mục
dashboard/cron/alert bên dưới vẫn phải được xác minh riêng vì không nằm trong static build.

## 1. Header bảo mật (host static)

Production (Vercel) đã đặt các header dưới đây trong `vercel.json`. Nếu đổi host static khác (Netlify `_headers`, Cloudflare `_headers`…), đặt lại cho mọi response và thay `<ref>` bằng project ref Supabase.

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
```

- `style-src-attr 'unsafe-inline'`: app đặt biến CSS qua thuộc tính `style` (vòng ghế, thanh phiếu). Không cần `unsafe-inline` cho script.
- Font tự host trong `dist/assets`, không gọi Google Fonts; Vite nhúng font nhỏ dạng `data:` nên `font-src` cần `data:`.
- Nếu Edge Function dùng domain riêng, thêm vào `connect-src`.
- Chỉ bật HSTS `preload` khi chắc chắn mọi subdomain đều HTTPS.

## 2. Đăng nhập ẩn danh và rate limit

- Theo quyết định sản phẩm ngày 2026-10-27, production không dùng CAPTCHA để người chơi vào thẳng ứng dụng. Cloudflare Turnstile widget, Vercel site key và Supabase enforcement đều đã gỡ.
- Authentication → Rate Limits giới hạn anonymous sign-ins theo IP: local là 300/giờ, production là 30/giờ trong `supabase/config.toml`.

Giới hạn nghiệp vụ đã có trong database (migration `20261025000100`):

| Giới hạn                              | Giá trị                 | Mã lỗi                                    |
| ------------------------------------- | ----------------------- | ----------------------------------------- |
| Thành viên đang hoạt động / phòng     | 30 (khớp `MAX_PLAYERS`) | `ROOM_FULL`                               |
| Phòng chưa đóng / quản trò            | 10                      | `TOO_MANY_ROOMS`                          |
| Lệnh / ván / 10 giây                  | 60                      | `RATE_LIMITED` (HTTP 429)                 |
| Số thẻ một vai, tổng thẻ, số loại vai | 30 / 30 / 64            | `BAD_COMMAND` (400), `DECK_INVALID` (422) |

## 3. Monitoring

Hai Edge Function `game-command` và `player-command` ghi log JSON đã lọc bí mật cho mỗi request
(Dashboard → Edge Functions → Logs):

```json
{
  "level": "info",
  "fn": "game-command",
  "requestId": "…",
  "scope": "game",
  "command": "night.act",
  "commandId": "…",
  "gameId": "…",
  "status": 200,
  "ms": 84
}
```

- Không bao giờ ghi JWT, key, thân lệnh (vai, mục tiêu, phiếu) hay trạng thái ván.
- `x-request-id`: client có thể gửi (8–64 ký tự `[0-9A-Za-z-]`), server trả lại trong header để đối chiếu.
- Cảnh báo nên đặt: tỉ lệ `level=error` (5xx) > 1% trong 5 phút; `code=RATE_LIMITED` tăng đột biến; `ms` p95 > 1500.
- Postgres: service role gọi `select public.gw_remote_metrics()` để lấy số phòng/ván remote,
  prompt mở/hết hạn, AFK, lượt takeover thiết bị và moderation trong 24 giờ. Kết quả không chứa
  chat, vai, mục tiêu hay phiếu cá nhân.
- Cảnh báo thêm: prompt hết hạn tăng đột biến, `afk_total` tăng nhanh, hoặc takeover thiết bị bất thường.

GitHub Actions workflow `.github/workflows/production-health.yml` chạy mỗi giờ và có thể chạy
tay. Script `npm run health:production` kiểm tra frontend + security headers, preflight của hai
Edge Function, RPC metrics, retention cron và ngưỡng prompt hết hạn. Workflow thất bại tạo cảnh
báo trong GitHub Actions mà không ghi secret hoặc payload riêng tư. Cần cấu hình:

- Repository variables: `PRODUCTION_URL`, `SUPABASE_URL`.
- Repository secret: `SUPABASE_SERVICE_ROLE_KEY`.

## 4. Dọn dữ liệu cũ (TTL)

`public.gw_cleanup(p_closed_days int = 30, p_history_days int = 7, p_anon_days int = 90)` — chỉ service role gọi được. Chỉ xóa:

1. Phòng đã đóng quá `p_closed_days` ngày (kéo theo ván, vai, lịch sử của phòng đó).
2. Lịch sử hoàn tác + nhật ký lệnh + prompt/submission/private inbox của ván đã kết thúc quá
   `p_history_days` ngày.
3. Người dùng ẩn danh không đăng nhập lại quá `p_anon_days` ngày, không làm quản trò phòng chưa đóng và không là thành viên đang hoạt động ở đâu.

Migration `20261027040000_schedule_retention.sql` bật `pg_cron` và tạo hai job:

```sql
-- 03:17 UTC hằng ngày
select cron.schedule('ghostwolf-cleanup', '17 3 * * *', $$ select public.gw_cleanup() $$);

-- 03:47 UTC hằng ngày; pg_cron không tự dọn run history
select cron.schedule(
  'ghostwolf-cron-history-cleanup',
  '47 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '14 days' $$
);
```

`public.gw_cron_health()` chỉ cho `service_role` đọc trạng thái lịch và lần chạy gần nhất, không
trả command. Chạy thử `gw_cleanup` trước trên bản sao dữ liệu và xem số dòng trả về
(`{"rooms":…,"history":…,"commands":…,"prompts":…,"knowledge":…,"notices":…,"anon_users":…}`).

## 5. Deploy và rollback migration

Thứ tự deploy:

1. `supabase db push` (migration chạy trong transaction; lỗi là rollback toàn bộ migration đó).
2. `supabase functions deploy game-command` và `supabase functions deploy player-command`.
3. Build và upload frontend.

Migration `20261025000000` và `20261025000100` chỉ `create or replace` hàm (cùng chữ ký, giữ quyền đã cấp), thêm trigger, index và CHECK. CHECK được thêm `NOT VALID` rồi `VALIDATE`: nếu dữ liệu cũ vi phạm, migration dừng và không áp một nửa. Kiểm tra trước trên production:

```sql
select count(*) from public.room_members where seat < 1;
select count(*) from public.games where number < 1 or revision < 0;
select count(*) from public.rooms r join public.games g on g.id = r.current_game_id where g.room_id <> r.id;
```

Rollback (nếu cần): tạo migration mới khôi phục định nghĩa hàm từ `20261024000000_ghostwolf_schema.sql` (create_room, join_room, host_add_member, create_game, commit_game), rồi `drop trigger rooms_current_game_guard on public.rooms`, `drop trigger assignments_room_guard on public.assignments`, `alter table … drop constraint …` cho ba CHECK, `drop function public.gw_cleanup(int, int, int)`. Không sửa migration đã áp dụng. Frontend và Edge Function mới tương thích với schema cũ, trừ việc mất các mã lỗi mới.

## 6. Runbook remote

- Người chơi báo “thiết bị khác đang điều khiển”: xác nhận họ vừa mở tab/thiết bị mới; tải lại
  đúng thiết bị muốn dùng. Không sửa trực tiếp `session_id`.
- Prompt kẹt: host dùng “Bỏ lượt hộ …”; thao tác tăng `afk_count` và tạo `moderation_events`.
- Deadline ngắn: host dùng `+30 giây`; thay đổi được lưu server và audit, không dựa timer trình duyệt.
- Nghi lộ bí mật: đóng phòng, lưu request id/thời điểm (không sao chép payload), kiểm tra RLS và
  log function; không bật service key ở client để điều tra.
- Realtime chập chờn: snapshot được tải lại khi subscribe; kiểm tra REST vẫn hoạt động trước khi
  kết luận mất dữ liệu.

## 7. Việc còn lại

- [x] Không dùng CAPTCHA theo quyết định sản phẩm; Turnstile đã gỡ khỏi code, Vercel, Cloudflare
      và Supabase config. Anonymous rate limit production là 30/giờ/IP.
- [~] Migration Supabase Cron, dọn run history và RPC health đã deploy; lịch active, còn chờ xác minh lần chạy hosted đầu tiên.
- [~] Synthetic health/cron/expired-prompt alert mỗi giờ qua GitHub Actions đã có; alert dựa
  trên Supabase logs cho tỷ lệ 5xx, p95, rate-limit và Realtime errors cần Log Drains nên tạm
  hoãn khi project còn ở Supabase Free. Workflow dùng Actions runtime hiện hành và đã chạy pass.
- [x] Realtime chat hosted đã smoke test; presence private adversarial test hosted pass (member
      subscribe, outsider `CHANNEL_ERROR`). Key presence vẫn chỉ là tín hiệu UI theo RT-03.
- [ ] Chạy closed beta 6–8 và 12–16 người trên Wi-Fi + 4G/5G, ghi lại các chỉ số trong kế hoạch.
- [ ] Khôi phục quyền **quản trò** khi đổi/mất thiết bị (FE-02); lease thiết bị người chơi remote đã có.
- [~] Presence: key do client đặt, chỉ dùng để hiển thị online (RT-03). Muốn tin cậy được cần heartbeat qua RPC.
