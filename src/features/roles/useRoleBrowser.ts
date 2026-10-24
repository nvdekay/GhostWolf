import { setState, useAppState } from '@/app/store'
import { normalize } from '@/lib/text'
import { TEAM_FILTERS } from './catalog'
import { allRoles } from './roles'

/** Tìm kiếm + lọc phe, dùng chung cho màn Chọn bộ vai và Thư viện vai. */
export function useRoleBrowser() {
  const { filter, query } = useAppState()
  const roles = allRoles()
  const q = normalize(query)

  const filters = TEAM_FILTERS.map((f) => ({
    key: f.key,
    label: f.label,
    count: roles.filter((r) => f.key === 'all' || r.team === f.key).length,
    active: filter === f.key,
    onPick: () => setState({ filter: f.key }),
  }))

  const results = roles.filter(
    (r) =>
      (filter === 'all' || r.team === filter) &&
      (!q || normalize(r.name + ' ' + r.short).includes(q)),
  )

  return {
    query,
    filters,
    results,
    setQuery: (v: string) => setState({ query: v }),
    clearQuery: () => setState({ query: '' }),
    openCustom: () =>
      setState({
        sheet: { type: 'custom' },
        cr: { name: query, team: filter === 'all' ? 'village' : filter, short: '', wakes: false },
      }),
    openRole: (id: string) => setState({ sheet: { type: 'role', id } }),
  }
}
