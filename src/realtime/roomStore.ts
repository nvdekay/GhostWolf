/*
 * Đồng bộ một phòng: snapshot từ Postgres + cập nhật qua Realtime.
 * - postgres_changes áp RLS cho từng người: máy người chơi không bao giờ nhận game_secrets hay vai người khác.
 * - Mỗi khi kênh (re)subscribe → lấy lại snapshot (khôi phục sau mất mạng).
 * - Một store cho mỗi phòng, đếm số người dùng (refcount) → remount không tạo subscription trùng.
 * - Presence trên kênh private "room:<id>": chỉ biểu thị online/offline, không loại ai khỏi ván.
 *   Key presence do client tự đặt (thành viên có thể tự xưng 'host' hoặc id người khác), nên chỉ là
 *   gợi ý hiển thị — không bao giờ dùng để phân quyền.
 */
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useEffect, useSyncExternalStore } from 'react'
import type { GameState } from '@engine'
import { supabase } from '@/lib/supabase'
import { uuid } from '@/lib/uuid'
import { noteRevision } from '@/services/game'
import type {
  AssignmentRow,
  GamePromptRow,
  GameRow,
  GameSubmissionRow,
  MemberRow,
  PrivateKnowledgeRow,
  PrivateNoticeRow,
  RemotePhaseRow,
  RoomRow,
} from '@/services/types'

export interface RoomSnapshot {
  loading: boolean
  error: string | null
  /** Kênh realtime đang kết nối. */
  live: boolean
  room: RoomRow | null
  members: MemberRow[]
  game: GameRow | null
  /** Chỉ máy quản trò (RLS). */
  secrets: GameState | null
  /** Quản trò: mọi người; người chơi: chỉ dòng của mình (sau khi gửi vai). */
  assignments: AssignmentRow[]
  remotePhase: RemotePhaseRow | null
  prompts: GamePromptRow[]
  submissions: GameSubmissionRow[]
  knowledge: PrivateKnowledgeRow[]
  notices: PrivateNoticeRow[]
  /** Id thành viên đang online (presence), 'host' cho quản trò. */
  online: Set<string>
  /** Membership của phiên này (người chơi). */
  me: MemberRow | null
}

const RETRY_MS = 1500

const EMPTY: RoomSnapshot = {
  loading: true,
  error: null,
  live: false,
  room: null,
  members: [],
  game: null,
  secrets: null,
  assignments: [],
  remotePhase: null,
  prompts: [],
  submissions: [],
  knowledge: [],
  notices: [],
  online: new Set(),
  me: null,
}

/** Export để test; app dùng qua `useRoom`. */
export class RoomStore {
  private snap: RoomSnapshot = EMPTY
  private listeners = new Set<() => void>()
  private refs = 0
  private db: RealtimeChannel | null = null
  private presence: RealtimeChannel | null = null
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  /** Key presence thô; lọc theo danh sách thành viên mỗi khi một trong hai thay đổi. */
  private presenceKeys: string[] = []
  private stopped = false
  private readonly roomId: string
  private readonly userId: string

  constructor(roomId: string, userId: string) {
    this.roomId = roomId
    this.userId = userId
  }

  get = () => this.snap

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  private set(patch: Partial<RoomSnapshot>) {
    this.snap = { ...this.snap, ...patch }
    if (this.snap.game) noteRevision(this.snap.game.id, this.snap.game.revision)
    this.listeners.forEach((l) => l())
  }

  retain() {
    this.refs++
    if (!this.db) this.start()
  }

  release() {
    this.refs--
    // Trì hoãn để StrictMode/remount nhanh không đóng rồi mở lại kênh.
    setTimeout(() => {
      if (this.refs <= 0 && this.db) this.stop()
    }, 1500)
  }

