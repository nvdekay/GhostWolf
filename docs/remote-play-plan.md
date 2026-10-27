# Kế hoạch chế độ chơi từ xa cho Ghostwolf

> Trạng thái ngày 2026-10-27: MVP kỹ thuật (baseline `703c8df`) đã triển khai lên production
> từ `main`, migrations và hai Edge Function đã hoạt động, toàn bộ kiểm thử tự động và smoke
> test production đã qua. Giai đoạn 0–3 đã hoàn thành; phần kỹ thuật của Giai đoạn 4 đã xong.
> Closed beta/manual game session trên thiết bị và mạng thật vẫn là cổng nghiệm thu cuối.
>
> Mục tiêu: cho phép mọi người ở các địa điểm khác nhau chơi một ván Ghostwolf hoàn
> chỉnh chỉ bằng trình duyệt và kết nối Internet, không cần gọi thoại hoặc ứng dụng chat
> bên ngoài.

## 0. Trạng thái triển khai hiện tại

| Hạng mục                             | Trạng thái      | Bằng chứng                                                              |
| ------------------------------------ | --------------- | ----------------------------------------------------------------------- |
| Giai đoạn 0 — Thiết kế/regression    | Hoàn thành      | Contracts, room mode, migrations/RLS và regression local mode đã merge  |
| Giai đoạn 1 — Room/chat công khai    | Hoàn thành      | Ready check, chat, moderation, pagination, reconnect và rate limit      |
| Giai đoạn 2 — Prompt/hành động đêm   | Hoàn thành      | Toàn bộ vai chuẩn, chat Sói, timeout, thao tác hộ và private view       |
| Giai đoạn 3 — Discussion/vote/effect | Hoàn thành      | Timer, vote kín, hòa/bầu lại, hiệu ứng, kết quả và replay               |
| Giai đoạn 4 — Hardening/beta         | Đang nghiệm thu | Hardening tự động đã xong; closed beta và chỉ số thực tế chưa thực hiện |

Snapshot phát hành:

- `main` chứa toàn bộ implementation qua commit
  `703c8dfd67b57a934c16ee4dd97a472a179e3505`; local và remote đã được đồng bộ trước bản cập
  nhật tài liệu này.
- Supabase project `ztyefvgplgafhfukmkxh` đã áp dụng đủ bốn migration Remote Play
  `20261027000000`–`20261027030000`.
- Edge Function `game-command` và `player-command` đang active trên Supabase hosted.
- Vercel nối GitHub branch `main`; bản production chứa baseline trên đã được xác minh và đang
  phục vụ tại `https://ghostwolf.khanhnvd.click`.
- Xác minh phát hành: typecheck, lint, build, Deno check, 63 unit tests, 47 integration tests,
  9 E2E scenarios và smoke test hai browser context trên production đều pass.

Trạng thái này chỉ xác nhận code và hạ tầng đã phát hành. CAPTCHA, lịch cleanup, alerting,
kiểm thử thiết bị thật và closed beta được theo dõi riêng ở các mục 19, 20 và 23.

## 1. Tóm tắt quyết định

Ghostwolf sẽ hỗ trợ hai chế độ độc lập:

1. **Chơi cùng phòng**: giữ nguyên trải nghiệm hiện tại. Quản trò điều hành trên một máy,
   người chơi chủ yếu dùng điện thoại để nhận vai.
2. **Chơi từ xa**: mỗi người dùng thiết bị riêng, tự thực hiện hành động bí mật, thảo luận
   bằng chat chữ và bỏ phiếu trong ứng dụng.

Chế độ từ xa ở phiên bản đầu có các quyết định sản phẩm sau:

- Không tích hợp gọi thoại hoặc video.
- Không yêu cầu Wi-Fi; Wi-Fi, mạng dây hoặc 4G/5G đều được, miễn có Internet.
- Chat chữ tự do trong ứng dụng là phương tiện thảo luận chính.
- Ván chơi diễn ra đồng bộ: mọi người nên online cùng lúc.
- Có một quản trò riêng, không tham gia với tư cách người chơi.
- Người chơi tự gửi hành động đêm và phiếu bầu từ thiết bị của mình.
- Quản trò kiểm soát nhịp ván, xử lý ngoại lệ và có thể thao tác hộ người mất kết nối.
- Backend vẫn là nguồn dữ liệu có thẩm quyền; client không tự quyết định kết quả.
- Mọi dữ liệu bí mật phải được giới hạn bằng xác thực và RLS, không chỉ ẩn bằng UI.

## 2. Vì sao cần một chế độ riêng

Luồng hiện tại được thiết kế cho nhóm ngồi cạnh nhau:

- Quản trò nhìn cử chỉ của người chơi rồi nhập hành động đêm.
- Quản trò tự đếm phiếu ban ngày.
- Thảo luận diễn ra ngoài ứng dụng.
- Người chơi chủ yếu nhận vai và xem trạng thái công khai.
- Chỉ quản trò được gửi command làm thay đổi ván.

Khi chơi từ xa, các giả định trên không còn đúng. Ứng dụng cần đảm nhiệm thêm bốn vai trò:

1. Kênh thảo luận công khai bằng chữ.
2. Giao diện hành động bí mật cho từng người.
3. Hệ thống thu và chốt phiếu bầu.
4. Điều phối lượt, thời hạn, reconnect và các trường hợp mất kết nối.

Không nên thay thế luồng hiện tại bằng luồng mới. Hai chế độ dùng chung engine luật nhưng có
cách điều phối và UI khác nhau.

## 3. Mục tiêu và ngoài phạm vi

### 3.1. Mục tiêu MVP

