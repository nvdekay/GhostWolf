// RT-02: kết quả đọc ván cũ về muộn không ghi đè ván mới; lỗi query không xóa dữ liệu. RT-03: lọc key presence.
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Result = { data: unknown; error: { message: string } | null }
type Handler = (table: string, filters: Record<string, unknown>) => Promise<Result>

let handler: Handler
/** Trạng thái presence giả và callback 'sync' mà store đăng ký. */
let presenceState: Record<string, unknown[]> = {}
let presenceSync: (() => void) | null = null

function query(table: string) {
  const filters: Record<string, unknown> = {}
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => ((filters[k] = v), q),
    order: () => q,
    maybeSingle: () => handler(table, filters),
    then: (ok: (r: Result) => unknown, bad?: (e: unknown) => unknown) =>
      handler(table, filters).then(ok, bad),
  }
  return q
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => query(t),
    channel: () => {
      const ch = {
        on: (type: string, _f: unknown, cb: () => void) => {
          if (type === 'presence') presenceSync = cb
          return ch
        },
        subscribe: () => ch,
        track: () => {},
        presenceState: () => presenceState,
      }
      return ch
    },
    removeChannel: () => {},
  },
}))
vi.mock('@/services/game', () => ({ noteRevision: () => {} }))

const { RoomStore } = await import('@/realtime/roomStore')

const ok = (data: unknown): Promise<Result> => Promise.resolve({ data, error: null })
const deferred = () => {
  let resolve!: (r: Result) => void
  const promise = new Promise<Result>((r) => (resolve = r))
  return { promise, resolve }
}
const room = (gid: string) => ({ id: 'r1', host_id: 'host', current_game_id: gid })
const game = (id: string, revision = 0) => ({ id, room_id: 'r1', revision, status: 'setup' })

describe('RT-02: room store', () => {
  let currentRoom: ReturnType<typeof room>

  beforeEach(() => {
    currentRoom = room('g1')
  })

  it('bỏ kết quả của ván cũ về muộn sau khi đã chơi lại', async () => {
    const slowG1 = deferred()
    handler = (table, f) => {
      if (table === 'rooms') return ok(currentRoom)
      if (table === 'games') return f.id === 'g1' ? slowG1.promise : ok(game('g2'))
      if (table === 'game_secrets') return ok({ state: { id: f.game_id } })
      if (table === 'assignments') return ok([{ game_id: f.game_id, member_id: 'm1' }])
      return ok([])
    }
    const store = new RoomStore('r1', 'host')
    const first = store.refreshAll() // đọc ván g1, chậm

    await new Promise((r) => setTimeout(r, 0))
    currentRoom = room('g2') // quản trò bấm "Chơi lại"
    await store.refreshAll()
    expect(store.get().game?.id).toBe('g2')

    slowG1.resolve({ data: game('g1', 9), error: null })
    await first
    await new Promise((r) => setTimeout(r, 0))
    expect(store.get().game?.id).toBe('g2')
    expect(store.get().assignments.every((a) => a.game_id === 'g2')).toBe(true)
  })

  it('lỗi query không xóa dữ liệu đang có', async () => {
    let fail = false
    handler = (table, f) => {
      if (fail && table !== 'rooms') return Promise.resolve({ data: null, error: { message: 'x' } })
      if (table === 'rooms') return ok(currentRoom)
      if (table === 'games') return ok(game('g1', 3))
      if (table === 'game_secrets') return ok({ state: { id: f.game_id } })
      if (table === 'assignments') return ok([{ game_id: 'g1', member_id: 'm1' }])
      if (table === 'room_members') return ok([{ id: 'm1', user_id: 'u', status: 'active' }])
      return ok([])
    }
    const store = new RoomStore('r1', 'host')
    await store.refreshAll()
    expect(store.get().game?.revision).toBe(3)
    fail = true
    await store.refreshAll()
    const s = store.get()
    expect(s.game?.revision).toBe(3)
    expect(s.members).toHaveLength(1)
    expect(s.assignments).toHaveLength(1)
  })

  it('presence tới trước danh sách thành viên vẫn hiện online khi thành viên tải xong', async () => {
    let members = [{ id: 'm1', user_id: 'u1', status: 'active' }]
    handler = (table) => {
      if (table === 'rooms') return ok(currentRoom)
      if (table === 'room_members') return ok(members)
      if (table === 'games') return ok(game('g1'))
      return ok(table === 'game_secrets' ? { state: {} } : [])
    }
    const store = new RoomStore('r1', 'host')
    await store.refreshAll()
    // m2 vào phòng: presence sync về trước khi danh sách thành viên được đọc lại.
    presenceState = { host: [{}], m1: [{}], m2: [{}], 'gia-mao': [{}] }
    presenceSync!()
    expect([...store.get().online].sort()).toEqual(['host', 'm1'])
    members = [...members, { id: 'm2', user_id: 'u2', status: 'active' }]
    await store.refreshAll()
    expect([...store.get().online].sort()).toEqual(['host', 'm1', 'm2'])
  })
})
