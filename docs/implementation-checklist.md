# Ghostwolf — checklist triển khai

Nguồn tham chiếu: `GhostWolf.html` (bundle: `__bundler/template` + manifest base64/gzip + component `text/x-dc`).
Trạng thái: `[x]` xong và đã kiểm · `[~]` xong nhưng chưa xác minh đầy đủ (ghi lý do) · `[ ]` chưa làm.

Kiểm thử đã chạy (Supabase local + Edge Function chạy bằng Deno):
`npm test` 38 test engine · `npm run test:integration` 22 test (RLS, lobby, idempotency, revision, realtime, undo/reset/replay, thư viện) · `npm run test:e2e` 4 kịch bản (quản trò + 2 người chơi, kick/mất mạng/đóng phòng, ván 10 người chơi ngẫu nhiên tới kết quả, responsive 360–1920px).

## 0. Kiến trúc

- [x] React + TS strict + Vite, CSS thuần dùng tokens của mock, build static `dist/`.
- [x] Supabase: Postgres + RLS, anonymous auth, Realtime (postgres_changes theo RLS + presence kênh private).
- [x] Game engine TS thuần dùng chung Edge Function và frontend (`supabase/functions/_shared/engine`, alias `@engine`); `deno check` qua.
- [x] Lệnh phòng là RPC `security definer`; lệnh ván qua Edge Function `game-command` → `commit_game` (1 transaction, revision, idempotency).
- [x] Tách UI / domain / services / realtime / session.
- [~] Edge runtime của Supabase CLI không chạy được trên máy kiểm thử (jsr.io trả 403 Cloudflare challenge). Function được chạy bằng Deno trực tiếp với đúng mã nguồn (`npm run functions:serve`). Chưa deploy lên Supabase hosted (không có thông tin dự án).

## 1. Màn hình

- [x] `home`: tạo ván, vào bằng mã, tiếp tục ván từ server (không dùng demo), thư viện, cách chơi (luồng nhiều điện thoại + chuyền máy).
- [x] `choose`, `gmConfig` (Trưởng làng, công bố vai, luật biến thể).
- [x] `lobby`: mã thật, sao chép (có fallback hiện mã/link để tự chọn), chia sẻ URL thật `?join=`, danh sách realtime + online/offline, thêm thủ công, kick, chốt (≥4), mở lại trước khi gửi, đóng phòng.
- [x] `roles`: tìm không dấu, lọc phe, +/-, chi tiết, tổng + phân bố phe, thiếu/thừa/thiếu sói, chặn chia khi sai, điền Dân làng, xóa hết, gợi ý theo số người (không ghi đè khi đã chỉnh), bộ vai lưu server (đặt tên, áp dụng, xóa), vai tùy chỉnh (thêm/sửa/xóa, chặn xóa khi đang dùng), sidebar desktop / bottom sheet mobile.
- [x] `lib`: thư viện + vai tùy chỉnh.
- [x] `assign`: chia ở server (CSPRNG + Fisher–Yates), giấu/hiện, xáo lại trước khi gửi, gửi một lần, tiến độ xem thật, xem trên máy này, xác nhận bắt đầu khi chưa đủ.
- [x] `deal`: handoff trung tính → lật → ẩn → trả máy; cũng mở được từ bàn quản trò cho người chưa xem.
- [x] `join` + máy người chơi: mã/link → tên → chờ → nhận vai thật → lật → ack → theo dõi → kết quả; kick/đóng/rời.
- [x] `board`: dữ liệu thật, vòng (desktop) / lưới (mobile), gọi vai, Phù thủy, Tiên tri, công bố, timer, phiếu, hòa, nhật ký công khai/riêng, màn hình chung, hoàn tác, menu.
- [x] `result`: người thắng (kể cả phe riêng), lý do, vai mọi người, diễn biến, chơi lại, đổi bộ vai, về trang chủ; máy người chơi cũng thấy kết quả.
- [x] Sheet/dialog/toast: chi tiết vai, thêm/sửa vai, chi tiết người, menu, reset, dừng xem vai, kết thúc, xác nhận loại, Thợ săn, kế nhiệm Trưởng làng, chiến thắng, đóng phòng, rời phòng, bắt đầu khi chưa xem đủ.

## 2. Phần mô phỏng của mock đã thay

- [x] Tự thêm tên mẫu bằng interval → người chơi thật qua `join_room` + realtime.
- [x] `sendRoles()` tự đánh dấu đã xem → `ack_role` từ máy người chơi / `host_ack_role` cho người không có điện thoại.
- [x] `playerJoinSim()` + vai random → assignment thật, đọc qua RLS.
- [x] `demoGame()` làm ván lưu mặc định → danh sách phòng/ván thật từ server.
- [x] Mã demo `TRANG6`, “Phòng của Quân”, danh sách cố định → dữ liệu phòng thật.
- [x] Link `trangsoi.vn` → URL thật từ `location.origin`.
- [x] Toast chỉ hiện khi thao tác thành công; lỗi mạng/backend/clipboard có thông báo riêng.
- [x] Thương hiệu “Trăng Sói” → Ghostwolf.

## 3. Engine & luật (`docs/ruleset.md`, `RULESET_VERSION = 1`)