- Một nhóm 4–30 người có thể hoàn thành ván khi mỗi người ở một địa điểm.
- Không cần Discord, Meet, Zalo hoặc cuộc gọi bên ngoài.
- Tất cả người chơi có thể chat, hành động và bỏ phiếu trên điện thoại hoặc máy tính.
- Không lộ vai, kết quả soi, mục tiêu đêm hoặc chat Sói cho người không có quyền.
- Refresh trang hoặc mất mạng ngắn không làm mất ghế hay mất tiến trình.
- Command gửi lại không bị xử lý hai lần.
- Quản trò có công cụ xử lý người AFK, mất kết nối và hành động quá hạn.
- Chế độ cùng phòng hiện tại tiếp tục hoạt động như trước.

### 3.2. Ngoài phạm vi MVP

- Gọi thoại/video tích hợp.
- Matchmaking với người lạ.
- Quản trò đồng thời là người chơi.
- Bot tự chơi thay người.
- Tin nhắn riêng 1–1.
- Gửi ảnh, file, GIF hoặc link trong chat.
- Ván bất đồng bộ kéo dài nhiều giờ hoặc nhiều ngày.
- Xếp hạng, thành tích và hệ thống bạn bè.
- Mã hóa đầu-cuối cho chat.

## 4. Nguyên tắc thiết kế

### 4.1. Server-authoritative

Client chỉ gửi ý định. Server phải kiểm tra danh tính, trạng thái sống/chết, phase hiện tại,
vai, mục tiêu, deadline và revision trước khi chấp nhận hành động.

### 4.2. Không suy ra bí mật từ UI hoặc timing

- Không gửi dữ liệu thừa rồi chỉ dùng CSS để che.
- Người không có lượt chỉ thấy trạng thái chờ trung tính.
- Không hiển thị tên vai đang được gọi cho toàn phòng.
- Các bước không có người hành động vẫn cần thời lượng hoặc chuyển trạng thái khó suy đoán.
- Typing indicator của kênh bí mật không được phát sang kênh công khai.

### 4.3. Reconnect là luồng bình thường

Mọi màn hình phải có thể được dựng lại từ snapshot server. Không phụ thuộc state tạm chỉ có
trong React để biết người dùng đang ở bước nào.

### 4.4. Xác nhận rõ trước hành động không thể sửa

UI phải phân biệt:

- Đang chọn.
- Đang gửi.
- Server đã nhận.
- Đã khóa, không thể đổi.
- Gửi thất bại hoặc hết hạn.

### 4.5. Quản trò có quyền điều phối, không âm thầm sửa lịch sử

Mọi thao tác hộ, bỏ qua lượt, sửa kết quả hoặc loại thủ công đều phải được ghi audit log.

## 5. Vai trò người dùng

### Quản trò

- Tạo phòng và chọn chế độ từ xa.
- Cấu hình luật, timer và chính sách timeout.
- Quản lý thành viên, bắt đầu/kết thúc phase.
- Theo dõi ai đã sẵn sàng, ai đã gửi hành động và ai mất kết nối.
- Không thấy nội dung chat Sói trong lúc ván đang diễn ra, trừ khi cần chế độ debug được
  cảnh báo rõ. Mặc định quản trò chỉ thấy tiến độ.
- Có thể thao tác hộ hoặc bỏ qua lượt của người chơi.
- Xử lý report, mute, kick và đóng phòng.

### Người chơi còn sống

- Xem vai của chính mình.
- Chat trong kênh công khai khi phase cho phép.
- Thực hiện kỹ năng đúng lượt.
- Bỏ phiếu khi còn quyền bầu.
- Nhận thông báo riêng đúng với vai và trạng thái.

### Người chơi đã chết

- Xem trạng thái và chat công khai ở chế độ chỉ đọc.
- Không gửi tin, phản ứng, hành động hoặc bỏ phiếu.
- Không tiếp tục truy cập kênh bí mật của phe cũ.
- Chưa có chat nghĩa địa trong MVP.

## 6. Cấu hình phòng từ xa

Khi tạo phòng, quản trò chọn `Chơi từ xa`. Cấu hình đề xuất:

| Thiết lập                      | Mặc định | Mô tả                                         |
| ------------------------------ | -------- | --------------------------------------------- |
| Thời gian thảo luận            | 5 phút   | Có thể gia hạn khi đang chơi                  |
| Thời gian hành động đêm        | 45 giây  | Áp dụng cho mỗi bước                          |
| Thời gian bỏ phiếu             | 60 giây  | Hết giờ tính người chưa gửi là trắng          |
| Đổi phiếu trước deadline       | Bật      | Phiếu cuối cùng trước khi khóa có hiệu lực    |
| Công khai ai bầu ai            | Tắt      | Mặc định chỉ công khai tổng phiếu             |
| Tự chuyển khi mọi người đã gửi | Tắt      | Mặc định chờ quản trò xác nhận                |
| Chat Sói sau khi chết          | Tắt      | Sói chết mất quyền truy cập ngay              |
| Công khai chat Sói sau trận    | Bật      | Có thể tắt vì lý do riêng tư                  |
| Timeout hành động đêm          | Bỏ lượt  | Không tự tiêu tài nguyên hoặc chọn ngẫu nhiên |

Các rule gameplay hiện có như Trưởng làng, công khai vai khi chết, Phù thủy tự cứu và gọi
vai đã chết tiếp tục giữ trong `RuleOptions`.

## 7. Luồng đầy đủ của một ván

### 7.1. Tạo và tham gia phòng

1. Quản trò chọn `Tạo phòng` → `Chơi từ xa`.
2. Cấu hình tên phòng, luật và timer.
3. Hệ thống tạo link mời và mã sáu ký tự.
4. Người chơi mở link, đăng nhập ẩn danh và nhập tên.
5. Mỗi tài khoản chỉ có một membership đang hoạt động trong phòng.
6. Nếu cùng tài khoản mở tab thứ hai, tab mới nhận quyền điều khiển hoặc yêu cầu xác nhận;
   không để hai tab gửi hai lựa chọn khác nhau mà không cảnh báo.

