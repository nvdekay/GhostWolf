import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useFeedback } from '@/app/feedback'
import { Icon } from '@/components/Icon'
import { supabase } from '@/lib/supabase'
import { uuid } from '@/lib/uuid'
import {
  deleteVoiceSignal,
  heartbeatVoice,
  joinVoice,
  leaveVoice,
  loadVoiceSessions,
  loadVoiceSignals,
  sendVoiceSignal,
  voiceIceServers,
} from '@/services/voice'
import type { VoiceChannel, VoiceSessionRow, VoiceSignalRow } from '@/services/types'

const HEARTBEAT_MS = 15_000

interface Peer {
  pc: RTCPeerConnection
  pendingIce: RTCIceCandidateInit[]
  makingOffer: boolean
  ignoreOffer: boolean
  settingAnswer: boolean
}

function RemoteAudio({ stream, name }: { stream: MediaStream; name: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const audio = ref.current
    if (!audio) return
    audio.srcObject = stream
    void audio.play().catch(() => {})
    return () => {
      audio.srcObject = null
    }
  }, [stream])
  return <audio ref={ref} autoPlay playsInline aria-label={`Âm thanh từ ${name}`} />
}

export function VoiceRoom({
  roomId,
  gameId,
  channel,
  canSpeak,
}: {
  roomId: string
  gameId?: string
  channel: VoiceChannel
  canSpeak: boolean
}) {
  const fb = useFeedback()
  const [sessionId] = useState(() => uuid())
  const peers = useRef(new Map<string, Peer>())
  const sessionsRef = useRef<VoiceSessionRow[]>([])
  const localStream = useRef<MediaStream | null>(null)
  const micEnabledRef = useRef(false)
  const handledSignals = useRef(new Set<number>())
  const realtime = useRef<RealtimeChannel | null>(null)
  const mounted = useRef(true)
  const [joined, setJoined] = useState(false)
  const [busy, setBusy] = useState(false)
  const [micEnabled, setMicEnabled] = useState(false)
  const [sessions, setSessions] = useState<VoiceSessionRow[]>([])
  const [streams, setStreams] = useState<Record<string, MediaStream>>({})

  const updateSessions = useCallback((next: VoiceSessionRow[]) => {
    sessionsRef.current = next
    setSessions(next)
  }, [])

  const closePeer = useCallback((peerId: string) => {
    peers.current.get(peerId)?.pc.close()
    peers.current.delete(peerId)
    setStreams((current) => {
      if (!current[peerId]) return current
      const next = { ...current }
      delete next[peerId]
      return next
    })
  }, [])

  const signal = useCallback(
    async (target: string, kind: VoiceSignalRow['kind'], payload: Record<string, unknown>) => {
      try {
        await sendVoiceSignal(sessionId, target, kind, payload)
      } catch {
        closePeer(target)
      }
    },
    [closePeer, sessionId],
  )

  const ensurePeer = useCallback(
    (remote: VoiceSessionRow): Peer => {
      const existing = peers.current.get(remote.session_id)
      if (existing) return existing
      const pc = new RTCPeerConnection({ iceServers: voiceIceServers() })
      const track = localStream.current?.getAudioTracks()[0]
      pc.addTransceiver(track ?? 'audio', { direction: track ? 'sendrecv' : 'recvonly' })
      const peer: Peer = {
        pc,
        pendingIce: [],
        makingOffer: false,
        ignoreOffer: false,
        settingAnswer: false,
      }
      peers.current.set(remote.session_id, peer)
      pc.onicecandidate = ({ candidate }) => {
        if (candidate)
          void signal(
            remote.session_id,
            'ice',
            candidate.toJSON() as unknown as Record<string, unknown>,
          )
      }
      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track])
        setStreams((current) => ({ ...current, [remote.session_id]: stream }))
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed')
          closePeer(remote.session_id)
      }
      pc.onnegotiationneeded = async () => {
        try {
          peer.makingOffer = true
          await pc.setLocalDescription()
          const description = pc.localDescription
          if (description?.type === 'offer' || description?.type === 'answer')
            await signal(remote.session_id, description.type, {
              type: description.type,
              sdp: description.sdp,
            })
        } catch {
          closePeer(remote.session_id)
        } finally {
          peer.makingOffer = false
        }
      }
      return peer
    },
    [closePeer, signal],
  )

  const syncSessions = useCallback(async () => {
    const next = await loadVoiceSessions(roomId, gameId, channel)
    if (!mounted.current) return next
    updateSessions(next)
    const active = new Set(next.map((item) => item.session_id))
    for (const peerId of peers.current.keys()) if (!active.has(peerId)) closePeer(peerId)
    for (const remote of next) if (remote.session_id !== sessionId) ensurePeer(remote)
    return next
  }, [channel, closePeer, ensurePeer, gameId, roomId, sessionId, updateSessions])

  const handleSignal = useCallback(
    async (row: VoiceSignalRow) => {
      if (handledSignals.current.has(row.id) || row.target_session !== sessionId) return
      handledSignals.current.add(row.id)
      try {
        let remote = sessionsRef.current.find((item) => item.session_id === row.sender_session)
        if (!remote) {
          const next = await syncSessions()
          remote = next.find((item) => item.session_id === row.sender_session)
        }
        if (!remote) return
        const peer = ensurePeer(remote)
        const pc = peer.pc
        if (row.kind === 'ice') {
          const candidate = row.payload as RTCIceCandidateInit
          if (pc.remoteDescription) await pc.addIceCandidate(candidate)
          else peer.pendingIce.push(candidate)
          return
        }
        const description = row.payload as unknown as RTCSessionDescriptionInit
        const ready = !peer.makingOffer && (pc.signalingState === 'stable' || peer.settingAnswer)
        const collision = description.type === 'offer' && !ready
        const polite = sessionId > remote.session_id
        peer.ignoreOffer = !polite && collision
        if (peer.ignoreOffer) return
        peer.settingAnswer = description.type === 'answer'
        await pc.setRemoteDescription(description)
        peer.settingAnswer = false
        for (const candidate of peer.pendingIce.splice(0)) await pc.addIceCandidate(candidate)
        if (description.type === 'offer') {
          await pc.setLocalDescription()
          const answer = pc.localDescription
          if (answer)
            await signal(remote.session_id, 'answer', { type: answer.type, sdp: answer.sdp })
        }
      } catch {
        closePeer(row.sender_session)
      } finally {
        void deleteVoiceSignal(row.id, sessionId).catch(() => {})
      }
    },
    [closePeer, ensurePeer, sessionId, signal, syncSessions],
  )

  const stop = useCallback(async () => {
    setJoined(false)
    setMicEnabled(false)
    micEnabledRef.current = false
    updateSessions([])
    localStream.current?.getTracks().forEach((track) => track.stop())
    localStream.current = null
    for (const peer of peers.current.values()) peer.pc.close()
    peers.current.clear()
    setStreams({})
    if (realtime.current) await supabase.removeChannel(realtime.current)
    realtime.current = null
    await leaveVoice(sessionId).catch(() => {})
  }, [sessionId, updateSessions])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      void stop()
    }
  }, [stop])

  useEffect(() => {
    if (!joined) return
    let alive = true
    const channelName = `voice:${roomId}:${channel}:${sessionId}`
    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voice_sessions', filter: `room_id=eq.${roomId}` },
        () => void syncSessions().catch((error) => fb.error(error)),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'voice_signals',
          filter: `target_session=eq.${sessionId}`,
        },
        (event) => void handleSignal(event.new as VoiceSignalRow),
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        void syncSessions()
        void loadVoiceSignals(sessionId).then((rows) => rows.forEach(handleSignal))
      })
    realtime.current = subscription
    const heartbeat = window.setInterval(() => {
      void heartbeatVoice(sessionId, micEnabledRef.current)
        .then((own) => {
          if (!alive) return
          if (!own.mic_enabled && micEnabledRef.current) {
            localStream.current?.getAudioTracks().forEach((track) => (track.enabled = false))
            micEnabledRef.current = false
            setMicEnabled(false)
          }
          void syncSessions()
        })
        .catch((error) => {
          if (alive) {
            fb.error(error)
            void stop()
          }
        })
    }, HEARTBEAT_MS)
    return () => {
      alive = false
      window.clearInterval(heartbeat)
      if (realtime.current === subscription) realtime.current = null
      void supabase.removeChannel(subscription)
    }
  }, [channel, fb, handleSignal, joined, roomId, sessionId, stop, syncSessions])

  useEffect(() => {
    if (canSpeak || !micEnabled) return
    localStream.current?.getAudioTracks().forEach((track) => (track.enabled = false))
    micEnabledRef.current = false
    void heartbeatVoice(sessionId, false).finally(() => {
      if (mounted.current) setMicEnabled(false)
    })
  }, [canSpeak, micEnabled, sessionId])

  const join = async () => {
    setBusy(true)
    try {
      const own = await joinVoice(roomId, gameId, channel, sessionId)
      updateSessions([own])
      setJoined(true)
      fb.toast('Đã tham gia voice · mic đang tắt')
    } catch (error) {
      fb.error(error)
    } finally {
      setBusy(false)
    }
  }

  const toggleMic = async () => {
    const next = !micEnabled
    setBusy(true)
    try {
      if (next) {
        const permission = await heartbeatVoice(sessionId, true)
        if (!permission.can_speak) throw new Error('Bạn chỉ có thể nghe trong kênh voice này.')
        let stream = localStream.current
        if (!stream) {
          if (!navigator.mediaDevices?.getUserMedia)
            throw new Error('Trình duyệt này không hỗ trợ microphone.')
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
          })
          localStream.current = stream
          const track = stream.getAudioTracks()[0]
          if (!track) throw new Error('Không tìm thấy microphone.')
          for (const peer of peers.current.values()) {
            const transceiver =
              peer.pc.getTransceivers().find((item) => item.receiver.track.kind === 'audio') ??
              peer.pc.addTransceiver('audio', { direction: 'recvonly' })
            await transceiver.sender.replaceTrack(track)
            transceiver.direction = 'sendrecv'
          }
        }
        stream.getAudioTracks().forEach((track) => (track.enabled = true))
      } else {
        localStream.current?.getAudioTracks().forEach((track) => (track.enabled = false))
        await heartbeatVoice(sessionId, false)
      }
      micEnabledRef.current = next
      setMicEnabled(next)
      await syncSessions()
    } catch (error) {
      localStream.current?.getAudioTracks().forEach((track) => (track.enabled = false))
      micEnabledRef.current = false
      setMicEnabled(false)
      await heartbeatVoice(sessionId, false).catch(() => {})
      fb.error(error)
    } finally {
      setBusy(false)
    }
  }

  const own = sessions.find((item) => item.session_id === sessionId)
  return (
    <section className="voice-room" aria-label={`Voice ${channel}`} data-joined={joined}>
      <div className="voice-room__summary">
        <span className="voice-room__icon">
          <Icon name="headphones" />
        </span>
        <div>
          <strong>Voice trực tiếp</strong>
          <span className="muted">
            {joined
              ? `${sessions.length} người đang tham gia · âm thanh không được ghi lại`
              : 'Nghe và nói chuyện trực tiếp với mọi người trong kênh'}
          </span>
        </div>
      </div>
      {!joined ? (
        <button className="btn btn-secondary" disabled={busy} onClick={() => void join()}>
          <Icon name="headphones" />
          {busy ? 'Đang kết nối…' : 'Tham gia voice'}
        </button>
      ) : (
        <>
          <ul className="voice-room__people" aria-label="Người trong voice">
            {sessions.map((person) => (
              <li key={person.session_id} data-mic={person.mic_enabled}>
                <span className="dot" />
                <span>{person.display_name}</span>
                <span className="muted">
                  {person.mic_enabled
                    ? 'Đang bật mic'
                    : person.can_speak
                      ? 'Đang tắt mic'
                      : 'Chỉ nghe'}
                </span>
                {streams[person.session_id] && person.session_id !== sessionId && (
                  <RemoteAudio stream={streams[person.session_id]!} name={person.display_name} />
                )}
              </li>
            ))}
          </ul>
          <div className="voice-room__actions">
            <button
              className={micEnabled ? 'btn btn-ink' : 'btn btn-secondary'}
              disabled={busy || !canSpeak || own?.can_speak === false}
              aria-pressed={micEnabled}
              onClick={() => void toggleMic()}
            >
              <Icon name={micEnabled ? 'mic' : 'micOff'} />
              {micEnabled ? 'Tắt mic' : 'Bật mic'}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => void stop()}>
              <Icon name="phoneOff" />
              Rời voice
            </button>
          </div>
          {!canSpeak && <p className="voice-room__note">Bạn đang ở chế độ chỉ nghe.</p>}
        </>
      )}
    </section>
  )
}
