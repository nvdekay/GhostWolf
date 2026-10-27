import { useEffect, useRef } from 'react'

const SCRIPT_ID = 'cloudflare-turnstile-script'
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string
      action: string
      theme: 'light'
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': (code: string) => boolean
    },
  ): string
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loadPromise: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loadPromise) return loadPromise

  const pending = new Promise<TurnstileApi>((resolve, reject) => {
    const loaded = () => {
      if (window.turnstile) resolve(window.turnstile)
      else reject(new Error('Turnstile API không khả dụng'))
    }
    const failed = () => reject(new Error('Không tải được Turnstile'))
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', loaded, { once: true })
      existing.addEventListener('error', failed, { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_URL
    script.async = true
    script.defer = true
    script.addEventListener('load', loaded, { once: true })
    script.addEventListener('error', failed, { once: true })
    document.head.append(script)
  })
  loadPromise = pending.catch((error) => {
    loadPromise = null
    document.getElementById(SCRIPT_ID)?.remove()
    throw error
  })

  return loadPromise
}

export function Turnstile({
  siteKey,
  onVerify,
  onError,
}: {
  siteKey: string
  onVerify: (token: string) => void
  onError: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    let widgetId: string | null = null

    void loadTurnstile()
      .then((api) => {
        if (cancelled || !containerRef.current) return
        widgetId = api.render(containerRef.current, {
          sitekey: siteKey,
          action: 'anonymous_sign_in',
          theme: 'light',
          callback: onVerify,
          'expired-callback': onError,
          'error-callback': () => {
            onError()
            return true
          },
        })
      })
      .catch(() => {
        if (!cancelled) onError()
      })

    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [onError, onVerify, siteKey])

  return (
    <div className="captcha" aria-label="Xác minh bảo mật">
      <div ref={containerRef} data-testid="turnstile-widget" />
    </div>
  )
}
