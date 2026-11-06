import { describe, expect, it, vi } from 'vitest'
import {
  FALLBACK_ICE_SERVERS,
  generateCloudflareIceServers,
  parseIceServers,
} from '@shared/voice-ice.ts'

const relay = {
  urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443'],
  username: 'short-lived-user',
  credential: 'short-lived-secret',
}

describe('voice ICE credentials', () => {
  it('giữ fallback STUN không chứa credential', () => {
    expect(FALLBACK_ICE_SERVERS).toEqual([
      { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
    ])
  })

  it('chỉ nhận STUN/TURN hợp lệ và credential đầy đủ', () => {
    expect(parseIceServers([{ urls: 'stun:stun.cloudflare.com:3478' }, relay])).toEqual([
      { urls: ['stun:stun.cloudflare.com:3478'] },
      relay,
    ])
    expect(() => parseIceServers([{ urls: 'https://example.com' }])).toThrow()
    expect(() => parseIceServers([{ urls: 'turn:turn.cloudflare.com:3478' }])).toThrow()
  })

  it('gọi Cloudflare bằng token server-side và TTL ngắn hạn', async () => {
    const request = vi.fn(
      async () =>
        new Response(JSON.stringify({ iceServers: [relay] }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    await expect(
      generateCloudflareIceServers('key/id', 'api-secret', 21_600, request),
    ).resolves.toEqual([relay])
    expect(request).toHaveBeenCalledWith(
      'https://rtc.live.cloudflare.com/v1/turn/keys/key%2Fid/credentials/generate-ice-servers',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer api-secret' }),
        body: JSON.stringify({ ttl: 21_600 }),
      }),
    )
  })

  it('không chấp nhận lỗi hoặc payload sai từ provider', async () => {
    await expect(
      generateCloudflareIceServers(
        'key',
        'token',
        21_600,
        async () => new Response('', { status: 503 }),
      ),
    ).rejects.toThrow('HTTP 503')
    await expect(
      generateCloudflareIceServers(
        'key',
        'token',
        21_600,
        async () => new Response(JSON.stringify({ iceServers: [] }), { status: 201 }),
      ),
    ).rejects.toThrow('invalid ICE server list')
  })
})