### 7.2. Lobby và ready check

Mỗi người thấy:

- Danh sách người chơi.
- Online/offline.
- Trạng thái sẵn sàng.
- Chat lobby.
- Luật và timer của phòng.
- Nút `Sẵn sàng`.

Quản trò thấy thêm:

- Người chưa sẵn sàng.
- Người có kết nối chập chờn.
- Nút kick, khóa phòng và bắt đầu.
- Cảnh báo nếu chưa đủ số người tối thiểu.

Khi khóa phòng, không nhận thêm người mới trừ khi quản trò mở khóa.

### 7.3. Chia và xác nhận vai

1. Quản trò chọn bộ vai rồi chia.
2. Mỗi người nhận assignment của chính mình.
3. Người chơi giữ nút để mở thẻ vai, đọc kỹ năng và điều kiện thắng.
4. Người chơi bấm `Tôi đã hiểu vai`.
5. Quản trò chỉ thấy trạng thái đã nhận/đã xác nhận, không phụ thuộc client tự báo thành công.
6. Khi tất cả đã xác nhận, quản trò bắt đầu ván.

Nếu một người không xác nhận, quản trò có thể chờ, gửi nhắc, loại khỏi phòng hoặc chia lại.

### 7.4. Ban đêm

Khi bắt đầu đêm:

- Chat công khai bị khóa.
- Tất cả người chơi nhận màn hình `Ngôi làng đang ngủ`.
- Chỉ người có prompt hợp lệ thấy giao diện hành động.
- Quản trò thấy tên bước, deadline, số người cần phản hồi và tiến độ; không cần biết lựa chọn
  trước khi bước được chốt nếu không phục vụ xử lý luật.

Luồng mỗi bước:

1. Server mở prompt cho đúng actor.
2. Client nhận prompt qua snapshot/Realtime.
3. Người chơi chọn nháp trên thiết bị.
4. Người chơi bấm xác nhận.
5. Server kiểm tra và lưu lựa chọn.
6. Người chơi có thể sửa trước deadline nếu luật cho phép.
7. Khi khóa bước, server tổng hợp và chuyển engine sang bước kế tiếp.
8. Nếu hết giờ, áp dụng chính sách timeout và ghi audit event.

#### Cupid

- Chọn đúng hai người khác nhau trong Đêm 1.
- Hai người được ghép nhận thông báo riêng về danh tính người còn lại.
- Hai người không tự động biết vai của nhau.
- Không có chat Cặp đôi trong MVP.

#### Bảo vệ

- Chọn một người hoặc bỏ lượt.
- UI vô hiệu hóa người đã bảo vệ đêm trước.
- Người được bảo vệ không nhận thông báo.

#### Bầy Sói

- Thành viên bầy còn sống được vào kênh chat `wolves` trong bước của Sói.
- Danh sách mục tiêu không gồm thành viên bầy.
- Mỗi Sói có thể chọn và đổi mục tiêu trước khi khóa.
- UI hiển thị tổng số lựa chọn theo mục tiêu, không bắt buộc lộ ai chọn ai.
- Nếu có một mục tiêu dẫn đầu khi hết giờ, mục tiêu đó được chọn.
- Nếu hòa, mở thêm một khoảng ngắn. Nếu vẫn hòa, mặc định không cắn ai hoặc chuyển cho
  quản trò quyết định; MVP nên chọn `không cắn ai` để tránh quyền tùy ý ẩn.
- Chat Sói bị khóa khi bước kết thúc.

#### Sói trắng

- Cùng tham gia chat và lựa chọn của bầy như một thành viên bầy.
- Ở đêm chẵn nhận prompt riêng để chọn một thành viên bầy khác hoặc bỏ lượt.
- Prompt riêng không được lộ cho các Sói khác.

#### Phù thủy

- Thấy người đang bị bầy Sói chọn, nếu có.
- Chọn dùng bình cứu, bình độc hoặc không dùng.
- Hiển thị rõ bình nào còn lại.
- Timeout mặc định không dùng bình.
- Kết quả chỉ được áp dụng/công bố khi kết thúc đêm.

#### Tiên tri

- Chọn một người hợp lệ.
- Nhận kết quả riêng từ server.
- Phải bấm `Đã xem, đi ngủ`.
- Kết quả được lưu vào sổ riêng của Tiên tri để xem lại trong các ngày sau.

#### Người thổi sáo

- Chọn tối đa hai mục tiêu hợp lệ theo engine.
- Người bị mê hoặc có thể nhận thông báo riêng sau khi bước được chốt nếu luật yêu cầu.

#### Vai tùy chỉnh

MVP vẫn để quản trò xử lý thủ công. Giai đoạn sau có thể thêm schema hành động cho vai tùy
chỉnh: chọn một người, nhiều người, có/không hoặc nhập ghi chú.

### 7.5. Xem trước và công bố trời sáng

1. Sau bước đêm cuối, engine tính kết quả dự kiến.
2. Quản trò xem danh sách hậu quả và hiệu ứng đang chờ.
3. Quản trò có thể hoàn tác bước gần nhất nếu phát hiện lỗi.
4. Quản trò bấm `Trời sáng`.
5. Server đồng thời công bố người chết, vai được phép lộ và log công khai.
6. Chat công khai mở cho người còn sống sau khi các hiệu ứng bắt buộc được xử lý.

Không gửi thông báo chết sớm tới riêng nạn nhân trước lúc công bố.

### 7.6. Thảo luận ban ngày

Màn hình gồm:

- Chat công khai.
- Danh sách người sống/chết và trạng thái online.
- Đồng hồ thảo luận.
- Nhật ký công khai.
- Nút trả lời, nhắc tên và phản ứng nhanh.
- Nút `Nghi ngờ` trên từng người để hỗ trợ đề cử, không thay thế chat tự do.

