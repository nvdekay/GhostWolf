# Ghostwolf — vận hành production

Bổ sung cho phần "Triển khai" trong README. Không thay đổi được từ code frontend (static), cần cấu hình ở host và Supabase.

## 1. Header bảo mật (host static)

Đặt cho mọi response của frontend (Netlify `_headers`, Vercel `vercel.json`, Cloudflare Pages `_headers`…). Thay `<ref>` bằng project ref Supabase.

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
```

- `style-src-attr 'unsafe-inline'`: app đặt biến CSS qua thuộc tính `style` (vòng ghế, thanh phiếu). Không cần `unsafe-inline` cho script.
- Font tự host trong `dist/assets`, không gọi Google Fonts.
- Nếu Edge Function dùng domain riêng, thêm vào `connect-src`.
- Chỉ bật HSTS `preload` khi chắc chắn mọi subdomain đều HTTPS.

## 2. Đăng nhập ẩn danh: CAPTCHA và rate limit

- Dashboard → Authentication → Attack Protection: bật CAPTCHA (hCaptcha/Turnstile) cho anonymous sign-in. Frontend cần truyền `captchaToken` vào `signInAnonymously` (chưa làm trong repo — xem mục "Việc còn lại").
- Authentication → Rate Limits: giới hạn anonymous sign-ins theo IP (local đang là 300/giờ trong `supabase/config.toml`; production nên thấp hơn, ví dụ 30/giờ).

Giới hạn nghiệp vụ đã có trong database (migration `20261025000100`):

| Giới hạn                              | Giá trị                 | Mã lỗi                                    |
| ------------------------------------- | ----------------------- | ----------------------------------------- |
| Thành viên đang hoạt động / phòng     | 30 (khớp `MAX_PLAYERS`) | `ROOM_FULL`                               |
| Phòng chưa đóng / quản trò            | 10                      | `TOO_MANY_ROOMS`                          |
| Lệnh / ván / 10 giây                  | 60                      | `RATE_LIMITED` (HTTP 429)                 |
| Số thẻ một vai, tổng thẻ, số loại vai | 30 / 30 / 64            | `BAD_COMMAND` (400), `DECK_INVALID` (422) |

## 3. Monitoring

Edge Function `game-command` ghi một dòng JSON cho mỗi request (Dashboard → Edge Functions → Logs):

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
- Postgres: theo dõi số dòng `game_history`, `game_commands`, `auth.users` (ẩn danh) để kiểm tra việc dọn dữ liệu.

## 4. Dọn dữ liệu cũ (TTL)

`public.gw_cleanup(p_closed_days int = 30, p_history_days int = 7, p_anon_days int = 90)` — chỉ service role gọi được. Chỉ xóa:

1. Phòng đã đóng quá `p_closed_days` ngày (kéo theo ván, vai, lịch sử của phòng đó).
2. Lịch sử hoàn tác + nhật ký lệnh của ván đã kết thúc quá `p_history_days` ngày.
3. Người dùng ẩn danh không đăng nhập lại quá `p_anon_days` ngày, không làm quản trò phòng chưa đóng và không là thành viên đang hoạt động ở đâu.

Không tự chạy. Lên lịch bằng `pg_cron` (Dashboard → Integrations → Cron):

```sql
select cron.schedule('ghostwolf-cleanup', '17 3 * * *', $$ select public.gw_cleanup() $$);
```

Chạy thử trước trên bản sao dữ liệu và xem số dòng trả về (`{"rooms":…,"history":…,"commands":…,"anon_users":…}`).

## 5. Deploy và rollback migration

Thứ tự deploy:

1. `supabase db push` (migration chạy trong transaction; lỗi là rollback toàn bộ migration đó).
2. `supabase functions deploy game-command`.
3. Build và upload frontend.

Migration `20261025000000` và `20261025000100` chỉ `create or replace` hàm (cùng chữ ký, giữ quyền đã cấp), thêm trigger, index và CHECK. CHECK được thêm `NOT VALID` rồi `VALIDATE`: nếu dữ liệu cũ vi phạm, migration dừng và không áp một nửa. Kiểm tra trước trên production:

```sql
select count(*) from public.room_members where seat < 1;
select count(*) from public.games where number < 1 or revision < 0;
select count(*) from public.rooms r join public.games g on g.id = r.current_game_id where g.room_id <> r.id;
```

Rollback (nếu cần): tạo migration mới khôi phục định nghĩa hàm từ `20261024000000_ghostwolf_schema.sql` (create_room, join_room, host_add_member, create_game, commit_game), rồi `drop trigger rooms_current_game_guard on public.rooms`, `drop trigger assignments_room_guard on public.assignments`, `alter table … drop constraint …` cho ba CHECK, `drop function public.gw_cleanup(int, int, int)`. Không sửa migration đã áp dụng. Frontend và Edge Function mới tương thích với schema cũ, trừ việc mất các mã lỗi mới.

## 6. Việc còn lại

- CAPTCHA cho anonymous sign-in ở frontend.
- Khôi phục quyền quản trò khi đổi/mất thiết bị (FE-02) — xem đề xuất trong báo cáo audit.
- Presence: key do client đặt, chỉ dùng để hiển thị online (RT-03). Muốn tin cậy được cần heartbeat qua RPC.
