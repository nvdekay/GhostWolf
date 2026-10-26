import { useEffect, useRef, useState } from 'react'
import { useNav } from '@/app/App'
import { Icon } from '@/components/Icon'
import { Ornament, Paper } from '@/components/ui'
import { toAppError } from '@/services/errors'
import { findRoom, joinRoom } from '@/services/rooms'
import './join.css'

const clean = (raw: string) =>
  raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)

/** Nhập mã → nhập tên → vào phòng (máy người chơi). */
export function JoinScreen({ initialCode }: { initialCode?: string }) {
  const nav = useNav()
  const [code, setCode] = useState(initialCode ?? '')
  const [stage, setStage] = useState<'code' | 'name'>('code')
  const [room, setRoom] = useState<{ id: string; name: string } | null>(null)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const autoTried = useRef(false)

  const submitCode = async (c = code) => {
    if (c.length !== 6) return setErr('Mã phòng gồm 6 ký tự.')
    setBusy(true)
    setErr('')
    try {
      const r = await findRoom(c)
      if (!r) setErr(`Không tìm thấy phòng ${c}, hoặc phòng đã đóng. Kiểm tra lại mã với quản trò.`)
      else if (r.is_host) nav.go({ name: 'host', roomId: r.id })
      else if (r.member_id) nav.go({ name: 'player', roomId: r.id })
      else if (r.status === 'locked')
        setErr('Phòng đã chốt danh sách, không vào thêm được. Nhờ quản trò mở lại phòng.')
      else {
        setRoom({ id: r.id, name: r.name })
        setStage('name')
      }
    } catch (e) {
      setErr(toAppError(e).message)
    } finally {
      setBusy(false)
    }
  }

  // Mở từ link mời: tự tìm phòng.
  useEffect(() => {
    if (initialCode?.length === 6 && !autoTried.current) {
      autoTried.current = true
      void submitCode(initialCode)
    }
  })

  const submitName = async () => {
    if (!name.trim()) return setErr('Cần nhập tên.')
    setBusy(true)
    setErr('')
    try {
      const m = await joinRoom(code, name)
      nav.go({ name: 'player', roomId: m.room_id })
    } catch (e) {
      const ae = toAppError(e)
      setErr(ae.message)
      if (['ROOM_NOT_FOUND', 'ROOM_LOCKED', 'KICKED'].includes(ae.code)) setStage('code')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Paper narrow label="Người chơi">
      {stage === 'code' ? (
        <main className="join">
          <div className="join__bar">
            <button
              className="btn btn-secondary btn-icon"
              onClick={nav.home}
              aria-label="Về trang chủ"
            >
              <Icon name="left" />
            </button>
            <span className="eyebrow eyebrow--muted">Người chơi</span>
          </div>
          <div className="join__hero">
            <h1>Nhập mã phòng</h1>
            <Ornament />
            <p className="muted">Mã gồm 6 ký tự, quản trò đọc hoặc gửi link cho bạn.</p>
          </div>
          <div className="code-entry">
            <div aria-hidden="true" className="code-entry__cells" data-error={!!err}>
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} data-active={!err && i === Math.min(code.length, 5)}>
                  {code[i] ?? ''}
                </span>
              ))}
            </div>
            <input
              className="code-entry__input"
              aria-label="Mã phòng"
              aria-invalid={!!err}
              aria-describedby={err ? 'codeerr' : undefined}
              value={code}
              onChange={(e) => {
                setCode(clean(e.target.value))
                setErr('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && void submitCode()}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={6}
              inputMode="text"
              autoFocus
            />
          </div>
          {err && (
            <p id="codeerr" role="alert" className="join__err">
              <Icon name="alert" size={15} />
              {err}
            </p>
          )}
          <div className="join__bottom">
            <button
              className="btn btn-ink btn-xl btn-block"
              onClick={() => void submitCode()}
              disabled={code.length === 0 || busy}
            >
              {busy ? 'Đang tìm phòng…' : 'Tìm phòng'}
              <Icon name="right" />
            </button>
          </div>
        </main>
      ) : (
        <main className="join">
          <div className="join__bar">
            <button
              className="btn btn-secondary btn-icon"
              onClick={() => setStage('code')}
              aria-label="Đổi mã"
            >
              <Icon name="left" />
            </button>
            <span className="success-text inline-icon join__found">
              <Icon name="check" size={15} />
              Đã tìm thấy {room?.name}
            </span>
          </div>
          <div className="join__hero">
            <h1>Tên của bạn</h1>
            <p className="muted">Tên này hiện trên bàn của quản trò và máy của mọi người.</p>
          </div>
          <input
            className="input join__name"
            aria-label="Tên của bạn"
            aria-invalid={!!err}
            value={name}
            maxLength={40}
            onChange={(e) => {
              setName(e.target.value)
              setErr('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && void submitName()}
            placeholder="Ví dụ: Hà"
            autoComplete="nickname"
            autoFocus
          />
          {err && (
            <p role="alert" className="join__err">
              <Icon name="alert" size={15} />
              {err}
            </p>
          )}
          <div className="join__bottom">
            <button
              className="btn btn-ink btn-xl btn-block"
              onClick={() => void submitName()}
              disabled={!name.trim() || busy}
            >
              {busy ? 'Đang vào phòng…' : 'Vào phòng'}
            </button>
          </div>
        </main>
      )}
    </Paper>
  )
}
