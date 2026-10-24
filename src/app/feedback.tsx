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

interface State {
  toast: { text: string; key: number; tone: 'info' | 'error' } | null
  curtain: { title: string; sub: string; icon: IconName; key: number } | null
}

type Action =
  | { type: 'toast'; text: string; tone: 'info' | 'error' }
  | { type: 'curtain'; title: string; sub: string; icon: IconName }
  | { type: 'clearToast'; key: number }
  | { type: 'clearCurtain'; key: number }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'toast':
      return { ...s, toast: { text: a.text, tone: a.tone, key: Date.now() } }
    case 'curtain':
      return { ...s, curtain: { title: a.title, sub: a.sub, icon: a.icon, key: Date.now() } }
    case 'clearToast':
      return s.toast?.key === a.key ? { ...s, toast: null } : s
    case 'clearCurtain':
      return s.curtain?.key === a.key ? { ...s, curtain: null } : s
  }
}

interface Feedback {
  toast: (text: string) => void
  error: (e: unknown) => void
  curtain: (title: string, sub: string, icon: IconName) => void
}

const Ctx = createContext<Feedback>({ toast: () => {}, error: () => {}, curtain: () => {} })

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [s, dispatch] = useReducer(reducer, { toast: null, curtain: null })
  const last = useRef(0)

  const api = useMemo<Feedback>(
    () => ({
      toast: (text) => {
        dispatch({ type: 'toast', text, tone: 'info' })
        const key = Date.now()
        last.current = key
        setTimeout(() => dispatch({ type: 'clearToast', key }), 2800)
      },
      error: (e) => {
        const text = e instanceof Error ? e.message : 'Đã có lỗi. Thử lại.'
        dispatch({ type: 'toast', text, tone: 'error' })
        const key = Date.now()
        setTimeout(() => dispatch({ type: 'clearToast', key }), 4500)
      },
      curtain: (title, sub, icon) => {
        dispatch({ type: 'curtain', title, sub, icon })
        const key = Date.now()
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
