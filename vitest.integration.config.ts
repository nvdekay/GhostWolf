import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/** Cần Supabase local đang chạy: `npm run db:start` (xem README). */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
      '@engine': fileURLToPath(
        new URL('./supabase/functions/_shared/engine/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
})
