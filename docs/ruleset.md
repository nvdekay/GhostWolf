# Bộ luật Ghostwolf — phiên bản 1

Nguồn: `supabase/functions/_shared/engine` (`RULESET_VERSION = 1`). Engine chạy ở Edge Function `game-command`; mô tả trong thư viện vai (`catalog.ts`) khớp với luật dưới đây.

## Chu trình

Chia vai → Gửi vai → Đêm 1 → Công bố → Thảo luận → Bỏ phiếu → Kết thúc ngày → Đêm tiếp theo … → Kết quả.

- Không vượt bước: ngày chỉ đi tới bước kế tiếp; chỉ sang đêm khi đã loại người theo phiếu hoặc chọn "không loại ai"; không làm lại bước đêm đã xác nhận (lệnh mang `stepIndex` + tên bước).
- Không sửa bộ vai/xáo lại sau khi gửi; không thao tác sau khi ván kết thúc.
- Còn hiệu ứng chờ (Thợ săn, kế nhiệm Trưởng làng) thì không chuyển bước và không chốt thắng.

## Giới hạn

- Một phòng: 4–30 người. Một bộ vai: tối đa 30 thẻ, mỗi vai tối đa 30, tối đa 64 loại vai.
- Người bị quản trò mời ra không tự vào lại được phòng đó (người tự rời thì được).
- Chưa định nghĩa luật cho nhiều Cupid / Phù thủy / Tiên tri / Bảo vệ / Người thổi sáo / Sói trắng trong cùng ván: engine hiện gọi mỗi vai **một lượt** và Phù thủy dùng **chung một bộ bình**. Nên dùng tối đa 1 cho các vai này.

## Ban đêm

Thứ tự gọi: Cupid (chỉ đêm 1) → Bảo vệ → Bầy sói → Sói trắng (đêm chẵn) → Phù thủy → Tiên tri → Người thổi sáo → vai tùy chỉnh có "thức dậy ban đêm". Chỉ tạo bước cho vai có trong ván.

Lựa chọn trong đêm là hành động chờ; hậu quả áp dụng và công bố lúc trời sáng (kể cả quản trò loại thủ công ban đêm).

| Vai            | Luật                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Cupid          | Chọn đúng 2 người khác nhau. Một người trong Cặp đôi bị loại thì người kia bị loại theo (nguyên nhân: Cặp đôi).         |
| Bảo vệ         | Chọn 0–1 người, được tự bảo vệ, không chọn cùng người hai đêm liền. Chỉ chặn bầy sói cắn.                               |
| Bầy sói        | Thành viên bầy: Ma sói, Sói trắng và vai tùy chỉnh phe Sói. Chọn 1 người ngoài bầy. Bầy vẫn cắn khi chỉ còn Sói trắng.  |
| Sói trắng      | Đêm chẵn có lượt riêng: chọn 0–1 thành viên bầy (không phải chính mình); bị loại lúc sáng.                              |
| Phù thủy       | Biết người bị cắn. Bình cứu (chỉ cho người bị cắn) và bình độc, mỗi bình một lần cả ván. Bảo vệ + cứu cùng người: sống. |
| Tiên tri       | Soi 1 người khác; kết quả "là Ma sói" nếu thuộc bầy (Sói trắng hiện là Ma sói). Nhận kết quả rồi xác nhận đi ngủ.       |
| Người thổi sáo | Mê hoặc 2 người còn sống chưa bị mê hoặc (không phải chính mình).                                                       |
| Vai tùy chỉnh  | Quản trò xử lý thủ công, ghi chú vào nhật ký riêng. Engine không áp luật theo mô tả.                                    |

Vai đã chết vẫn được gọi (mặc định) để không lộ thông tin, nhưng không được hành động.

Trời sáng, thứ tự giải quyết: cắn của bầy sói → Sói trắng → bình độc → loại thủ công trong đêm.

## Chết và hiệu ứng

