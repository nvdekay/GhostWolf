/* Phiên ẩn danh Supabase: không đăng ký, danh tính giữ qua refresh (token lưu bởi supabase-js). */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

interface Session {
  userId: string | null
  error: string | null
  retry: () => void
}

const SessionContext = createContext<Session>({ userId: null, error: null, retry: () => {} })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setError(null)
      const { data } = await supabase.auth.getSession()
      if (data.session?.user) {
        if (!cancelled) setUserId(data.session.user.id)
        return
      }
      const res = await supabase.auth.signInAnonymously()
      if (cancelled) return
      if (res.error || !res.data.user)
        setError('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')
      else setUserId(res.data.user.id)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.user) setUserId(s.user.id)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  return (
    <SessionContext.Provider value={{ userId, error, retry }}>{children}</SessionContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSession = () => useContext(SessionContext)
