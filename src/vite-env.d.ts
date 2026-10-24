/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Mặc định `${VITE_SUPABASE_URL}/functions/v1`. */
  readonly VITE_FUNCTIONS_URL?: string
}
