/* Phiên ẩn danh Supabase: không đăng ký, danh tính giữ qua refresh (token lưu bởi supabase-js). */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

interface Session {
  userId: string | null
  error: string | null
  retry: () => void
}

const SessionContext = createContext<Session>({ userId: null, error: null, retry: () => {} })

interface SessionResult {
  userId: string | null
  error: string | null
}

let sessionInitialization: Promise<SessionResult> | null = null

/** StrictMode mounts effects twice in development; never create two anonymous users concurrently. */
function ensureAnonymousSession() {
  if (sessionInitialization) return sessionInitialization
  sessionInitialization = (async (): Promise<SessionResult> => {
    try {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user) return { userId: data.session.user.id, error: null }
      const result = await supabase.auth.signInAnonymously()
      if (!result.error && result.data.user) return { userId: result.data.user.id, error: null }
    } catch {
      // Normalize network/storage failures to the same retryable user-facing state.
    }
    sessionInitialization = null
    return {
      userId: null,
      error: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
    }
  })()
  return sessionInitialization
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setError(null)
      const result = await ensureAnonymousSession()
      if (cancelled) return
      setError(result.error)
      if (result.userId) setUserId(result.userId)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.user) setUserId(s.user.id)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  return (
    <SessionContext.Provider value={{ userId, error, retry }}>{children}</SessionContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSession = () => useContext(SessionContext)