Quản trò có thể bắt đầu, tạm dừng hoặc gia hạn timer; khóa chat; xóa tin vi phạm; mute tạm
thời; hoặc chuyển sang bỏ phiếu.

### 7.7. Bỏ phiếu

1. Quản trò mở phase bỏ phiếu.
2. Chat công khai bị khóa.
3. Mỗi người còn sống và còn quyền bầu chọn một ứng viên hoặc phiếu trắng.
4. Client chỉ hiển thị tiến độ như `7/9 người đã bỏ phiếu`.
5. Người chơi có thể đổi phiếu trước deadline nếu phòng cho phép.
6. Phiếu chỉ hợp lệ khi server trả xác nhận.
7. Khi tất cả đã gửi hoặc hết giờ, server khóa phiếu.
8. Engine cộng trọng số Trưởng làng và tạo kết quả.
9. Quản trò công bố kết quả.

Khi hòa:

- Quản trò có thể mở thảo luận ngắn.
- Vòng bầu lại chỉ gồm những người hòa.
- Hoặc chọn không loại ai.
- Nếu luật cho quản trò quyết định người bị loại, bắt buộc nhập lý do và công khai trong log.

### 7.8. Hiệu ứng sau loại

- Thợ săn nhận prompt bắn hoặc không bắn.
- Trưởng làng chết nhận prompt chọn người kế nhiệm.
- Cả phòng ở trạng thái chờ trung tính.
- Hiệu ứng xử lý lần lượt theo queue hiện có.
- Chỉ xét thắng sau khi queue rỗng.

### 7.9. Người chết

Ngay khi trạng thái chết được công bố:

- Thu hồi quyền gửi chat công khai.
- Thu hồi quyền vào chat Sói và các kênh bí mật.
- Thu hồi quyền hành động và bỏ phiếu.
- Giữ quyền đọc trạng thái công khai và chat chung.
- Nếu được hồi sinh do quản trò sửa nhầm, server cấp lại quyền theo trạng thái mới.

### 7.10. Kết thúc ván

- Công bố phe thắng, vai và người thắng.
- Mở chat chung cho tất cả người trong phòng.
- Hiển thị timeline hành động và bỏ phiếu phù hợp với cấu hình riêng tư.
- Nếu bật, công khai lịch sử chat Sói sau khi ván đã kết thúc.
- Cho phép chơi lại với cùng nhóm và bộ vai.

## 8. Quy tắc chat

### 8.1. Các channel

| Channel     | Người đọc             | Người gửi             | Khi hoạt động                  |
| ----------- | --------------------- | --------------------- | ------------------------------ |
| `lobby`     | Thành viên phòng      | Thành viên phòng      | Trước khi bắt đầu              |
| `public`    | Mọi thành viên        | Người sống + quản trò | Thảo luận ban ngày và sau trận |
| `wolves`    | Sói còn sống đủ quyền | Sói còn sống đủ quyền | Bước hành động của bầy         |
| `system`    | Tùy phạm vi sự kiện   | Chỉ server            | Mọi phase                      |
| `moderator` | Mọi thành viên        | Chỉ quản trò/server   | Khi cần thông báo              |

Không có direct message và chat nghĩa địa trong MVP.

### 8.2. Hành vi tin nhắn

- Tối đa 500 ký tự.
- Text thuần; không HTML, Markdown tùy ý, ảnh, file hoặc preview link.
- Hỗ trợ reply một cấp và mention thành viên.
- Không sửa tin đã gửi.
- Có thể tự xóa trong thời gian ngắn nếu sản phẩm cần; bản ghi moderation vẫn giữ metadata.
- Tin nhắn dùng cursor pagination, không tải toàn bộ lịch sử một lần.
- Client tạo `client_message_id` để retry không tạo tin trùng.
- UI phải hiện `đang gửi`, `đã gửi`, `gửi thất bại`.

### 8.3. Chống spam và moderation

- Giới hạn đề xuất: 5 tin/10 giây và 30 tin/phút/người.
- Cooldown tăng dần khi vi phạm.
- Quản trò có thể mute đến một thời điểm, xóa tin, kick và đóng phòng.
- Nội dung bị xóa được thay bằng placeholder thay vì làm đứt luồng reply.
- Ghi `moderation_events` cho thao tác của quản trò.
- Không ghi nội dung chat vào application logs hoặc Edge Function logs.

### 8.4. Realtime

- Tin mới được đẩy qua Supabase Realtime.
- Khi reconnect, client đọc lại từ message cursor cuối cùng rồi mới tiếp tục nghe realtime.
- Presence chỉ dùng hiển thị online, không dùng để quyết định quyền gửi.
- Typing indicator là sự kiện tạm thời, không lưu DB và có thể bỏ khỏi MVP.

## 9. State machine đề xuất

Trạng thái điều phối từ xa chi tiết hơn `GameStatus` hiện tại:

```text
LOBBY
  -> ROLE_REVEAL
  -> ROLE_CONFIRMATION
  -> NIGHT_STARTING
  -> NIGHT_ACTION (lặp theo step)
  -> NIGHT_REVIEW
  -> DAY_ANNOUNCEMENT
  -> EFFECT_RESOLUTION (nếu có)
  -> DAY_DISCUSSION
  -> DAY_VOTING
  -> VOTE_RESULT
  -> EFFECT_RESOLUTION (nếu có)
  -> NIGHT_STARTING
  -> ...
  -> GAME_RESULT
```

Mỗi phase cần tối thiểu:

```ts
interface RemotePhase {
  kind: string
  sequence: number
  startedAt: string
  deadline: string | null
  lockedAt: string | null
  requiredActors: string[]
  submittedActors: string[]
  timeoutPolicy: string
}
```

