import { useState } from 'react'
import { DEFAULT_OPTIONS, type RuleOptions } from '@engine'
import { useNav } from '@/app/App'
import { useFeedback } from '@/app/feedback'
import { Icon } from '@/components/Icon'
import { BottomBar, Ornament, Paper, SwitchRow, TopBar } from '@/components/ui'
import { createRoom } from '@/services/rooms'
import './setup.css'

export function ConfigScreen() {
  const nav = useNav()
  const fb = useFeedback()
  const [name, setName] = useState('Ván tối thứ Sáu')
  const [opts, setOpts] = useState<RuleOptions>(DEFAULT_OPTIONS)
  const [variants, setVariants] = useState(false)
  const [busy, setBusy] = useState(false)
  const patch = (p: Partial<RuleOptions>) => setOpts((o) => ({ ...o, ...p }))

  const create = async () => {
    setBusy(true)
    try {
      const room = await createRoom(name.trim() || 'Ván mới', opts)
      nav.go({ name: 'host', roomId: room.id })
    } catch (e) {
      fb.error(e)
      setBusy(false)
    }
  }

  return (
    <Paper label="Cấu hình phòng">
      <TopBar onBack={() => nav.go({ name: 'choose' })} backLabel="Quay lại" title="Tạo phòng" />
      <main className="config">
        <div className="hero">
          <div className="eyebrow">Quản trò</div>
          <h1>Cấu hình phòng</h1>
          <Ornament />
          <p>Bạn có thể đổi bộ vai sau khi mọi người vào phòng.</p>
        </div>
        <div className="config__form">
          <div className="field">
            <label htmlFor="rname">Tên ván</label>
            <input
              id="rname"
              className="input"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Ván tối thứ Sáu"
            />
          </div>
          <section className="config__switches">
            <SwitchRow
              title="Trưởng làng"
              sub="Bầu vào Ngày 1, phiếu tính gấp đôi"
              checked={opts.chief}
              onToggle={() => patch({ chief: !opts.chief })}
              label="Bật Trưởng làng"
            />
            <SwitchRow
              title="Công bố vai khi bị loại"
              sub="Hiện vai người bị loại trên máy mọi người"
              checked={opts.revealOnDeath}
              onToggle={() => patch({ revealOnDeath: !opts.revealOnDeath })}
              label="Công bố vai khi bị loại"
            />
          </section>
          <section className="config__variants">
            <button
              className="config__variants-toggle"
              aria-expanded={variants}
              onClick={() => setVariants(!variants)}
            >
              <span>Luật biến thể</span>
              <Icon name={variants ? 'up' : 'down'} />
            </button>
            {variants && (
              <div className="config__switches">
                <SwitchRow
                  title="Thợ săn trúng độc vẫn được bắn"
                  sub={opts.hunterShootsWhenPoisoned ? 'Có' : 'Không (mặc định)'}
                  checked={opts.hunterShootsWhenPoisoned}
                  onToggle={() =>
                    patch({ hunterShootsWhenPoisoned: !opts.hunterShootsWhenPoisoned })
                  }
                  label="Thợ săn trúng độc vẫn được bắn"
                />
                <SwitchRow
                  title="Phù thủy được tự cứu"
                  sub={opts.witchSelfHeal ? 'Có (mặc định)' : 'Không'}
                  checked={opts.witchSelfHeal}
                  onToggle={() => patch({ witchSelfHeal: !opts.witchSelfHeal })}
                  label="Phù thủy được tự cứu"
                />
                <SwitchRow
                  title="Vẫn gọi vai đã bị loại"
                  sub="Gọi như bình thường để không lộ thông tin (không cho hành động)"
                  checked={opts.callDeadRoles}
                  onToggle={() => patch({ callDeadRoles: !opts.callDeadRoles })}
                  label="Vẫn gọi vai đã bị loại"
                />
              </div>
            )}
          </section>
        </div>
        <div className="note-box">
          <Icon name="info" />
          <span>
            Sau khi tạo, bạn nhận một mã phòng 6 ký tự và link mời. Người chơi mở Ghostwolf, chọn
            “Vào phòng bằng mã” và nhập mã. Ai không có điện thoại, bạn thêm tên thủ công.
          </span>
        </div>
      </main>
      <BottomBar>
        <button className="btn btn-ink btn-lg bar-main" onClick={create} disabled={busy}>
          {busy ? 'Đang tạo phòng…' : 'Tạo phòng và lấy mã'}
          <Icon name="right" />
        </button>
      </BottomBar>
    </Paper>
  )
}
