import { useCallback, useEffect, useState } from 'react'
import type { RoleDef } from '@engine'
import { customRoleDef, listCustomRoles } from '@/services/library'
import type { CustomRoleRow } from '@/services/types'

/** Vai tùy chỉnh của phiên hiện tại (đọc từ server). */
export function useCustomRoles() {
  const [rows, setRows] = useState<CustomRoleRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setRows(await listCustomRoles())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được vai tùy chỉnh.')
    }
  }, [])

  useEffect(() => {
    let alive = true
    listCustomRoles()
      .then((r) => alive && setRows(r))
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [])

  const defs: RoleDef[] = rows.map(customRoleDef)
  return { rows, defs, error, reload }
}