- Nguyên nhân: `wolf`, `whitewolf`, `poison`, `vote`, `hunter`, `lover`, `gm`.
- Cặp đôi chết theo ngay (không cần quản trò nhập).
- Thợ săn bị loại → hiệu ứng chờ: bắn 1 người còn sống hoặc không bắn. Trúng độc: **không được bắn** (biến thể `hunterShootsWhenPoisoned`).
- Trưởng làng bị loại → hiệu ứng chờ: chỉ định người kế nhiệm còn sống hoặc không ai.
- Mỗi hiệu ứng chỉ kích hoạt một lần cho mỗi người (kể cả khi hồi sinh sửa nhầm rồi chết lại).
- Hàng đợi hiệu ứng giải quyết theo thứ tự xuất hiện; chỉ xét thắng khi hàng đợi trống.
- Thằng ngốc bị loại bằng phiếu **lần đầu**: lật thẻ (vai công khai), còn sống, mất quyền bỏ phiếu. Lần sau bị phiếu hoặc chết cách khác: chết như thường.

## Bỏ phiếu

- Quản trò đếm tay và nhập số phiếu của từng người; mỗi người còn sống và còn quyền bầu có 1 phiếu tay.
- Tổng phiếu tay không được vượt số người có quyền bầu; phần thiếu là bỏ phiếu trắng.
- Trưởng làng (còn sống, còn quyền bầu): chọn riêng người Trưởng làng bầu → cộng thêm 1. Người đó phải có ít nhất 1 phiếu tay (phiếu tay của Trưởng làng), nên không cộng hai lần.
- Chỉ bầu người còn sống; khi bầu lại chỉ bầu trong nhóm hòa.
- Hòa: sửa phiếu, bầu lại giữa những người hòa, không loại ai, hoặc quản trò/Trưởng làng quyết định loại (bắt buộc ghi lý do, ghi vào nhật ký công khai).

## Điều kiện thắng (theo thứ tự ưu tiên)

1. Không còn ai sống → không ai thắng.
2. Kẻ chán đời vừa bị loại bằng phiếu → Kẻ chán đời thắng.
3. Hai người cuối cùng là Cặp đôi **khác phe** (hoặc một người là Sói trắng) → Cặp đôi thắng. Cặp đôi cùng phe thì phe của họ thắng như thường.
4. Sói trắng là người cuối cùng → Sói trắng thắng.
5. Người thổi sáo còn sống và mọi người còn sống khác đều bị mê hoặc → Người thổi sáo thắng.
6. Không còn thành viên bầy sói và không còn Người thổi sáo → phe Dân làng thắng (mọi người phe Dân, kể cả đã chết).
7. Số Ma sói (phe Sói, không tính Sói trắng) ≥ số người còn lại, và không còn Sói trắng hay Người thổi sáo → phe Ma sói thắng.

Kết thúc thủ công: phe Dân làng / phe Ma sói / không phân thắng bại. Người thắng được highlight theo danh sách `winners` (kể cả phe riêng).

## Biến thể (chọn khi tạo phòng)

| Khóa                       | Mặc định | Ý nghĩa                                              |
| -------------------------- | -------- | ---------------------------------------------------- |
| `chief`                    | bật      | Dùng Trưởng làng (cũng đổi được ở bước chọn bộ vai). |
| `revealOnDeath`            | tắt      | Công khai vai của người bị loại trên máy mọi người.  |
| `hunterShootsWhenPoisoned` | tắt      | Thợ săn trúng độc vẫn được bắn.                      |
| `witchSelfHeal`            | bật      | Phù thủy được dùng bình cứu cho mình.                |
| `callDeadRoles`            | bật      | Vẫn gọi vai đã chết (không cho hành động).           |

## Hoàn tác, reset, chơi lại

- Hoàn tác: khôi phục trạng thái trước lệnh gần nhất trong ván (tối đa 40 bước, lưu ở server). Không thể khiến người đã xem thông tin quên thông tin đó. Không hoàn tác được sau khi đã công bố kết quả.
- Reset về Đêm 1: giữ vai đã chia, xóa trạng thái sống/chết, Cặp đôi, Trưởng làng, mê hoặc, bình của Phù thủy, nhật ký. Có thể hoàn tác.
- Chơi lại: tạo ván mới trong cùng phòng với cùng nhóm và bộ vai; ván cũ giữ nguyên làm lịch sử.
