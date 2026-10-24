import { setState, useAppState } from '@/app/store'
import { Icon } from '@/components/Icon'
import { BottomBar, Paper, Stepper, TopBar } from '@/components/ui'
import { cssVars } from '@/lib/css'
import { buildDeck, viewOf } from '@/features/roles/roles'
import { useSetupStepper } from '@/features/setup/useSetupStepper'
import { sendRoles, shuffleRoles, startFromAssign, viewLocally } from './actions'
import './assign.css'

const COPY = {
  idle: {
    title: 'Chia vai ngẫu nhiên',
    sub: 'Ứng dụng xáo bộ vai và chia ngẫu nhiên cho từng người trong phòng. Chỉ quản trò thấy bảng này.',
  },
  shuffling: { title: 'Đang xáo bài…', sub: 'Đang chia ngẫu nhiên cho từng người.' },
  done: {
    title: 'Kiểm tra trước khi gửi',
    sub: 'Xáo lại nếu muốn. Người chơi chưa nhận được gì cho tới khi bạn bấm Gửi.',
  },
  sent: {
    title: 'Đã gửi vai',
    sub: 'Mỗi người nhận vai trên máy của mình. Theo dõi ai đã mở vai.',
  },
}

export function AssignScreen() {
  const { room, assign: a, counts, hideAssigned: hide } = useAppState()
  const stepper = useSetupStepper()
  if (!room) return null

  const stage = a?.stage ?? 'idle'
  const deck = buildDeck(counts)
  const entries =
    a?.order ??
    room.players.map((p) => ({
      pid: p.id,
      name: p.name,
      device: p.device,
      viewed: false,
      roleId: undefined,
    }))
  const n = entries.length
  const viewed = a?.order.filter((o) => o.viewed).length ?? 0
  const offline = room.players.filter((p) => !p.device).length
  const viewedLabel = `${viewed}/${n} người đã xem vai`

  return (
    <Paper label="Chia vai">
      <TopBar
        onBack={() => setState({ screen: 'roles' })}
        backLabel="Quay lại bộ vai"
        title="Chia vai"
      >
        <Stepper steps={stepper} label="Tiến trình" />
      </TopBar>
      <main className="assign">
        <div className="assign__head">
          <div className="hero">
            <div className="eyebrow">
              {deck.length} thẻ · {n} người
            </div>
            <h1>{COPY[stage].title}</h1>
            <p>{COPY[stage].sub}</p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => setState({ hideAssigned: !hide })}
            aria-pressed={hide}
          >
            <Icon name={hide ? 'eye' : 'eyeOff'} size={18} />
            {hide ? 'Hiện vai' : 'Giấu vai'}
          </button>
        </div>

        {stage === 'sent' && (
          <div className="assign__progress">
            <span aria-live="polite">{viewedLabel}</span>
            <div
              className="progress"
              style={cssVars({ '--pct': (n ? (viewed / n) * 100 : 0) + '%' })}
            >
              <span />
            </div>
          </div>
        )}
        {offline > 0 && (
          <p className="muted inline-icon assign__note">
            <Icon name="alert" size={15} />
            {offline} người không có điện thoại sẽ xem vai trên máy quản trò.
          </p>
        )}

        <ol className="assign__list">
          {entries.map((o, i) => {
            const rid =
              stage === 'shuffling' && deck.length
                ? deck[(i * 3 + (a?.tick ?? 0)) % deck.length]
                : o.roleId
            const hidden = hide && stage !== 'shuffling' && !!rid
            const v = rid ? viewOf(rid) : null
            return (
              <li key={o.pid} className="assign__row" data-shuffling={stage === 'shuffling'}>
                <span className="assign__seat tabular">{i + 1}</span>
                <span className="assign__who">
                  <span className="assign__name">{o.name}</span>
                  {!o.device && <span className="muted assign__offline">Không có điện thoại</span>}
                </span>
                <span
                  className="assign__role"
                  data-team={hidden ? 'hidden' : (v?.team ?? 'hidden')}
                >
                  {v && <Icon name={hidden ? 'lock' : v.icon} size={18} />}
                  {hidden ? 'Đã giấu' : (v?.name ?? '—')}
                </span>
                {stage === 'sent' && (
                  <span className="assign__status" data-viewed={o.viewed}>
                    <Icon name={o.viewed ? 'check' : 'timer'} size={15} />
                    {o.viewed ? 'Đã xem vai' : o.device ? 'Đã gửi · chờ mở' : 'Chưa xem'}
                  </span>
                )}
                {stage === 'sent' && !o.device && !o.viewed && (
                  <button className="btn btn-ink" onClick={() => viewLocally(o)}>
                    <Icon name="eye" />
                    Xem trên máy này
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      </main>

      <BottomBar>
        {stage === 'idle' && (
          <button className="btn btn-ink btn-xl assign__main" onClick={shuffleRoles}>
            <Icon name="sparkles" />
            Chia vai ngẫu nhiên
          </button>
        )}
        {stage === 'shuffling' && (
          <button className="btn btn-ink btn-xl assign__main" disabled>
            Đang xáo bài…
          </button>
        )}
        {stage === 'done' && (
          <>
            <button className="btn btn-secondary btn-lg" onClick={shuffleRoles}>
              <Icon name="reset" />
              Xáo lại
            </button>
            <button className="btn btn-ink btn-lg bar-push" onClick={sendRoles}>
              Gửi vai cho người chơi
              <Icon name="right" />
            </button>
          </>
        )}
        {stage === 'sent' && (
          <>
            <span className="bottom-bar__hint">{viewedLabel}</span>
            <button
              className="btn btn-ink btn-lg bar-push"
              onClick={() => (viewed < n ? setState({ dialog: 'startEarly' }) : startFromAssign())}
            >
              <Icon name="moon" />
              Bắt đầu Đêm 1
            </button>
          </>
        )}
      </BottomBar>
    </Paper>
  )
}
