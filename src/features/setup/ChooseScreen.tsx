import { go, setState } from '@/app/store'
import { Icon, type IconName } from '@/components/Icon'
import { Ornament, Paper, TopBar } from '@/components/ui'
import { openJoin } from '@/features/join/actions'
import './setup.css'

function RoleChoice({
  icon,
  title,
  desc,
  points,
  cta,
  onPick,
}: {
  icon: IconName
  title: string
  desc: string
  points: string[]
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
      <ul className="choice__points">
        {points.map((p) => (
          <li key={p}>
            <span className="gold-text">
              <Icon name="check" size={15} />
            </span>
            {p}
          </li>
        ))}
      </ul>
      <span className="choice__cta">
        {cta}
        <Icon name="right" />
      </span>
    </button>
  )
}

export function ChooseScreen() {
  return (
    <Paper label="Chọn vai trò">
      <TopBar onBack={() => go('home')} backLabel="Về trang chủ" title="Ván mới" />
      <main className="choose">
        <div className="choose__intro">
          <div className="eyebrow">Bắt đầu</div>
          <h1 className="choose__title">Bạn vào ván với vai trò nào?</h1>
          <Ornament />
          <p className="muted pretty choose__lead">
            Mỗi người dùng điện thoại của mình. Quản trò tạo phòng và đọc mã, người chơi nhập mã để
            vào.
          </p>
        </div>
        <div className="choose__grid">
          <RoleChoice
            icon="crown"
            title="Quản trò"
            desc="Tạo phòng, chọn bộ vai, chia vai ngẫu nhiên và điều hành từng đêm."
            points={[
              'Nhận mã phòng 6 ký tự',
              'Gợi ý bộ vai theo số người',
              'Bàn điều hành đêm và ngày',
            ]}
            cta="Tạo phòng"
            onPick={() => setState({ screen: 'gmConfig' })}
          />
          <RoleChoice
            icon="users"
            title="Người chơi"
            desc="Nhập mã quản trò đưa cho bạn. Vai bí mật hiện trên máy của bạn."
            points={['Không cần tài khoản', 'Chỉ bạn thấy vai của mình', 'Theo dõi đêm và ngày']}
            cta="Nhập mã phòng"
            onPick={openJoin}
          />
        </div>
      </main>
    </Paper>
  )
}
