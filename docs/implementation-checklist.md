# Ghostwolf — checklist triển khai

Nguồn tham chiếu: `GhostWolf.html` (bundle: `__bundler/template` + manifest base64/gzip + component `text/x-dc`).
Trạng thái: `[ ]` chưa làm · `[x]` xong và đã kiểm · `[~]` xong nhưng chưa xác minh đầy đủ (ghi lý do).

## 0. Kiến trúc

- [ ] Frontend React + TS strict + Vite, CSS thuần dùng tokens của mock, deploy static `dist/`.
- [ ] Supabase: Postgres + RLS, anonymous auth, Realtime (postgres_changes + presence kênh private).
- [ ] Game engine thuần TS, dùng chung cho Edge Function và frontend (`supabase/functions/_shared/engine`, alias `@engine`).
- [ ] Lệnh phòng (tạo/vào/rời/kick/chốt/mở/đóng/ack) là RPC `security definer` trong Postgres.
- [ ] Lệnh ván (chia, gửi, đêm, ngày, phiếu, hiệu ứng, undo, reset, kết thúc, chơi lại) chạy qua Edge Function `game-command` → engine → `commit_game` (1 transaction, revision, idempotency).
- [ ] Tách: UI (`src/features`, `src/components`) · domain (`@engine`) · backend commands (`src/services`) · realtime (`src/realtime`) · session/khôi phục (`src/app/session`).

## 1. Màn hình (đối chiếu mock)

| Màn | Thao tác | Dữ liệu thật |
| --- | --- | --- |
| `home` | Tạo ván, vào phòng bằng mã, tiếp tục ván, thư viện vai, cách chơi | Phòng/membership đang hoạt động của phiên ẩn danh |
| `choose` | Quản trò / Người chơi | — |
| `gmConfig` | Tên ván, Trưởng làng, công bố vai khi loại, luật biến thể | `create_room` |
| `lobby` | Mã thật, sao chép, chia sẻ URL thật, danh sách realtime + online, thêm thủ công, kick, chốt (≥4), mở lại, đóng | `rooms`, `room_members`, presence |
| `roles` | Tìm (không dấu), lọc phe, +/-, chi tiết, tổng + phân bố phe, thiếu/thừa/thiếu sói, điền Dân làng, xóa, preset, gợi ý, lưu/áp dụng bộ vai, vai tùy chỉnh (thêm/sửa/xóa) | `deck.set`, `presets`, `custom_roles` |
| `lib` | Tìm, lọc, chi tiết, vai tùy chỉnh | catalog + `custom_roles` |
| `assign` | Chia (server, CSPRNG), giấu/hiện, xáo lại trước gửi, gửi, tiến độ xem thật, xem trên máy này, bắt đầu (cảnh báo khi chưa đủ) | `deal`, `send`, `assignments.viewed_at` |
| `deal` | Handoff trung tính → lật vai → ẩn → trả máy | assignment của người thủ công |
| `join` | Mã/link → tên → chờ → nhận vai → lật → ack → theo dõi → kết quả; kick/đóng | `join_room`, assignment riêng, `ack_role`, `public_state` |
| `board` | Pha, người sống, ghế vòng (desktop)/grid (mobile), gọi vai, phù thủy, tiên tri, công bố, timer, phiếu, hòa, nhật ký, màn hình chung, hoàn tác, menu | `game_secrets` (host), `public_state` |
| `result` | Phe/người thắng, lý do, vai mọi người, diễn biến, chơi lại, đổi bộ vai, về trang chủ | `public_state.result` |

Sheet/dialog/toast: chi tiết vai, thêm/sửa vai, chi tiết người, menu, reset, dừng chia vai, kết thúc, xác nhận loại, Thợ săn, kế nhiệm Trưởng làng, chiến thắng, đóng phòng, bắt đầu khi chưa xem đủ, bị kick/phòng đóng.

## 2. Phần mô phỏng của mock cần thay

