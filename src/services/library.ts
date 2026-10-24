/* Vai tùy chỉnh và bộ vai đã lưu của phiên quản trò (RLS: chỉ chủ sở hữu). */
import type { Counts, RoleDef, Team } from '@engine'
import { supabase } from '@/lib/supabase'
import { fromPostgrest } from './errors'
import type { CustomRoleRow, PresetRow } from './types'

export const customRoleId = (rowId: string) => 'custom:' + rowId

/** Định nghĩa vai giống hệt cách Edge Function dựng (game-command/index.ts). */
export function customRoleDef(r: CustomRoleRow): RoleDef {
  return {
    id: customRoleId(r.id),
    name: r.name,
    team: r.team,
    icon: 'sparkles',
    short: r.short || 'Vai tùy chỉnh do nhóm tự đặt luật.',
    skill: r.short || 'Quản trò xử lý theo luật của nhóm.',
    wake: r.wakes ? 'Mỗi đêm, sau các vai gốc' : 'Không thức dậy',
    gm: true,
    custom: true,
    wakes: r.wakes,
    note: 'Vai do nhóm tạo. Quản trò xử lý kỹ năng thủ công.',
  }
}

export async function listCustomRoles(): Promise<CustomRoleRow[]> {
  const { data, error } = await supabase.from('custom_roles').select('id,name,team,short,wakes').order('created_at')
  if (error) throw fromPostgrest(error)
  return data as CustomRoleRow[]
}

export async function saveCustomRole(input: { id?: string; name: string; team: Team; short: string; wakes: boolean }) {
  const row = { name: input.name.trim(), team: input.team, short: input.short.trim(), wakes: input.wakes, updated_at: new Date().toISOString() }
  const q = input.id
    ? supabase.from('custom_roles').update(row).eq('id', input.id).select('id,name,team,short,wakes').single()
    : supabase.from('custom_roles').insert(row).select('id,name,team,short,wakes').single()
  const { data, error } = await q
  if (error) throw fromPostgrest(error)
  return data as CustomRoleRow
}

export async function deleteCustomRole(id: string) {
  const { error } = await supabase.from('custom_roles').delete().eq('id', id)
  if (error) throw fromPostgrest(error)
}

export async function listPresets(): Promise<PresetRow[]> {
  const { data, error } = await supabase.from('role_presets').select('id,name,counts,updated_at').order('updated_at', { ascending: false })
  if (error) throw fromPostgrest(error)
  return data as PresetRow[]
}

/** Lưu theo tên: cùng tên thì ghi đè. */
export async function savePreset(name: string, counts: Counts) {
  const { data: u } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('role_presets')
    .upsert(
      { owner_id: u.user?.id, name: name.trim(), counts, updated_at: new Date().toISOString() },
      { onConflict: 'owner_id,name' },
    )
    .select('id,name,counts,updated_at')
    .single()
  if (error) throw fromPostgrest(error)
  return data as PresetRow
}

export async function deletePreset(id: string) {
  const { error } = await supabase.from('role_presets').delete().eq('id', id)
  if (error) throw fromPostgrest(error)
}
