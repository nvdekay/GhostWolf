import { describe, expect, it } from 'vitest'
import { anonClient, rpc } from './env'

describe('host recovery', () => {
  it('chuyển quyền bằng mã dùng một lần, xoay mã và thu hồi host cũ', async () => {
    const oldHost = await anonClient()
    const nextHost = await anonClient()
    const member = await anonClient()
    const outsider = await anonClient()

    const created = await rpc<{
      room: { id: string; code: string }
      recovery_key: string
    }>(oldHost.db, 'create_room_with_recovery', {
      p_name: 'Khôi phục quản trò',
      p_options: { mode: 'remote' },
    })
    expect(created.error).toBeNull()
    expect(created.data.recovery_key).toMatch(/^[A-F0-9]{6}(?:-[A-F0-9]{6}){3}$/)

    const room = created.data.room
    expect(
      (
        await rpc(nextHost.db, 'recover_room_host', {
          p_code: room.code,
          p_recovery_key: '000000-000000-000000-000000',
        })
      ).error?.code,
    ).toBe('RECOVERY_INVALID')

    const recovered = await rpc<{ room_id: string; recovery_key: string }>(
      nextHost.db,
      'recover_room_host',
      { p_code: room.code, p_recovery_key: created.data.recovery_key },
    )
    expect(recovered.error).toBeNull()
    expect(recovered.data.room_id).toBe(room.id)
    expect(recovered.data.recovery_key).not.toBe(created.data.recovery_key)

    const oldView = await oldHost.db.from('rooms').select('id').eq('id', room.id)
    expect(oldView.data).toEqual([])
    const nextView = await nextHost.db.from('rooms').select('host_id').eq('id', room.id).single()
    expect(nextView.data?.host_id).toBe(nextHost.uid)
    expect((await rpc(oldHost.db, 'host_lock', { p_room: room.id })).error?.code).toBe('NOT_HOST')

    expect(
      (
        await rpc(outsider.db, 'recover_room_host', {
          p_code: room.code,
          p_recovery_key: created.data.recovery_key,
        })
      ).error?.code,
    ).toBe('RECOVERY_INVALID')

    expect(
      (
        await rpc(member.db, 'join_room', {
          p_code: room.code,
          p_name: 'Người chơi',
        })
      ).error,
    ).toBeNull()
    expect(
      (
        await rpc(member.db, 'recover_room_host', {
          p_code: room.code,
          p_recovery_key: recovered.data.recovery_key,
        })
      ).error?.code,
    ).toBe('RECOVERY_MEMBER')

    expect((await rpc(nextHost.db, 'host_close', { p_room: room.id })).error).toBeNull()
  })

  it('không cho client đọc bảng hash và cho host xoay mã', async () => {
    const host = await anonClient()
    const created = await rpc<{
      room: { id: string }
      recovery_key: string
    }>(host.db, 'create_room_with_recovery', {
      p_name: 'Xoay mã',
      p_options: {},
    })

    const hidden = await host.db.from('room_host_recovery').select('*')
    expect(hidden.error).not.toBeNull()

    const rotated = await rpc<string>(host.db, 'rotate_host_recovery', {
      p_room: created.data.room.id,
    })
    expect(rotated.error).toBeNull()
    expect(rotated.data).toMatch(/^[A-F0-9]{6}(?:-[A-F0-9]{6}){3}$/)
    expect(rotated.data).not.toBe(created.data.recovery_key)

    await rpc(host.db, 'host_close', { p_room: created.data.room.id })
  })
})
