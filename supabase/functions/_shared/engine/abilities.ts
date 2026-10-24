/*
 * Năng lực vai tách riêng theo từng quyết định — không dùng một hàm "isWolfTeam" cho mọi việc.
 *  - winTeam: phe khi tính thắng (Sói trắng là phe riêng).
 *  - isPack: thuộc bầy sói khi cắn (không bị bầy cắn, giữ lượt cắn khi bầy chỉ còn Sói trắng).
 *  - seerSeesWolf: kết quả soi của Tiên tri.
 *  - isWolfSide: tính vào "số sói" khi xét điều kiện thắng của bầy sói (chỉ phe Sói).
 */
import { findRoleDef } from './catalog.ts'
import type { GameState, Player, RoleDef, Team } from './types.ts'

export function roleDef(state: Pick<GameState, 'customRoles'>, roleId: string): RoleDef {
  const def = findRoleDef(roleId, state.customRoles)
  if (!def) throw new Error(`Vai không tồn tại: ${roleId}`)
  return def
}

export function winTeam(state: Pick<GameState, 'customRoles'>, roleId: string): Team {
  return roleDef(state, roleId).team
}

export function isPack(state: Pick<GameState, 'customRoles'>, roleId: string): boolean {
  return roleId === 'whitewolf' || roleDef(state, roleId).team === 'wolf'
}

export function isWolfSide(state: Pick<GameState, 'customRoles'>, roleId: string): boolean {
  return roleDef(state, roleId).team === 'wolf'
}

export function seerSeesWolf(state: Pick<GameState, 'customRoles'>, roleId: string): boolean {
  return isPack(state, roleId)
}

export const alivePlayers = (s: GameState): Player[] => s.players.filter((p) => p.alive)
