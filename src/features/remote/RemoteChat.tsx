import { useEffect, useMemo, useState } from 'react'
import { useFeedback } from '@/app/feedback'
import { Icon } from '@/components/Icon'
import { supabase } from '@/lib/supabase'
import { sendPlayerCommand } from '@/services/player'
import { deleteChatMessage } from '@/services/rooms'
import type { ChatChannel, ChatMessageRow, MemberRow } from '@/services/types'
import './remote.css'

export function RemoteChat({
  roomId,
  gameId,
  channel,
  members,
  canSend,
  isHost = false,
}: {
  roomId: string
  gameId?: string
  channel: Extract<ChatChannel, 'lobby' | 'public' | 'wolves'>
  members: MemberRow[]
  canSend: boolean
  isHost?: boolean
}) {
  const fb = useFeedback()
  const [messages, setMessages] = useState<ChatMessageRow[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [limit, setLimit] = useState(50)
  const names = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members])

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('room_id', roomId)
        .eq('channel', channel)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (!alive) return
      if (error) return fb.error(error)
      setMessages(((data ?? []) as ChatMessageRow[]).reverse())
    }
    const realtime = supabase
      .channel(`chat:${roomId}:${channel}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        () => void load(),
      )
      .subscribe((status) => status === 'SUBSCRIBED' && void load())
    void load()
    return () => {
      alive = false
      void supabase.removeChannel(realtime)
    }
  }, [channel, fb, limit, roomId])

  const send = async () => {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    try {
      await sendPlayerCommand(roomId, gameId, { type: 'chat.send', channel, body: text })
      setBody('')
    } catch (error) {
      fb.error(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="remote-chat" aria-label={channel === 'wolves' ? 'Chat Bầy Sói' : 'Chat'}>
      <div className="remote-chat__head">
        <h2>
          {channel === 'wolves' ? 'Bầy Sói' : channel === 'lobby' ? 'Chat phòng chờ' : 'Thảo luận'}
        </h2>
        {messages.length >= limit && (
          <button className="btn btn-ghost" onClick={() => setLimit((n) => n + 50)}>
            Tin cũ hơn
          </button>
        )}
      </div>
      <ol className="remote-chat__messages" aria-live="polite">
        {messages.map((message) => (
          <li key={message.id} className="remote-chat__message">
            <strong>
              {message.sender_member_id ? names.get(message.sender_member_id) : 'Quản trò'}
            </strong>
            <span>{message.deleted_at ? 'Tin nhắn đã bị quản trò xóa' : message.body}</span>
            {isHost && !message.deleted_at && (
              <button
                className="btn btn-ghost btn-icon"
                aria-label="Xóa tin nhắn"
                onClick={async () => {
                  try {
                    await deleteChatMessage(message.id, 'Xóa từ bảng chat')
                  } catch (error) {
                    fb.error(error)
                  }
                }}
              >
                <Icon name="x" />
              </button>
            )}
          </li>
        ))}
      </ol>
      <div className="remote-chat__composer">
        <label className="sr-only" htmlFor={`chat-${channel}`}>
          Tin nhắn
        </label>
        <textarea
          id={`chat-${channel}`}
          className="input"
          rows={2}
          maxLength={500}
          value={body}
          disabled={!canSend || busy}
          placeholder={canSend ? 'Nhập tin nhắn…' : 'Chat đang khóa'}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
        />
        <button className="btn btn-ink" disabled={!canSend || !body.trim() || busy} onClick={send}>
          Gửi
        </button>
      </div>
      <span className="sr-only" role="status">
        {busy ? 'Đang gửi' : 'Sẵn sàng gửi'}
      </span>
    </section>
  )
}