Không nhất thiết công khai `requiredActors`, vì danh sách đó có thể làm lộ vai. `public_state`
chỉ nên chứa tên phase chung, deadline và số người đã phản hồi đã được làm mờ nếu cần.

## 10. Xử lý mất kết nối

### 10.1. Trạng thái kết nối

- `online`: đang có presence hợp lệ.
- `reconnecting`: client vừa mất kênh trong khoảng grace period.
- `offline`: quá grace period.
- `afk`: không phản hồi nhiều deadline liên tiếp, do server đánh dấu.

Presence là gợi ý giao diện. Server không tự coi một người chết, bỏ lượt hoặc mất quyền chỉ
vì presence biến mất.

### 10.2. Khi reconnect

1. Khôi phục Supabase session.
2. Tải room, membership, game public view và private view của chính mình.
3. Tải tin nhắn sau cursor cuối.
4. Nếu prompt còn mở, dựng lại lựa chọn đã gửi và deadline.
5. Nếu prompt đã đóng, hiển thị kết quả `đã ghi nhận` hoặc `đã quá hạn`.
6. Subscribe Realtime sau snapshot và refresh lại khi subscription sẵn sàng, giống nguyên tắc
   hiện có của `RoomStore`.

### 10.3. Chính sách timeout

| Tình huống           | Mặc định                         |
| -------------------- | -------------------------------- |
| Kỹ năng tùy chọn     | Bỏ lượt                          |
| Bình Phù thủy        | Không dùng                       |
| Sói hòa phiếu        | Không cắn ai sau khoảng phụ      |
| Phiếu ban ngày       | Phiếu trắng                      |
| Thợ săn              | Không bắn                        |
| Kế nhiệm Trưởng làng | Không chỉ định                   |
| Xác nhận vai         | Không tự bắt đầu; quản trò xử lý |

Quản trò có thể gia hạn hoặc thao tác hộ. Mọi thao tác hộ phải ghi người thực hiện, lý do và
thời điểm.

## 11. Mô hình dữ liệu dự kiến

Tên bảng dưới đây là đề xuất và có thể điều chỉnh trong thiết kế migration.

### 11.1. `room_settings`

Có thể tiếp tục lưu trong `rooms.options`, nhưng nên tách kiểu rõ ràng ở TypeScript:

- `mode`: `local | remote`
- `discussion_seconds`
- `night_action_seconds`
- `vote_seconds`
- `allow_vote_change`
- `reveal_individual_votes`
- `auto_advance`
- `reveal_wolf_chat_after_game`
- `timeout_policies`

### 11.2. `game_prompts`

Prompt riêng được server tạo cho từng actor:

- `id`
- `game_id`
- `member_id`
- `phase_sequence`
- `kind`
- `payload` — chỉ dữ liệu người đó được phép biết
- `status`: `open | submitted | locked | expired | cancelled`
- `deadline`
- `created_at`, `submitted_at`, `locked_at`

RLS: quản trò và đúng chủ prompt được đọc; client không được tự tạo hoặc sửa trực tiếp.

### 11.3. `game_action_submissions`

- `prompt_id`
- `member_id`
- `client_action_id`
- `payload`
- `revision`
- `submitted_at`

Unique key chống gửi trùng. Chỉ Edge Function/RPC đã xác thực được ghi. Người chơi có thể đọc
lựa chọn hiện tại của chính mình; không đọc lựa chọn của người khác.

### 11.4. `chat_messages`

- `id`
- `room_id`
- `game_id` nullable cho lobby
- `channel`
- `sender_member_id` nullable cho system
- `client_message_id`
- `reply_to_id` nullable
- `body`
- `day`, `phase_sequence`
- `created_at`
- `deleted_at`, `deleted_by`

`sender_member_id` phải được suy ra từ JWT/membership ở server, không nhận tin cậy từ body.

### 11.5. `chat_channel_memberships`

Bảng projection quyền đọc channel bí mật:

- `game_id`
- `channel`
- `member_id`
- `can_read`
- `can_write`
- `valid_from_sequence`
- `valid_until_sequence`

Service role cập nhật bảng này cùng lúc với phase/death changes. RLS của `chat_messages` dựa
trên projection này thay vì để client tự khai vai. Khi một Sói chết, quyền channel phải bị thu
hồi ngay trong cùng transaction commit state.

### 11.6. `moderation_events`

- `room_id`, `game_id`
- `actor_user_id`
- `target_member_id`
- `kind`: `mute | unmute | delete_message | kick | act_for_player | extend_deadline`
- `reason`
- `metadata` đã lọc bí mật
- `created_at`

## 12. API và command

### 12.1. Giữ command quản trò hiện tại

Các command engine như `night.end`, `day.goto`, `vote.eliminate`, `effect.resolve`, `undo` và
`finish` tiếp tục đi qua Edge Function có kiểm tra quyền host.

### 12.2. Thêm command người chơi

Đề xuất contract:

```ts
type PlayerCommand =
  | { type: 'player.ready'; ready: boolean }
  | { type: 'player.ackRole' }
  | { type: 'action.submit'; promptId: string; payload: unknown }
  | { type: 'action.lock'; promptId: string }
  | { type: 'vote.submit'; candidateId: string | null }
  | { type: 'chat.send'; channel: 'lobby' | 'public' | 'wolves'; body: string; replyTo?: string }
  | { type: 'chat.delete'; messageId: string }
```

Mỗi request cần:

- `commandId`/`clientMessageId` để idempotency.
- Game/room id.
- Phase sequence hoặc expected revision.
- JWT; membership lấy từ `auth.uid()`.

Không nhận `memberId`, `roleId`, `alive` hoặc `team` từ client làm nguồn thẩm quyền.

### 12.3. Edge Function

Có hai lựa chọn:

1. Mở rộng `game-command` để phân nhánh host/player.
2. Tạo `player-command` riêng và chia sẻ parser, auth, error mapping, logging.

