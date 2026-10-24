import { describe, expect, it } from 'vitest'
import { anonClient } from './env'

describe('vai tùy chỉnh và bộ vai đã lưu', () => {
  it('chỉ chủ sở hữu đọc/sửa; không xóa được vai đang có trong bộ vai đã lưu', async () => {
    const a = await anonClient()
    const b = await anonClient()
    const { data: role, error } = await a.db
      .from('custom_roles')
      .insert({ name: 'Bà đồng', team: 'village', short: 'Mỗi đêm…', wakes: true })
      .select()
      .single()
    expect(error).toBeNull()
    expect((await b.db.from('custom_roles').select('id').eq('id', role!.id)).data).toEqual([])
    await b.db.from('custom_roles').update({ name: 'hack' }).eq('id', role!.id)
    expect(
      (await a.db.from('custom_roles').select('name').eq('id', role!.id).single()).data!.name,
    ).toBe('Bà đồng')

    const key = 'custom:' + role!.id
    const { error: pe } = await a.db
      .from('role_presets')
      .insert({ owner_id: a.uid, name: 'Nhóm thứ Sáu', counts: { wolf: 1, [key]: 1, villager: 2 } })
    expect(pe).toBeNull()
    expect((await b.db.from('role_presets').select('id')).data).toEqual([])

    const del = await a.db.from('custom_roles').delete().eq('id', role!.id)
    expect(del.error?.details).toBe('ROLE_IN_USE')

    await a.db.from('role_presets').delete().eq('name', 'Nhóm thứ Sáu')
    expect((await a.db.from('custom_roles').delete().eq('id', role!.id)).error).toBeNull()
  })

  it('không tạo bộ vai cho người khác', async () => {
    const a = await anonClient()
    const b = await anonClient()
    const { error } = await b.db
      .from('role_presets')
      .insert({ owner_id: a.uid, name: 'x', counts: {} })
    expect(error).not.toBeNull()
  })
})
