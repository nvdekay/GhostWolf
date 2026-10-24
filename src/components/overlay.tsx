import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { cx } from '@/lib/css'
import { Icon, type IconName } from './Icon'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Giữ focus trong hộp thoại, Esc để đóng, trả focus về phần tử cũ khi đóng. */
function useFocusTrap(ref: RefObject<HTMLElement | null>, onClose?: () => void) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const root = ref.current
    const first =
      root?.querySelector<HTMLElement>('[data-autofocus]') ??
      root?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && close.current) {
        e.stopPropagation()
        close.current()
        return
      }
      if (e.key !== 'Tab' || !root) return
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      )
      if (!items.length) return
      const a = items[0]!
      const z = items[items.length - 1]!
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault()
        z.focus()
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault()
        a.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (prev && document.contains(prev)) prev.focus()
    }
  }, [ref])
}

/** Hộp thoại xác nhận ở giữa màn hình. */
export function Dialog({
  title,
  children,
  actions,
  onClose,
  className,
  layer = 'top',
}: {
  title: ReactNode
  children?: ReactNode
  actions: ReactNode
  onClose?: () => void
  className?: string
  layer?: 'top' | 'winner' | 'hunter'
}) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, onClose)
  return (
    <div className="dialog-backdrop" data-layer={layer}>
      <div
        ref={ref}
        className={cx('dialog', className)}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
      >
        <div className="dialog__title" id="dlg-title">
          {title}
        </div>
        {children}
        <div className="dialog__actions">{actions}</div>
      </div>
    </div>
  )
}

/** Bảng trượt từ đáy (điện thoại) hoặc hộp nổi giữa màn hình (máy tính). */
export function Sheet({
  onClose,
  children,
  label,
}: {
  onClose: () => void
  children: ReactNode
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, onClose)
  return (
    <div className="sheet-layer">
      <div className="sheet-layer__scrim" onClick={onClose} />
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="sheet__close">
          <button className="btn btn-secondary btn-icon" onClick={onClose} aria-label="Đóng">
            <Icon name="x" />
          </button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  )
}

export function Toast({
  text,
  tone,
  onClose,
}: {
  text: string
  tone: 'info' | 'error'
  onClose: () => void
}) {
  return (
    <div className="toast" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      {tone === 'error' && <Icon name="alert" size={18} />}
      <span>{text}</span>
      <button className="toast__close" onClick={onClose} aria-label="Đóng thông báo">
        <Icon name="x" size={16} />
      </button>
    </div>
  )
}

/** Màn chuyển cảnh ngày/đêm. */
export function Curtain({ title, sub, icon }: { title: string; sub: string; icon: IconName }) {
  return (
    <div className="curtain" data-tone={icon === 'sun' ? 'day' : 'night'} aria-live="polite">
      <div className="curtain__inner">
        <div className="curtain__icon">
          <Icon name={icon} size={56} />
        </div>
        <div className="curtain__title">{title}</div>
        <div className="curtain__sub">{sub}</div>
      </div>
    </div>
  )
}