Khuyến nghị MVP: tạo `player-command` riêng để giữ bề mặt quyền quản trò nhỏ và dễ audit.
Hai function dùng chung module xác thực, idempotency và orchestration.

### 12.4. Tích hợp engine

Engine hiện xử lý một hành động đã được quản trò tổng hợp. Chế độ remote cần một lớp
orchestrator trước engine:

```text
Player submissions
  -> validate quyền và deadline
  -> lưu pending submissions
  -> đủ điều kiện khóa bước
  -> orchestrator tổng hợp thành engine Command
  -> applyCommand
  -> commit_game transaction
  -> tạo prompt/channel projection cho bước kế tiếp
```

Không đưa logic Realtime, database hoặc timer vào engine thuần. Engine vẫn chịu trách nhiệm
kiểm tra luật và tạo trạng thái kế tiếp.

## 13. Public view và private view

Nên chuẩn hóa ba lớp dữ liệu:

1. **Public view**: phase chung, deadline, người sống/chết, log công khai và kết quả.
2. **Host view**: toàn bộ state engine, progress và công cụ điều phối.
3. **Player private view**: assignment, prompt, submission và inbox chỉ của người đó.

Player private view có thể gồm:

```ts
interface PlayerPrivateView {
  assignment: AssignmentRow | null
  prompt: PlayerPrompt | null
  submission: PlayerSubmission | null
  privateNotices: PrivateNotice[]
  notebook: PrivateKnowledge[]
}
```

Ví dụ `PrivateKnowledge`: kết quả soi cũ, danh tính người yêu hoặc đồng đội Sói. Dữ liệu này
không được đặt vào `games.public_state`.

## 14. RLS và bảo mật

Các invariant bắt buộc:

- Người chơi chỉ đọc assignment của mình sau khi vai đã gửi.
- Prompt chỉ đến đúng actor và quản trò.
- Submission chỉ người gửi và backend có quyền đọc.
- Chat `public` chỉ được ghi khi phase mở và người gửi còn sống.
- Chat `wolves` chỉ đúng thành viên bầy còn sống có membership hợp lệ mới đọc/ghi.
- Người chết mất quyền kênh bí mật ngay khi state commit.
- Quản trò moderation phải đúng `rooms.host_id`.
- Client không được ghi trực tiếp vào state game hoặc channel membership.
- Service role chỉ tồn tại trong Edge Function.
- Log hệ thống không ghi JWT, nội dung chat, vai, mục tiêu, phiếu hoặc private payload.
- Rate limit áp dụng theo user, room và IP khi phù hợp.
- Mọi payload được giới hạn kích thước trước khi parse sâu.

Cần có integration tests cố gắng đọc chéo prompt, submission và chat Sói bằng tài khoản không
có quyền. Đây là tiêu chí release, không phải kiểm thử tùy chọn.

## 15. UI/UX cần bổ sung

### Màn quản trò

- Chọn chế độ local/remote.
- Dashboard ready/online/AFK.
- Progress của prompt không làm lộ nội dung.
- Điều khiển timer và phase.
- Hàng đợi yêu cầu thao tác hộ.
- Moderation panel.
- Preview trước công bố sáng và phiếu.
- Audit timeline.

### Màn người chơi

- Lobby và ready.
- Role confirmation.
- Màn chờ trung tính ban đêm.
- Prompt theo vai.
- Chat công khai/Sói.
- Vote composer.
- Private notebook.
- Banner reconnect/offline.
- Trạng thái gửi rõ ràng.

### Responsive và accessibility

- Mobile-first, hỗ trợ chiều rộng 320 px.
- Không dựa duy nhất vào màu để biểu thị sống/chết, online hoặc lựa chọn.
- Focus management khi prompt mở.
- Screen-reader announcement cho phase, deadline và send status.
- Nút hành động tối thiểu 44×44 px.
- Timer không cập nhật live region mỗi giây gây nhiễu.
- Hỗ trợ `prefers-reduced-motion`.

## 16. Timer và công việc phía server

Không nên tin timer của trình duyệt. Deadline lưu ở server và mọi request so sánh với thời gian
server.

MVP có thể dùng mô hình quản trò bấm chuyển bước sau deadline. Tuy nhiên server vẫn phải từ
chối submission quá hạn. Tự động chuyển phase hoàn toàn cần scheduler/queue đáng tin cậy và có
thể triển khai ở giai đoạn sau.

Khi hiển thị timer:

- Server trả `deadline` và `serverNow`.
- Client tính offset để đếm ngược.
- Khi về 0, UI khóa tạm và chờ snapshot server.
- Không tự kết luận kết quả ở client.

## 17. Kế hoạch triển khai theo giai đoạn

### Giai đoạn 0 — Thiết kế và bảo vệ regression

**Trạng thái: hoàn thành.**

- Chốt state machine và command contracts.
- Thêm `mode` vào room options/types.
- Viết test bảo đảm local mode không đổi hành vi.
- Thiết kế migration, RLS và threat model.
- Chốt chính sách Sói hòa phiếu và công khai chat sau trận.

**Hoàn thành khi:** schema/contract được review, unit test engine hiện tại vẫn pass.

### Giai đoạn 1 — Nền tảng room và chat công khai

**Trạng thái: hoàn thành.**

- Remote room config.
- Ready check.
- `chat_messages`, RPC/Edge Function gửi chat và RLS.
- Chat lobby/public qua Realtime, pagination và reconnect.
- Khóa/mở chat theo phase.
- Rate limit và moderation cơ bản.

**Hoàn thành khi:** nhóm ở nhiều mạng khác nhau vào phòng, chat và reconnect an toàn.

### Giai đoạn 2 — Prompt và hành động đêm

**Trạng thái: hoàn thành.**

