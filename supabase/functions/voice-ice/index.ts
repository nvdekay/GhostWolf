import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  FALLBACK_ICE_SERVERS,
  generateCloudflareIceServers,
  type VoiceIcePayload,
} from '../_shared/voice-ice.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  })
const fail = (status: number, code: string, message: string) =>
  json(status, { error: { code, message } })

export async function handleVoiceIce(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail(405, 'METHOD', 'Chỉ nhận POST.')
  try {
    const auth = req.headers.get('Authorization') ?? ''
    const token = auth.replace(/^Bearer\s+/i, '')
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    })
    const { data: userData, error: userError } = await db.auth.getUser(token)
    if (userError || !userData.user)
      return fail(401, 'AUTH_REQUIRED', 'Phiên đăng nhập không hợp lệ.')

    const body = (await req.json().catch(() => null)) as {
      roomId?: string
      sessionId?: string
    } | null
    if (!body || !UUID.test(body.roomId ?? '') || !UUID.test(body.sessionId ?? ''))
      return fail(400, 'BAD_REQUEST', 'Yêu cầu không hợp lệ.')

    const cutoff = new Date(Date.now() - 60_000).toISOString()
    const { data: session, error: sessionError } = await db
      .from('voice_sessions')
      .select('session_id')
      .eq('room_id', body.roomId!)
      .eq('session_id', body.sessionId!)
      .eq('user_id', userData.user.id)
      .gte('last_seen', cutoff)
      .maybeSingle()
    if (sessionError || !session)
      return fail(403, 'VOICE_SESSION_REQUIRED', 'Hãy tham gia voice trước khi kết nối âm thanh.')

    const keyId = Deno.env.get('CLOUDFLARE_TURN_KEY_ID')
    const apiToken = Deno.env.get('CLOUDFLARE_TURN_API_TOKEN')
    if (!keyId || !apiToken) {
      const payload: VoiceIcePayload = {
        iceServers: FALLBACK_ICE_SERVERS,
        expiresAt: null,
        relay: false,
      }
      return json(200, payload)
    }

    const ttl = 21_600
    const iceServers = await generateCloudflareIceServers(keyId, apiToken, ttl)
    const payload: VoiceIcePayload = {
      iceServers,
      expiresAt: new Date(Date.now() + ttl * 1_000).toISOString(),
      relay: true,
    }
    return json(200, payload)
  } catch (error) {
    console.error(
      JSON.stringify({
        fn: 'voice-ice',
        status: 502,
        detail: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
      }),
    )
    return fail(502, 'TURN_UNAVAILABLE', 'Không lấy được cấu hình relay âm thanh.')
  }
}

if (import.meta.main) {
  const port = Number(Deno.env.get('PORT') ?? 0)
  Deno.serve(port ? { port } : {}, handleVoiceIce)
}
