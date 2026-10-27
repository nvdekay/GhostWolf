import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { anonClient, command, playerCommand, rpc, serviceClient } from './env'

describe('remote hardening', () => {
  it('thiết bị mới giành quyền và lệnh từ phiên cũ bị từ chối', async () => {
    const host = await anonClient()
    const player = await anonClient()
    const room = await rpc<{ id: string; code: string }>(host.db, 'create_room', {
      p_name: 'Device lease',
      p_options: { mode: 'remote' },
    })
    await rpc(player.db, 'join_room', { p_code: room.data.code, p_name: 'Một tài khoản' })
    const first = randomUUID()
    const second = randomUUID()
    expect(
      (await rpc(player.db, 'claim_player_session', { p_room: room.data.id, p_session: first }))
        .error,
    ).toBeNull()
    expect(
      (await rpc(player.db, 'claim_player_session', { p_room: room.data.id, p_session: second }))
        .error,
    ).toBeNull()

    const stale = await playerCommand(player.db, {
      roomId: room.data.id,
      sessionId: first,
      command: { type: 'player.ready', ready: true },
    })
    expect(stale.status).toBe(409)
    expect(stale.error?.code).toBe('DEVICE_REPLACED')
    expect(
      (
        await playerCommand(player.db, {
          roomId: room.data.id,
          sessionId: second,
          command: { type: 'player.ready', ready: true },
        })
      ).status,
    ).toBe(200)
  })

  it('metrics chỉ service role đọc được và không chứa payload bí mật', async () => {
    const user = await anonClient()
    expect((await user.db.rpc('gw_remote_metrics')).error).not.toBeNull()
    const { data, error } = await serviceClient().rpc('gw_remote_metrics')
    expect(error).toBeNull()
    expect(data).toEqual(
      expect.objectContaining({
        remote_rooms_24h: expect.any(Number),
        active_remote_games: expect.any(Number),
        device_takeovers: expect.any(Number),
      }),
    )
    expect(JSON.stringify(data)).not.toMatch(/payload|role|target|body/i)
  })

  it('retention cron được bật và health chỉ service role đọc được', async () => {
    const user = await anonClient()
    expect((await user.db.rpc('gw_cron_health')).error).not.toBeNull()

    const { data, error } = await serviceClient().rpc('gw_cron_health')
    expect(error).toBeNull()
    expect(data).toEqual(
      expect.objectContaining({
        scheduled: true,
        active: true,
        schedule: '17 3 * * *',
      }),
    )
    expect(JSON.stringify(data)).not.toMatch(/command|payload|role|target|body/i)
  })

  it('phòng 30 người nhận đủ 30 tin đồng thời mà không tạo bản sao', async () => {
    const host = await anonClient()
    const room = await rpc<{ id: string; code: string }>(host.db, 'create_room', {
      p_name: 'Load 30',
      p_options: { mode: 'remote' },
    })
    const clients = []
    for (let index = 0; index < 30; index++) {
      const client = await anonClient()
      const joined = await rpc(client.db, 'join_room', {
        p_code: room.data.code,
        p_name: `Load ${index + 1}`,
      })
      expect(joined.error).toBeNull()
      clients.push(client)
    }
    const sent = await Promise.all(
      clients.map((client, index) =>
        playerCommand(client.db, {
          roomId: room.data.id,
          command: { type: 'chat.send', channel: 'lobby', body: `Tin ${index + 1}` },
        }),
      ),
    )
    expect(sent.every((result) => result.status === 200)).toBe(true)
    const messages = await clients[0]!.db
      .from('chat_messages')
      .select('id')
      .eq('room_id', room.data.id)
    expect(messages.data).toHaveLength(30)
    expect(new Set(messages.data!.map((message) => message.id))).toHaveLength(30)
  }, 60_000)

  it('cleanup xóa prompt/submission riêng của ván đã kết thúc quá hạn', async () => {
    const host = await anonClient()
    const player = await anonClient()
    const service = serviceClient()
    const room = await rpc<{ id: string; code: string }>(host.db, 'create_room', {
      p_name: 'Private retention',
      p_options: { mode: 'remote' },
    })
    const member = await rpc<{ id: string }>(player.db, 'join_room', {
      p_code: room.data.code,
      p_name: 'Dữ liệu cũ',
    })
    for (const name of ['M1', 'M2', 'M3'])
      await rpc(host.db, 'host_add_member', { p_room: room.data.id, p_name: name })
    await rpc(player.db, 'player_set_ready', { p_room: room.data.id, p_ready: true })
    await rpc(host.db, 'host_lock', { p_room: room.data.id })
    const game = await command(host.db, {
      scope: 'room',
      roomId: room.data.id,
      command: { type: 'game.ensure' },
    })
    expect(game.status).toBe(200)
    const gameId = game.data!.gameId
    const promptId = randomUUID()
    expect(
      (
        await service.from('game_prompts').insert({
          id: promptId,
          game_id: gameId,
          member_id: member.data.id,
          phase_sequence: 1,
          kind: 'test',
          payload: { min: 0, max: 0, targets: [] },
        })
      ).error,
    ).toBeNull()
    await service
      .from('games')
      .update({ status: 'ended', ended_at: new Date(Date.now() - 2 * 864e5).toISOString() })
      .eq('id', gameId)
    const cleaned = await rpc<Record<string, number>>(service, 'gw_cleanup', {
      p_closed_days: 30,
      p_history_days: 1,
      p_anon_days: 90,
    })
    expect(cleaned.error).toBeNull()
    expect(cleaned.data.prompts).toBeGreaterThanOrEqual(1)
    expect((await service.from('game_prompts').select('id').eq('id', promptId)).data).toEqual([])
  })
})