- Player private view.
- Prompt lifecycle và submission idempotency.
- Cupid, Bảo vệ, Sói, Sói trắng, Phù thủy, Tiên tri và Người thổi sáo.
- Chat Sói với RLS.
- Timeout và thao tác hộ.
- Chuyển submissions thành engine commands.

**Hoàn thành khi:** toàn bộ đêm có thể chạy mà quản trò không nhập lại lựa chọn của người chơi.

### Giai đoạn 3 — Thảo luận, vote và hiệu ứng

**Trạng thái: hoàn thành.**

- Discussion timer.
- Khóa chat khi vote.
- Phiếu riêng, đổi phiếu, trắng, Trưởng làng và bầu lại.
- Prompt Thợ săn/kế nhiệm.
- Dead-player permissions.
- Kết quả và replay.

**Hoàn thành khi:** một ván tiêu chuẩn có thể chơi từ đầu tới cuối hoàn toàn online.

### Giai đoạn 4 — Hardening và beta

**Trạng thái: hoàn thành phần kỹ thuật, chưa hoàn thành closed beta.**

- Multi-device/conflicting tab handling.
- Network throttling và reconnect tests.
- Security audit RLS.
- Load test chat/Realtime ở phòng 30 người.
- Cleanup/retention cho chat, prompt và submissions.
- Monitoring, alert và runbook.
- Closed beta với các nhóm thật.

**Hoàn thành khi:** không có lỗi lộ dữ liệu mức nghiêm trọng và các chỉ số beta đạt mục tiêu.

## 18. Chiến lược kiểm thử

Kết quả baseline đã chốt ngày 2026-10-27:

- `npm run typecheck`, `npm run lint`, `npm run build`: pass.
- `deno check` cho `game-command` và `player-command`: pass.
- `npm test`: 63/63 unit tests pass.
- `npm run test:integration`: 47/47 integration tests pass trên Supabase local.
- `npm run test:e2e`: 9/9 scenarios pass, gồm local full-game, remote full-flow, RLS,
  reconnect, takeover thiết bị, Tiên tri reconnect, tải 30 người và responsive 320–1920 px.
- `npm run test:e2e:captcha`: 1/1 scenario pass; xác minh widget cấp token và anonymous
  sign-in gửi đúng token tới Supabase Auth.
- Production smoke: tạo phòng remote, join, claim thiết bị, ready, chat Realtime, host nhận tin,
  đóng phòng và player nhận trạng thái đóng đều pass.

### Unit tests

- Parser của player commands.
- Validate prompt, target, deadline và state transition.
- Tổng hợp phiếu Sói.
- Vote replace/lock/idempotency.
- Chat phase permissions.
- Timeout policies.
- Projection public/host/player.

### Integration tests

- Người A không đọc assignment, prompt, submission của B.
- Dân làng không đọc chat Sói.
- Sói chết mất quyền đọc/ghi ngay sau commit.
- Người chết không gửi chat/vote/action.
- Tin retry cùng id không tạo bản sao.
- Command revision cũ bị từ chối và client refresh được.
- Realtime chỉ phát row mà RLS cho phép.
- Quản trò của phòng A không moderation phòng B.
- Cleanup không xóa dữ liệu ván đang hoạt động.

### E2E tests

- 1 host + nhiều player: join → ready → role → night → day → vote → result.
- Sói chat và thống nhất mục tiêu.
- Tiên tri reconnect giữa lúc xem kết quả.
- Người chơi mất mạng lúc vote rồi quay lại.
- Host thao tác hộ người timeout.
- Người chết thử chat và bị chặn cả UI lẫn server.
- Refresh tất cả client ở mỗi phase.
- Mobile responsive 320/390 px và desktop.
- Local mode cũ vẫn chạy qua critical flow.

### Manual game sessions

Automated tests không đánh giá được nhịp chat và cảm giác chờ. Cần test thật với ít nhất:

- [ ] Nhóm 6–8 người.
- [ ] Nhóm 12–16 người.
- [ ] Người dùng đồng thời Wi-Fi và 4G/5G.
- [ ] Một người cố tình mất mạng hoặc mở hai tab.
- [ ] Ghi lại lỗi, thời lượng phase, số lần reconnect/thao tác hộ và phản hồi về trạng thái gửi.

## 19. Monitoring và vận hành

Đã có trong bản phát hành:

- Log JSON đã lọc bí mật và `x-request-id` ở cả hai Edge Function.
- RPC metric tổng hợp không chứa payload riêng tư.
- Cleanup/retention RPC `gw_cleanup` và runbook xử lý sự cố.
- Security headers trong `vercel.json` và HTTPS trên domain production.

Chưa cấu hình hoặc chưa xác minh trên production:

- [~] Frontend Turnstile và CAPTCHA E2E đã hoàn thành; cần tạo production widget, đặt site key
  ở Vercel, secret ở Supabase Auth rồi bật enforcement. Anonymous rate limit đã khai báo 30/giờ/IP.
- [~] Migration Supabase Cron, dọn run history và RPC health đã có; cần deploy và xác minh lần
  chạy hosted đầu tiên.
- [~] Synthetic health/cron/expired-prompt alert mỗi giờ qua GitHub Actions đã có; log-based
  alert cho tỷ lệ 5xx, p95, rate-limit và Realtime errors vẫn cần cấu hình Dashboard.
- [ ] Dashboard/báo cáo funnel join → ready → start → finish phục vụ beta.
- [~] Realtime chat production đã smoke test; policy presence private chưa được adversarial test
  trên hosted project.

Theo dõi tối thiểu:

- Số remote rooms được tạo và số ván bắt đầu/kết thúc.
- Tỷ lệ join → ready → start → finish.
- Số reconnect mỗi ván.
- Command error theo code, đặc biệt revision conflict và timeout.
- Độ trễ gửi/nhận chat và hành động.
- Số prompt hết hạn.
- Số thao tác hộ của quản trò.
- Realtime channel errors.
- Rate-limit và moderation events.

