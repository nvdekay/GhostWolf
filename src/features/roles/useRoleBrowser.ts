import { useState } from 'react'
import type { RoleDef, Team } from '@engine'
import { normalize } from '@/lib/text'
import { allRoles } from './roles'

const FILTERS: { key: Team | 'all'; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'village', label: 'Dân làng' },
  { key: 'wolf', label: 'Ma sói' },
  { key: 'solo', label: 'Phe riêng' },
]

/** Tìm kiếm không phân biệt hoa thường/dấu + lọc phe. */
export function useRoleBrowser(custom: RoleDef[]) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Team | 'all'>('all')
  const roles = allRoles(custom)
  const q = normalize(query.trim())
  const filters = FILTERS.map((f) => ({
    key: f.key,
    label: f.label,
    count: roles.filter((r) => f.key === 'all' || r.team === f.key).length,
    active: filter === f.key,
    onPick: () => setFilter(f.key),
  }))
  const results = roles.filter(
    (r) =>
      (filter === 'all' || r.team === filter) &&
      (!q || normalize(`${r.name} ${r.short}`).includes(q)),
  )
  return { query, setQuery, filter, filters, results, clearQuery: () => setQuery('') }
}
