/* Phiên ẩn danh Supabase: không đăng ký, danh tính giữ qua refresh (token lưu bởi supabase-js). */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

interface Session {
  userId: string | null
  error: string | null
  captchaSiteKey: string | null
  captchaAttempt: number
  verifyCaptcha: (token: string) => void
  captchaError: () => void
  retry: () => void
}

const configuredCaptchaSiteKey =
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || null

const SessionContext = createContext<Session>({
  userId: null,
  error: null,
  captchaSiteKey: null,
  captchaAttempt: 0,
  verifyCaptcha: () => {},
  captchaError: () => {},
  retry: () => {},
})

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [captchaAttempt, setCaptchaAttempt] = useState(0)

  const signIn = useCallback(async (captchaToken?: string) => {
    setError(null)
    const credentials = captchaToken ? { options: { captchaToken } } : undefined
    const res = await supabase.auth.signInAnonymously(credentials)
    if (res.error || !res.data.user) {
      const captchaFailed = res.error?.code === 'captcha_failed'
      setError(
        captchaFailed
          ? 'Xác minh bảo mật đã hết hạn hoặc không hợp lệ. Vui lòng thử lại.'
          : 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
      )
      if (configuredCaptchaSiteKey) setCaptchaAttempt((value) => value + 1)
      return
    }
    setUserId(res.data.user.id)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setError(null)
      const { data } = await supabase.auth.getSession()
      if (data.session?.user) {
        if (!cancelled) setUserId(data.session.user.id)
        return
      }
      if (!cancelled && !configuredCaptchaSiteKey) await signIn()
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.user) setUserId(s.user.id)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [attempt, signIn])

  const verifyCaptcha = useCallback((token: string) => void signIn(token), [signIn])
  const captchaError = useCallback(
    () => setError('Không tải được kiểm tra bảo mật. Kiểm tra mạng rồi thử lại.'),
    [],
  )
  const retry = useCallback(() => {
    setError(null)
    setCaptchaAttempt((value) => value + 1)
    setAttempt((value) => value + 1)
  }, [])
  return (
    <SessionContext.Provider
      value={{
        userId,
        error,
        captchaSiteKey: userId ? null : configuredCaptchaSiteKey,
        captchaAttempt,
        verifyCaptcha,
        captchaError,
        retry,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSession = () => useContext(SessionContext)