Không đưa nội dung chat hoặc dữ liệu bí mật vào metric/log. Dùng request id, room/game id và
error code đã giới hạn để điều tra.

Retention đề xuất:

- Chat phòng đã đóng: xóa sau 30 ngày hoặc sớm hơn theo chính sách riêng tư.
- Prompt/submission của ván kết thúc: xóa cùng lịch sử game theo cleanup policy.
- Moderation metadata: giữ đủ lâu để điều tra nhưng không giữ nội dung quá cần thiết.

## 20. Chỉ số thành công

Các mục tiêu beta ban đầu:

- Ít nhất 80% phòng đã bắt đầu có thể đi tới kết quả.
- Ít hơn 2% player commands thất bại không do validation người dùng.
- Reconnect thành công trong vòng 5 giây ở điều kiện mạng bình thường.
- Không có sự cố đọc chéo vai, prompt hoặc chat bí mật.
- Một ván 12 người không cần quản trò nhập hộ trong điều kiện mọi người online.
- Người mới hiểu trạng thái gửi hành động mà không cần hướng dẫn ngoài ứng dụng.

**Trạng thái:** chưa có dữ liệu nhóm chơi thật để đánh giá các chỉ số này. Automated tests và
production smoke chỉ là điều kiện vào beta, không thay thế số liệu beta.

## 21. Tiêu chí hoàn thành MVP

MVP kỹ thuật được coi là hoàn thành khi; tất cả tiêu chí dưới đây đã đạt ngày 2026-10-27:

- [x] Tạo được phòng remote và mời người qua link/mã.
- [x] Mọi người ready và xác nhận vai độc lập.
- [x] Tất cả vai engine đang hỗ trợ có luồng remote hoặc fallback quản trò được ghi rõ.
- [x] Sói phối hợp bằng chat bí mật và gửi mục tiêu.
- [x] Chat công khai chỉ mở đúng lúc và người chết không thể gửi.
- [x] Vote được gửi, thay đổi, khóa và tính ở server.
- [x] Refresh/mất mạng ngắn không làm mất tiến trình.
- [x] Host xử lý timeout và thao tác hộ có audit.
- [x] RLS integration tests cho dữ liệu bí mật đều pass.
- [x] Unit, integration, E2E hiện có của local mode không regression.
- [x] Tài liệu luật và hướng dẫn người dùng được cập nhật.

Closed beta là cổng phát hành rộng, không còn là hạng mục code của MVP kỹ thuật.

## 22. Các quyết định MVP đã chốt

Quyết định cho MVP: Sói hòa thì không cắn; chat Sói mặc định công khai sau trận; phiếu ban
ngày chỉ công khai tổng; chỉ quản trò xóa tin; thiết bị mới giành quyền điều khiển; chưa gửi
browser notification; người bị mê hoặc nhận thông báo; chat phòng đóng được giữ 30 ngày.

| Quyết định                  | Giá trị MVP                         |
| --------------------------- | ----------------------------------- |
| Sói hòa sau thời gian phụ   | Không cắn ai                        |
| Chat Sói sau trận           | Công khai mặc định, có cấu hình tắt |
| Phiếu ban ngày              | Chỉ công khai tổng sau khi khóa     |
| Xóa tin                     | Chỉ quản trò                        |
| Hai thiết bị cùng tài khoản | Thiết bị mới giành quyền điều khiển |
| Browser notification        | Chưa có trong MVP                   |
| Thông báo người bị mê hoặc  | Có, qua private notice              |
| Retention chat phòng đóng   | 30 ngày                             |

## 23. Kế hoạch còn lại sau khi deploy

Thực hiện theo thứ tự:

1. **Hoàn thiện guardrail production:** frontend CAPTCHA đã xong; tạo Turnstile production
   widget, cấu hình site key/secret, bật enforcement và xác minh không làm hỏng join/reconnect.
2. **Bật vận hành nền:** lập lịch `gw_cleanup`, cấu hình alert và dashboard chỉ số; chạy cleanup
   thử trên bản sao hoặc dữ liệu kiểm thử trước.
3. **Xác minh hosted/thiết bị thật:** adversarial test presence private, hai tab quản trò,
   focus/keyboard accessibility và bàn phím ảo trên iOS/Android.
4. **Closed beta vòng 1:** 6–8 người, mixed Wi-Fi/4G/5G; sửa lỗi blocker và chạy lại bộ test.
5. **Closed beta vòng 2:** 12–16 người, chủ động tạo reconnect/takeover/AFK; thu thập các chỉ
   số ở mục 20.
6. **Cổng phát hành rộng:** chỉ mở rộng khi không có sự cố đọc chéo dữ liệu, tỷ lệ hoàn tất và
   lỗi command đạt mục tiêu; cập nhật checklist bằng bằng chứng beta.

Các backlog không chặn beta: khôi phục quyền quản trò khi mất thiết bị (FE-02), heartbeat
presence đáng tin cậy (RT-03), luật nhiều instance của cùng vai và action schema cho vai tùy
chỉnh.

## 24. Hướng phát triển sau MVP

- Chat nghĩa địa.
- Kênh riêng cho Cặp đôi nếu luật phòng bật.
- Push notification/PWA.
- Chế độ bất đồng bộ.
- Công cụ khai báo action cho vai tùy chỉnh.
- Quản trò cũng tham gia chơi với orchestration tự động.
- Spectator có delay.
- Matchmaking và phòng công khai.
- Replay trực quan theo timeline.
- Voice tích hợp nếu dữ liệu sử dụng chứng minh nhu cầu thực sự.

---

Tài liệu này là nguồn kế hoạch cho chế độ từ xa. Luật cụ thể của engine vẫn lấy
`docs/ruleset.md` và mã trong `supabase/functions/_shared/engine` làm nguồn có thẩm quyền.
