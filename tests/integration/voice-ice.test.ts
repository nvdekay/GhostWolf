import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anonClient, rpc } from './env'

let host: { db: SupabaseClient; uid: string }
let player: { db: SupabaseClient; uid: string }
let room: { id: string; code: string }
let sessionId: string

async function requestIce(db: SupabaseClient | null, body: unknown) {
  const token = db ? (await db.auth.getSession()).data.session?.access_token : undefined
  return fetch(`${process.env.FUNCTIONS_URL ?? 'http://127.0.0.1:54329'}/voice-ice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  host = await anonClient()
  player = await anonClient()
  room = (
    await rpc<{ id: string; code: string }>(host.db, 'create_room', {
      p_name: 'Voice ICE',
      p_options: { mode: 'remote' },
    })
  ).data
  await rpc(player.db, 'join_room', { p_code: room.code, p_name: 'ICE player' })
  sessionId = randomUUID()
  expect(
    (
      await rpc(host.db, 'join_voice', {
        p_room: room.id,
        p_game: null,
        p_channel: 'lobby',
        p_session: sessionId,
        p_mic_enabled: false,
      })
    ).error,
  ).toBeNull()
})

describe('voice-ice edge function', () => {
  it('chỉ cấp ICE config sau khi chính user đã join voice', async () => {
    const response = await requestIce(host.db, { roomId: room.id, sessionId })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      relay: false,
      expiresAt: null,
      iceServers: [{ urls: expect.arrayContaining(['stun:stun.cloudflare.com:3478']) }],
    })
  })

  it('không cho participant dùng session voice của người khác', async () => {
    const response = await requestIce(player.db, { roomId: room.id, sessionId })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'VOICE_SESSION_REQUIRED' },
    })
  })

  it('từ chối request không có JWT', async () => {
    const response = await requestIce(null, { roomId: room.id, sessionId })
    expect(response.status).toBe(401)
  })
})
