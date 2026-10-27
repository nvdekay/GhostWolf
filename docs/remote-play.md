# Hướng dẫn chơi từ xa

## Chuẩn bị

Quản trò chọn **Tạo ván mới → Quản trò → Từ xa**, cấu hình thời gian rồi gửi link hoặc mã
phòng. Mỗi người mở link trên thiết bị riêng, nhập tên và bấm **Sẵn sàng**. Server chỉ cho chốt
phòng khi tất cả người dùng thiết bị đã ready.

Một tài khoản chỉ có một tab điều khiển. Tab/thiết bị mở sau sẽ giành quyền; tab cũ chuyển sang
thông báo an toàn và không thể gửi lệnh.

## Trong ván

1. Quản trò chọn bộ vai, chia và gửi vai. Mỗi người tự mở thẻ và xác nhận đã nhớ.
2. Ban đêm, mọi người thấy màn chờ trung tính; đúng actor mới nhận prompt riêng. Lựa chọn chỉ có
   hiệu lực khi hiện “Đã ghi nhận”. Có thể cập nhật trước deadline.
3. Bầy Sói chat trong kênh kín chỉ ở bước Sói. Hòa lựa chọn thì không cắn ai.
4. Tiên tri giữ kết quả trong **Sổ riêng**; Cặp đôi, đồng đội Sói và trạng thái bị mê hoặc được
   gửi riêng, không nằm trong public state.
5. Ban ngày, chat chỉ mở cho người còn sống trong phase thảo luận. Khi vote bắt đầu, chat khóa.
6. Mỗi người còn quyền bầu gửi một ứng viên hoặc phiếu trắng. Chỉ tổng phiếu được công khai sau
   khi host khóa; phiếu Trưởng làng được server cộng trọng số.
7. Người chết chỉ đọc trạng thái/chat công khai và không còn quyền hành động, vote hay chat Sói.

## Mất mạng và quá hạn

Refresh hoặc reconnect sẽ dựng lại phase, prompt, lựa chọn đã gửi và lịch sử chat từ server.
Deadline dùng giờ server; timer trên trình duyệt chỉ để hiển thị. Host có thể gia hạn 30 giây hoặc
ghi nhận bỏ lượt hộ người mất kết nối. Các thao tác này đều có audit log.

## Riêng tư

Vai, prompt, submission, kết quả soi và chat Sói được bảo vệ bằng RLS; UI không nhận dữ liệu rồi
che bằng CSS. Chat Sói chỉ được công khai sau khi kết thúc nếu phòng bật tùy chọn tương ứng.
Chat của phòng đã đóng được xóa theo lịch retention 30 ngày.