  private start() {
    this.stopped = false
    const filterRoom = `room_id=eq.${this.roomId}`
    this.db = supabase
      .channel(`room-db:${this.roomId}:${uuid()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${this.roomId}` },
        () => this.later('room'),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members', filter: filterRoom },
        () => this.later('members'),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: filterRoom },
        () => this.later('game'),
      )
      // Không lọc theo ván (ván có thể đổi khi chơi lại); RLS đã giới hạn dòng được nhận.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_secrets' }, () =>
        this.later('game'),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, () =>
        this.later('assignments'),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'remote_phases' }, () =>
        this.later('remote'),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_prompts' }, () =>
        this.later('remote'),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_action_submissions' },
        () => this.later('remote'),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_knowledge' }, () =>
        this.later('remote'),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_notices' }, () =>
        this.later('remote'),
      )
      // SUBSCRIBED đến trước khi server đăng ký xong postgres_changes; thay đổi trong khoảng đó
      // không được đẩy về, nên đọc lại một lần nữa khi server báo đã sẵn sàng.
      .on('system', {}, (p: { extension?: string; status?: string }) => {
        if (p.extension === 'postgres_changes' && p.status === 'ok') void this.refreshAll()
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.set({ live: true })
          void this.refreshAll()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.set({ live: false })
        }
      })
    void this.refreshAll()
  }

  private stop() {
    this.stopped = true
    this.timers.forEach(clearTimeout)
    this.timers.clear()
    if (this.db) void supabase.removeChannel(this.db)
    if (this.presence) void supabase.removeChannel(this.presence)
    this.db = this.presence = null
    stores.delete(this.roomId)
  }

  /** Gộp nhiều sự kiện liên tiếp thành một lần đọc lại (cũng dùng để thử lại sau lỗi). */
  private later(what: 'room' | 'members' | 'game' | 'assignments' | 'remote', delay = 60) {
    clearTimeout(this.timers.get(what))
    this.timers.set(
      what,
      setTimeout(() => {
        if (this.stopped) return
        if (what === 'room') void this.loadRoom()
        if (what === 'members') void this.loadMembers()
        if (what === 'game') void this.loadGame()
        if (what === 'assignments') void this.loadAssignments()
        if (what === 'remote') void this.loadRemote()
      }, delay),
    )
  }

  async refreshAll() {
    const ok = await this.loadRoom()
    if (!ok) return
    await Promise.all([this.loadMembers(), this.loadGame()])
    this.set({ loading: false })
  }

  private async loadRoom(): Promise<boolean> {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', this.roomId)
      .maybeSingle()
    if (error) {
      this.set({ error: error.message, loading: false })
      return false
    }
    const room = data as RoomRow | null
    const prevGame = this.snap.room?.current_game_id
    this.set({ room, error: null })
    if (!room) {
      // Không còn quyền đọc (bị mời ra, đã rời, phòng đóng): đọc dòng membership của chính mình.
      await this.loadMembers()
      this.set({ loading: false })
      return false
    }
    if (room.current_game_id !== prevGame) void this.loadGame()
    return true
  }

  private async loadMembers() {
    const { data, error } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', this.roomId)
      .order('seat')
    // Lỗi tạm thời: giữ danh sách đang có, đọc lại sau.
    if (error) return this.later('members', RETRY_MS)
    const members = (data ?? []) as MemberRow[]
    const mine = members.filter((m) => m.user_id === this.userId)
    const me = mine.find((m) => m.status === 'active') ?? mine.at(-1) ?? null
    this.set({ members, me })
    this.updateOnline()
    if (me && me.status !== 'active') {
      this.set({
        room: null,
        game: null,
        secrets: null,
        assignments: [],
        remotePhase: null,
        prompts: [],
        submissions: [],
        knowledge: [],
        notices: [],
      })
      return
    }
    this.trackPresence()
  }

  private async loadGame() {
    const gid = this.snap.room?.current_game_id
    if (!gid) {
      this.set({
        game: null,
        secrets: null,
        assignments: [],
        remotePhase: null,
        prompts: [],
        submissions: [],
        knowledge: [],
        notices: [],
      })
      return
    }
    const isHost = this.snap.room?.host_id === this.userId
    const [{ data: game, error }, secrets] = await Promise.all([
      supabase.from('games').select('*').eq('id', gid).maybeSingle(),
      isHost
        ? supabase.from('game_secrets').select('state').eq('game_id', gid).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    // Trong lúc chờ, ván hiện hành có thể đã đổi (chơi lại): bỏ kết quả của ván cũ.
    if (this.snap.room?.current_game_id !== gid) return
    if (error || secrets.error) return this.later('game', RETRY_MS)
    const g = game as GameRow | null
    // Bỏ bản cũ hơn nếu sự kiện về không theo thứ tự.
    if (g && this.snap.game?.id === g.id && this.snap.game.revision > g.revision) return
    this.set({ game: g, secrets: (secrets.data as { state: GameState } | null)?.state ?? null })
    await Promise.all([this.loadAssignments(), this.loadRemote()])
  }

  private async loadAssignments() {
    const gid = this.snap.room?.current_game_id
    if (!gid) return
    const { data, error } = await supabase.from('assignments').select('*').eq('game_id', gid)
    if (this.snap.room?.current_game_id !== gid) return
    if (error) return this.later('assignments', RETRY_MS)
    this.set({ assignments: (data ?? []) as AssignmentRow[] })
  }

  private async loadRemote() {
    const gid = this.snap.room?.current_game_id
    if (!gid || this.snap.room?.options?.mode !== 'remote') return
    const [phase, prompts, knowledge, notices] = await Promise.all([
      supabase.from('remote_phases').select('*').eq('game_id', gid).maybeSingle(),
      supabase.from('game_prompts').select('*').eq('game_id', gid).order('created_at'),
      supabase.from('private_knowledge').select('*').eq('game_id', gid).order('created_at'),
      supabase.from('private_notices').select('*').eq('game_id', gid).order('created_at'),
    ])
    if (this.snap.room?.current_game_id !== gid) return
    if (phase.error || prompts.error || knowledge.error || notices.error)
      return this.later('remote', RETRY_MS)
    const promptRows = (prompts.data ?? []) as GamePromptRow[]
    const promptIds = promptRows.map((prompt) => prompt.id)
    const submissions = promptIds.length
      ? await supabase.from('game_action_submissions').select('*').in('prompt_id', promptIds)
      : { data: [], error: null }
    if (submissions.error) return this.later('remote', RETRY_MS)
    this.set({
      remotePhase: phase.data as RemotePhaseRow | null,
      prompts: promptRows,
      submissions: (submissions.data ?? []) as GameSubmissionRow[],
      knowledge: (knowledge.data ?? []) as PrivateKnowledgeRow[],
      notices: (notices.data ?? []) as PrivateNoticeRow[],
    })
  }

  /** Bỏ key không khớp thành viên nào (key do client tự đặt, xem đầu file). */
  private updateOnline() {
    const known = new Set(['host'])
    for (const m of this.snap.members) if (m.status === 'active') known.add(m.id)
    this.set({ online: new Set(this.presenceKeys.filter((k) => known.has(k))) })
  }

  private trackPresence() {
    if (this.presence || this.stopped || !this.snap.room) return
    const isHost = this.snap.room.host_id === this.userId
    const key = isHost ? 'host' : this.snap.me?.id
    if (!key) return
    const ch = supabase.channel(`room:${this.roomId}`, {
      config: { private: true, presence: { key } },
    })
    ch.on('presence', { event: 'sync' }, () => {
      this.presenceKeys = Object.keys(ch.presenceState())
      this.updateOnline()
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') void ch.track({ at: Date.now() })
    })
    this.presence = ch
  }
}

const stores = new Map<string, RoomStore>()

function storeFor(roomId: string, userId: string): RoomStore {
  let s = stores.get(roomId)
  if (!s) {
    s = new RoomStore(roomId, userId)
    stores.set(roomId, s)
  }
  return s
}

/** Dữ liệu phòng đồng bộ realtime. */
export function useRoom(
  roomId: string,
  userId: string,
): RoomSnapshot & { refresh: () => Promise<void> } {
  const store = storeFor(roomId, userId)
  useEffect(() => {
    store.retain()
    return () => store.release()
  }, [store])
  const snap = useSyncExternalStore(store.subscribe, store.get)
  return { ...snap, refresh: () => store.refreshAll() }
}

/** Đọc lại ngay (sau lệnh hoặc khi xung đột revision). */
export function refreshRoom(roomId: string) {
  return stores.get(roomId)?.refreshAll()
}
