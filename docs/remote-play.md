# Hướng dẫn chơi từ xa

**Chơi từ xa** dành cho nhóm không ngồi cùng một địa điểm: mỗi người có thể ở một nơi khác nhau
và cần thiết bị riêng có Internet. Nếu mọi người ngồi cùng bàn hoặc cùng một địa điểm và muốn
quản trò điều hành chủ yếu trên một máy, hãy chọn **Chơi cùng phòng**.

## Chuẩn bị

Quản trò chọn **Tạo ván mới → Quản trò → Chơi từ xa**, cấu hình thời gian rồi gửi link hoặc mã
phòng. Mỗi người mở link trên thiết bị riêng, nhập tên và bấm **Sẵn sàng**. Server chỉ cho chốt
phòng khi tất cả người dùng thiết bị đã ready.

Một tài khoản chỉ có một tab điều khiển. Tab/thiết bị mở sau sẽ giành quyền; tab cũ chuyển sang
thông báo an toàn và không thể gửi lệnh.

## Trong ván

1. Trong lobby, mọi người có thể bấm **Tham gia voice** để nghe. Mic mặc định tắt; bấm **Bật
   mic** khi muốn nói và **Tắt mic** hoặc **Rời voice** khi cần.
2. Quản trò chọn bộ vai, chia và gửi vai. Mỗi người tự mở thẻ và xác nhận đã nhớ.
3. Ban đêm, mọi người thấy màn chờ trung tính; đúng actor mới nhận prompt riêng. Lựa chọn chỉ có
   hiệu lực khi hiện “Đã ghi nhận”. Có thể cập nhật trước deadline.
4. Bầy Sói có chat chữ và voice kín chỉ ở bước Sói. Quản trò, Dân làng và người ngoài không thể
   đọc signaling hoặc tham gia kênh. Hòa lựa chọn thì không cắn ai.
5. Tiên tri giữ kết quả trong **Sổ riêng**; Cặp đôi, đồng đội Sói và trạng thái bị mê hoặc được
   gửi riêng, không nằm trong public state.
6. Ban ngày, chat chữ/voice chỉ mở trong phase thảo luận. Người chết có thể nghe nhưng không bật
   mic; khi vote bắt đầu, chat và voice khóa.
7. Mỗi người còn quyền bầu gửi một ứng viên hoặc phiếu trắng. Chỉ tổng phiếu được công khai sau
   khi host khóa; phiếu Trưởng làng được server cộng trọng số.
8. Người chết chỉ đọc trạng thái/chat công khai và không còn quyền hành động, vote hay chat Sói.

## Mất mạng và quá hạn

Refresh hoặc reconnect sẽ dựng lại phase, prompt, lựa chọn đã gửi và lịch sử chat từ server.
Deadline dùng giờ server; timer trên trình duyệt chỉ để hiển thị. Host có thể gia hạn 30 giây hoặc
ghi nhận bỏ lượt hộ người mất kết nối. Các thao tác này đều có audit log.

## Riêng tư

Vai, prompt, submission, kết quả soi và chat Sói được bảo vệ bằng RLS; UI không nhận dữ liệu rồi
che bằng CSS. Chat Sói chỉ được công khai sau khi kết thúc nếu phòng bật tùy chọn tương ứng.
Chat của phòng đã đóng được xóa theo lịch retention 30 ngày.

Voice dùng WebRTC P2P và không ghi âm. Database chỉ giữ session/signaling ngắn hạn; mỗi kênh tối
đa 16 người voice đồng thời. Mic luôn bắt đầu ở trạng thái tắt và trình duyệt chỉ xin quyền khi
người dùng chủ động bật mic.
