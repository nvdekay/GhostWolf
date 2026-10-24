import './home.css'

const STEPS = [
  'Tạo ván và nhập tên người chơi. Quản trò không tính vào số người.',
  'Chọn bộ vai sao cho số thẻ bằng số người chơi.',
  'Chuyền máy: mỗi người xem vai một mình rồi bấm ẩn trước khi đưa cho người kế tiếp.',
  'Quản trò giữ máy. Mỗi đêm, ứng dụng gọi từng vai theo thứ tự và ghi lại lựa chọn.',
  'Ban ngày cả làng thảo luận và bỏ phiếu. Ván kết thúc khi một phe đạt điều kiện thắng.',
]

export function HowToSheet() {
  return (
    <>
      <h2 className="sheet__title">Cách chơi</h2>
      <ol className="howto">
        {STEPS.map((text, i) => (
          <li key={i}>
            <span className="howto__num">{i + 1}</span>
            {text}
          </li>
        ))}
      </ol>
    </>
  )
}
