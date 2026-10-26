/* Toast và màn chuyển cảnh ngày/đêm. */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import { Curtain, Toast } from '@/components/overlay'
import type { IconName } from '@/components/Icon'
import { feedbackReducer } from './feedbackState'

interface Feedback {
  toast: (text: string) => void
  error: (e: unknown) => void
  curtain: (title: string, sub: string, icon: IconName) => void
}

const Ctx = createContext<Feedback>({ toast: () => {}, error: () => {}, curtain: () => {} })

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [s, dispatch] = useReducer(feedbackReducer, { toast: null, curtain: null })
  // Tăng dần: không trùng kể cả khi hai lần gọi trong cùng một mili-giây.
  const seq = useRef(0)

  const api = useMemo<Feedback>(
    () => ({
      toast: (text) => {
        const key = ++seq.current
        dispatch({ type: 'toast', text, tone: 'info', key })
        setTimeout(() => dispatch({ type: 'clearToast', key }), 2800)
      },
      error: (e) => {
        const text = e instanceof Error ? e.message : 'Đã có lỗi. Thử lại.'
        const key = ++seq.current
        dispatch({ type: 'toast', text, tone: 'error', key })
        setTimeout(() => dispatch({ type: 'clearToast', key }), 4500)
      },
      curtain: (title, sub, icon) => {
        const key = ++seq.current
        dispatch({ type: 'curtain', title, sub, icon, key })
        setTimeout(() => dispatch({ type: 'clearCurtain', key }), 1700)
      },
    }),
    [],
  )

  const clearToast = useCallback(
    () => s.toast && dispatch({ type: 'clearToast', key: s.toast.key }),
    [s.toast],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      {s.toast && (
        <Toast key={s.toast.key} text={s.toast.text} tone={s.toast.tone} onClose={clearToast} />
      )}
      {s.curtain && (
        <Curtain
          key={s.curtain.key}
          title={s.curtain.title}
          sub={s.curtain.sub}
          icon={s.curtain.icon}
        />
      )}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useFeedback = () => useContext(Ctx)
