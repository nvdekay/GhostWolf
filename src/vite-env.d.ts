/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Cloudflare Turnstile public site key. Bỏ trống để tắt CAPTCHA ở local. */
  readonly VITE_TURNSTILE_SITE_KEY?: string
  /** Mặc định `${VITE_SUPABASE_URL}/functions/v1`. */
  readonly VITE_FUNCTIONS_URL?: string
}
