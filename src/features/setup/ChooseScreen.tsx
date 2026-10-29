import { useNav } from '@/app/App'
import { Icon, type IconName } from '@/components/Icon'
import { Ornament, Paper, TopBar } from '@/components/ui'
import './setup.css'

function RoleChoice({
  icon,
  title,
  desc,
  cta,
  onPick,
}: {
  icon: IconName
  title: string
  desc: string
  cta: string
  onPick: () => void
}) {
  return (
    <button className="choice" onClick={onPick}>
      <span className="choice__medal">
        <Icon name={icon} />
      </span>
      <span className="choice__text">
        <span className="choice__title">{title}</span>
        <span className="choice__desc">{desc}</span>
      </span>
      <span className="choice__cta">
        {cta}
        <Icon name="right" />
      </span>
    </button>
  )
}

export function ChooseScreen() {
  const nav = useNav()
  return (
    <Paper label="Chọn vai trò">
      <TopBar onBack={nav.home} backLabel="Về trang chủ" title="Ván mới" />
      <main className="choose">
        <div className="choose__intro">
          <div className="eyebrow">Bắt đầu</div>
          <h1 className="choose__title">Bạn vào ván với vai trò nào?</h1>
          <Ornament />
          <p className="muted pretty choose__lead">
            Quản trò có thể tổ chức cho mọi người ngồi cùng một chỗ hoặc chơi từ xa. Người chơi mở
            link mời hoặc nhập mã phòng để tham gia trên thiết bị của mình.
          </p>
        </div>
        <div className="choose__grid">
          <RoleChoice
            icon="crown"
            title="Quản trò"
            desc="Tạo phòng, chọn bộ vai, chia vai ngẫu nhiên và điều hành từng đêm."
            cta="Tạo phòng"
            onPick={() => nav.go({ name: 'gmConfig' })}
          />
          <RoleChoice
            icon="users"
            title="Người chơi"
            desc="Nhập mã quản trò đưa cho bạn. Vai bí mật hiện trên máy của bạn."
            cta="Nhập mã phòng"
            onPick={() => nav.go({ name: 'join' })}
          />
        </div>
      </main>
    </Paper>
  )
}
