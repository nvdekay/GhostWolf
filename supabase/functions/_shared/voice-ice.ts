export interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

export interface VoiceIcePayload {
  iceServers: IceServer[]
  expiresAt: string | null
  relay: boolean
}

export const FALLBACK_ICE_SERVERS: IceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
]

function validUrl(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= 300 && /^(?:stun|turn|turns):[^\s]+$/i.test(value)
  )
}

/** Accept only the small ICE shape browsers need; never proxy arbitrary provider JSON. */
export function parseIceServers(value: unknown): IceServer[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8)
    throw new Error('TURN provider returned an invalid ICE server list.')
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid ICE server entry.')
    const source = item as Record<string, unknown>
    const urls = Array.isArray(source.urls) ? source.urls : [source.urls]
    if (urls.length === 0 || urls.length > 12 || !urls.every(validUrl))
      throw new Error('Invalid ICE server URL.')
    const hasTurn = urls.some((url) => /^turns?:/i.test(url))
    const username = source.username
    const credential = source.credential
    if (
      hasTurn &&
      (typeof username !== 'string' ||
        !username ||
        username.length > 512 ||
        typeof credential !== 'string' ||
        !credential ||
        credential.length > 512)
    )
      throw new Error('TURN credentials are missing or invalid.')
    return {
      urls,
      ...(typeof username === 'string' ? { username } : {}),
      ...(typeof credential === 'string' ? { credential } : {}),
    }
  })
}

export async function generateCloudflareIceServers(
  keyId: string,
  apiToken: string,
  ttl: number,
  request: typeof fetch = fetch,
): Promise<IceServer[]> {
  const response = await request(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl }),
    },
  )
  if (!response.ok) throw new Error(`TURN provider failed with HTTP ${response.status}.`)
  const body = (await response.json()) as { iceServers?: unknown }
  return parseIceServers(body.iceServers)
}
