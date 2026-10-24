import { useEffect, type ReactNode } from 'react'
import { cx } from '@/lib/css'
import { Icon, type IconName } from './Icon'

function useEscape(onClose?: () => void) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
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
  useEscape(onClose)
  return (
    <div className="dialog-backdrop" data-layer={layer}>
      <div className={cx('dialog', className)} role="alertdialog" aria-modal="true">
        <div className="dialog__title">{title}</div>
        {children}
        <div className="dialog__actions">{actions}</div>
      </div>
    </div>
  )
}

/** Bảng trượt từ đáy (điện thoại) hoặc hộp nổi giữa màn hình (máy tính). */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEscape(onClose)
  return (
    <div className="sheet-layer">
      <div className="sheet-layer__scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
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

export function Toast({ text }: { text: string }) {
  return (
    <div className="toast" role="status">
      {text}
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
