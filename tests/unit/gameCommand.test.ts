// Request lệnh treo (mạng thật) không được làm bàn quản trò kẹt: hết thời hạn thì gửi lại cùng commandId.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } },
  sameHostUrl: (u: string) => u,
}))

const { sendGameCommand, COMMAND_TIMEOUT_MS } = await import('@/services/game')

type Call = { body: { commandId: string }; signal?: AbortSignal }

describe('sendGameCommand', () => {
  let calls: Call[]
  beforeEach(() => {
    vi.useFakeTimers()
    calls = []
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('request treo bị hủy sau thời hạn rồi gửi lại với cùng commandId', async () => {
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      calls.push({ body: JSON.parse(init.body as string), signal: init.signal ?? undefined })
      if (calls.length === 1)
        // Lần đầu: không bao giờ trả lời, chỉ dừng khi bị hủy.
        return new Promise((_, reject) =>
          init.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError'))),
        )
      return Promise.resolve(
        new Response(JSON.stringify({ gameId: 'g', revision: 5, duplicate: true }), {
          status: 200,
        }),
      )
    })
    const p = sendGameCommand('g-timeout', { type: 'night.start' })
    await vi.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS + 2000)
    await expect(p).resolves.toMatchObject({ revision: 5 })
    expect(calls).toHaveLength(2)
    expect(calls[0]!.signal?.aborted).toBe(true)
    expect(calls[1]!.body.commandId).toBe(calls[0]!.body.commandId)
  })

  it('treo mãi thì báo lỗi mạng thay vì chờ vô hạn', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) =>
          init.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError'))),
        ),
    )
    const p = sendGameCommand('g-hang', { type: 'night.start' })
    const settled = p.then(
      () => 'ok',
      (e: Error & { code?: string }) => e.code,
    )
    await vi.advanceTimersByTimeAsync((COMMAND_TIMEOUT_MS + 2000) * 3)
    expect(await settled).toBe('NETWORK')
  })
})
