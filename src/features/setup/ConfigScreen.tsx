import { go, setState, useAppState } from '@/app/store'
import { Icon } from '@/components/Icon'
import { BottomBar, Ornament, Paper, SwitchRow, TopBar } from '@/components/ui'
import { createRoom } from './actions'
import './setup.css'

export function ConfigScreen() {
  const { cfg } = useAppState()
  const patch = (p: Partial<typeof cfg>) => setState({ cfg: { ...cfg, ...p } })

  return (
    <Paper label="Cấu hình phòng">
      <TopBar onBack={() => go('choose')} backLabel="Quay lại" title="Tạo phòng" />
      <main className="config">
        <div className="hero">
          <div className="eyebrow">Quản trò</div>
          <h1>Cấu hình phòng</h1>
          <Ornament />
          <p>Bạn có thể đổi bộ vai sau khi mọi người vào phòng.</p>
        </div>
        <div className="field">
          <label htmlFor="rname">Tên ván</label>
          <input
            id="rname"
            className="input"
            value={cfg.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Ví dụ: Ván tối thứ Sáu"
          />
        </div>
        <section className="config__switches">
          <SwitchRow
            title="Trưởng làng"
            sub="Bầu vào Ngày 1, phiếu tính gấp đôi"
            checked={cfg.chief}
            onToggle={() => patch({ chief: !cfg.chief })}
            label="Bật Trưởng làng"
          />
          <SwitchRow
            title="Công bố vai khi bị loại"
            sub="Hiện vai người bị loại trên màn hình chung"
            checked={cfg.reveal}
            onToggle={() => patch({ reveal: !cfg.reveal })}
            label="Công bố vai khi bị loại"
          />
        </section>
        <div className="note-box">
          <Icon name="info" />
          <span>
            Sau khi tạo, bạn nhận một mã phòng 6 ký tự. Người chơi mở Trăng Sói, chọn “Người chơi”
            và nhập mã. Ai không có điện thoại, bạn thêm tên thủ công.
          </span>
        </div>
      </main>
      <BottomBar>
        <button className="btn btn-ink btn-lg bar-main" onClick={createRoom}>
          Tạo phòng và lấy mã
          <Icon name="right" />
        </button>
      </BottomBar>
    </Paper>
  )
}