- [x] 11 vai + 2 trạng thái, mô tả khớp engine.
- [x] Năng lực tách riêng: phe thắng / thuộc bầy / kết quả soi / mục tiêu hợp lệ.
- [x] Thứ tự đêm theo mock; chỉ bước của vai có trong ván; gọi vai đã chết không cho hành động.
- [x] Hành động đêm pending, giải quyết lúc sáng; loại thủ công ban đêm công bố lúc sáng.
- [x] Tài nguyên Phù thủy bền vững; Bảo vệ không lặp; Sói trắng lượt riêng đêm chẵn; bầy vẫn cắn khi chỉ còn Sói trắng.
- [x] Nguyên nhân chết riêng; hàng đợi hiệu ứng; Cặp đôi chết theo; không kích hoạt lặp; Thợ săn trúng độc theo cấu hình.
- [x] Thằng ngốc lần đầu bị phiếu: lộ vai, sống, mất quyền bầu.
- [x] Phiếu: người có quyền bầu, trọng số Trưởng làng riêng (không cộng hai lần), chặn vượt tổng, bỏ trắng, hòa (sửa/bầu lại/không loại/quyết định có lý do).
- [x] Thắng theo thứ tự ưu tiên ghi trong ruleset; không chốt khi còn hiệu ứng; sửa các lỗi của mock (Cặp đôi cùng phe, Sói trắng còn sống chặn bầy sói, không còn ai sống).
- [x] Chặn vượt bước, làm lại bước, sửa assignment sau gửi, thao tác sau kết thúc.
- [x] Undo (lịch sử 40 bước ở server), reset Đêm 1, replay tạo ván mới.

## 4. Bảo mật

- [x] RLS mọi bảng; người chơi chỉ đọc assignment của mình sau khi gửi (integration + e2e kiểm phản hồi mạng).
- [x] `game_secrets`, lịch sử, command log: chỉ quản trò / service role; client không ghi trực tiếp bảng ván.
- [x] Không service-role key ở frontend; realtime không gửi `game_secrets` tới người chơi (integration).
- [x] Màn hình chung render từ public state; e2e kiểm không có tên vai trên bàn khi bật. Nhãn hoàn tác chung chung, không chứa mục tiêu.
- [~] Chính sách kênh presence private (`realtime.messages`) chạy được local; chưa kiểm trên Supabase hosted.

## 5. Persistence & đồng bộ

- [x] Lưu sau mỗi lệnh; transaction; idempotency theo commandId (integration); revision chống ghi đè (integration).
- [x] Reconnect: lấy lại snapshot khi (re)subscribe; store có refcount, không tạo kênh trùng khi remount.
- [x] Phân biệt phòng đóng / ván kết thúc / reset / chơi lại; ván cũ giữ nguyên.
- [x] localStorage chỉ cho phiên auth, route đang mở, timer, chế độ màn hình chung. Không cache bí mật.
- [~] Hai tab quản trò cùng lúc: revision conflict được báo và tải lại (integration ở mức API); chưa có e2e hai tab.

## 6. Kiểm thử & bàn giao

- [x] Vitest: chia bài + tần suất, đêm, dây chuyền, Thợ săn, Thằng ngốc, Trưởng làng, phiếu, thắng, reset, public view.
- [x] Integration: RLS, lobby, kick, khóa, reconnect, idempotency, revision, realtime, undo/reset/kết thúc/replay, thư viện.
- [x] Playwright: quản trò + 2 người chơi; kick / mất mạng / đóng phòng; ván 10 người chọn ngẫu nhiên tới khi có kết quả (gồm hiệu ứng Thợ săn và kế nhiệm Trưởng làng); responsive 360/390/768/1024/1440/1920 (không tràn ngang, nút ≥ 32px chiều cao).
- [~] Focus trap + trả focus trong dialog/sheet, hold-to-reveal bằng bàn phím: đã cài đặt, chưa có test tự động.
- [~] Bàn phím ảo che CTA trên điện thoại thật: chưa kiểm trên thiết bị thật.
- [x] typecheck, lint, test, build.
- [x] `.env.example`, README (Supabase, anonymous auth, realtime, deploy).
- [ ] Deploy thật (Supabase hosted + host static): cần thông tin dự án của bạn — các bước ở README.

## 7. Audit bảo mật / luật (2026-10-25)

- [x] RT-01 `create_game` khóa phòng vô điều kiện; nhiều `game.ensure`/`game.replay` đồng thời chỉ tạo một ván (integration, 4 vòng × 8 request).
- [x] SEC-01 Giới hạn số thẻ/vai, tổng thẻ, số loại vai, số phiếu, số người trước khi tạo mảng (unit + integration qua Edge Function).
- [x] RULE-01 Người thổi sáo sống một mình thắng (unit).
- [x] SEC-02 Người bị mời ra không tự vào lại (`KICKED`); người tự rời vẫn vào lại được (integration).
- [x] FE-01 Thẻ vừa lật úp lại khi blur / chuyển tab / pagehide (E2E).
- [x] RT-02 Room store bỏ kết quả của ván cũ về muộn; lỗi query giữ dữ liệu và thử lại (unit, mock Supabase).
- [x] RULE-02 Ngày không quay lại bước trước (unit; tab đã qua bị khóa trên UI).
- [x] DB-01 Trigger `current_game_id` cùng phòng, vai cùng phòng; CHECK seat/number/revision (integration).
- [x] OPS-01 30 người/phòng, 10 phòng mở/quản trò, 60 lệnh/10 giây/ván, `gw_cleanup` (integration). Lịch chạy: `docs/production-hardening.md`.
- [x] P2 Key toast/màn chuyển cảnh, E2E không sleep cố định, vùng chạm 44px, server E2E mới khi CI, log JSON có request ID.
- [~] RT-03 Presence key do client đặt: thành viên giả được key `host`/id người khác (đã tái hiện local). Chỉ dùng hiển thị; đã lọc key lạ. Chưa có heartbeat tin cậy.
- [ ] FE-02 Khôi phục quyền quản trò khi đổi thiết bị: mới có đề xuất thiết kế.
- [ ] Luật cho nhiều Cupid/Phù thủy/Tiên tri…: chưa định nghĩa (ghi chú trong `docs/ruleset.md`).
