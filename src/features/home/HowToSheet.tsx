import './home.css'

const STEPS = [
  'Quản trò bấm “Tạo ván mới”, chọn “Quản trò” và tạo phòng. Mã phòng 6 ký tự hiện trên máy quản trò.',
  'Người chơi mở Ghostwolf trên điện thoại của mình, chọn “Vào phòng bằng mã” (hoặc mở link mời) và nhập tên. Ai không có điện thoại, quản trò thêm tên thủ công.',
  'Đủ người (từ 4), quản trò chốt phòng và chọn bộ vai sao cho số thẻ bằng số người chơi. Quản trò không tính vào số người.',
  'Quản trò chia vai rồi bấm “Gửi vai”. Mỗi người lật thẻ trên máy mình, ghi nhớ rồi ẩn đi. Người không có điện thoại được chuyền máy quản trò: “Xem trên máy này”, xem một mình, ẩn rồi trả máy.',
  'Ban đêm mọi người nhắm mắt. Quản trò đọc lời gọi từng vai theo thứ tự trên màn hình và nhập lựa chọn. Máy người chơi không thao tác gì ban đêm.',
  'Ban ngày quản trò công bố người bị loại, cả làng thảo luận và bỏ phiếu bằng tay. Quản trò nhập số phiếu. Ván kết thúc khi một phe đạt điều kiện thắng.',
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