- [ ] `createRoom()` tự thêm tên mẫu bằng interval → người chơi thật qua `join_room` + realtime.
- [ ] `sendRoles()` tự đánh dấu đã xem → ack thật từ máy người chơi.
- [ ] `playerJoinSim()` + vai random trên máy người chơi → assignment thật, đọc qua RLS.
- [ ] `demoGame()` làm ván lưu mặc định → "Tiếp tục ván" từ server.
- [ ] Mã demo `TRANG6`, `Phòng của Quân`, danh sách người cố định → dữ liệu phòng thật.
- [ ] Link `trangsoi.vn/p/…` → URL thật `?join=CODE` từ `location.origin`.
- [ ] Toast "đã sao chép/đã lưu/đã gửi" luôn hiện → chỉ hiện khi thành công, có lỗi/fallback.
- [ ] Thương hiệu "Trăng Sói" → **Ghostwolf** (giữ thiết kế).

## 3. Engine & luật (ruleset có version)

- [ ] Catalog 11 vai + 2 trạng thái, mô tả khớp engine.
- [ ] Năng lực tách riêng: phe thắng, thuộc bầy (cắn), kết quả soi, mục tiêu hợp lệ.
- [ ] Đêm: Cupid (đêm 1) → Bảo vệ → Bầy sói → Sói trắng (đêm chẵn) → Phù thủy → Tiên tri → Người thổi sáo → vai tùy chỉnh; gọi vai đã chết không cho hành động.
- [ ] Hành động đêm là pending, giải quyết lúc trời sáng; không lộ người chết giữa đêm (kể cả loại thủ công ban đêm).
- [ ] Tài nguyên Phù thủy bền vững; Bảo vệ không lặp liên tiếp.
- [ ] Nguyên nhân chết riêng; hàng đợi hiệu ứng (Thợ săn, kế nhiệm Trưởng làng); Cặp đôi chết theo; không kích hoạt lặp.
- [ ] Thằng ngốc lần đầu bị phiếu: lộ vai, sống, mất quyền bầu.
- [ ] Phiếu: người có quyền bầu, trọng số Trưởng làng nhập riêng, chặn vượt tổng, bỏ phiếu trắng, hòa (sửa/bầu lại/không loại/quản trò quyết có lý do).
- [ ] Thắng: thứ tự ưu tiên ghi trong `docs/ruleset.md`; không chốt khi còn hiệu ứng chờ.
- [ ] Command kiểm tra giai đoạn; không vượt bước, không làm lại kỹ năng, không sửa assignment sau gửi, không thao tác sau kết thúc.
- [ ] Undo (lịch sử server), reset Đêm 1 (giữ assignment), replay tạo ván mới.

## 4. Bảo mật

- [ ] RLS mọi bảng; player chỉ đọc assignment của chính mình sau khi gửi.
- [ ] `game_secrets`, lịch sử, command log: chỉ host / service role.
- [ ] Không service-role key ở frontend; realtime dựa trên RLS, kênh presence private.
- [ ] Màn hình chung render từ public state → không rò vai, mục tiêu, tài nguyên, soi, Cặp đôi, nhật ký riêng, label.

## 5. Persistence & đồng bộ

- [ ] Lưu sau mỗi command; transaction; idempotency (command id); revision chống ghi đè.
- [ ] Reconnect: refetch snapshot khi (re)subscribe; subscription có refcount, không trùng.
- [ ] Phân biệt phòng đóng / ván kết thúc / reset / chơi lại.
- [ ] localStorage chỉ cho session auth, timer, nháp phiếu của host; không cache bí mật cả phòng.

## 6. Kiểm thử & bàn giao

- [ ] Vitest: chia bài, đêm, dây chuyền, Thợ săn, Thằng ngốc, Trưởng làng, phiếu, thắng, public view không rò.
- [ ] Integration (Supabase local): RLS, chốt/kick/reconnect, idempotency, revision.
- [ ] Playwright: host + 2 người chơi.
- [ ] Responsive 360/390/768/1024/1440; focus trap dialog; hold-to-reveal touch/keyboard.
- [ ] typecheck, lint, test, build.
- [ ] `.env.example`, README cấu hình Supabase + deploy.
