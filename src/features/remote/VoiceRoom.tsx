import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useFeedback } from '@/app/feedback'
import { Icon } from '@/components/Icon'
import { supabase } from '@/lib/supabase'
import { uuid } from '@/lib/uuid'
import {
  deleteVoiceSignal,
  fallbackVoiceIceServers,
  heartbeatVoice,
  joinVoice,
  leaveVoice,
  loadVoiceIceServers,
  loadVoiceSessions,
  loadVoiceSignals,
  sendVoiceSignal,
} from '@/services/voice'
import type { VoiceChannel, VoiceSessionRow, VoiceSignalRow } from '@/services/types'
import {
  removeVoiceSession,
  shouldInitiateVoicePeer,
  upsertVoiceSession,
  voiceSessionInScope,
} from './voiceSessionState'

const HEARTBEAT_MS = 15_000
const RECONCILE_EVERY_HEARTBEATS = 4

interface Peer {
  pc: RTCPeerConnection
  pendingIce: RTCIceCandidateInit[]
  makingOffer: boolean
  ignoreOffer: boolean
  settingAnswer: boolean
  operations: Promise<void>
  iceRestarted: boolean
  disconnectTimer?: number
}

function RemoteAudio({ stream, name }: { stream: MediaStream; name: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playbackBlocked, setPlaybackBlocked] = useState(false)

  const play = useCallback(async () => {
    const audio = ref.current
    if (!audio) return
    try {
      await audio.play()
      setPlaybackBlocked(false)
    } catch {
      setPlaybackBlocked(true)
    }
  }, [])

  useEffect(() => {
    const audio = ref.current
    if (!audio) return
    audio.srcObject = stream
    void play()
    return () => {
      audio.srcObject = null
    }
  }, [play, stream])

  return (
    <>
      <audio
        ref={ref}
        playsInline
        aria-label={`Âm thanh từ ${name}`}
        onPlaying={() => setPlaybackBlocked(false)}
      />
      {playbackBlocked && (
        <button className="btn btn-ghost" onClick={() => void play()}>
          Phát âm thanh từ {name}
        </button>
      )}
    </>
  )
}

function enqueuePeerOperation(peer: Peer, operation: () => Promise<void>) {
  const next = peer.operations.then(operation, operation)
  peer.operations = next.catch(() => {})
  return next
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
  const iceServers = useRef<RTCIceServer[]>(fallbackVoiceIceServers())
  const micEnabledRef = useRef(false)
  const handledSignals = useRef(new Set<number>())
  const realtime = useRef<RealtimeChannel | null>(null)
  const syncInFlight = useRef<{ key: string; request: Promise<VoiceSessionRow[]> } | null>(null)
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
    const peer = peers.current.get(peerId)
    if (peer?.disconnectTimer) window.clearTimeout(peer.disconnectTimer)
    peer?.pc.close()
    peers.current.delete(peerId)
    setStreams((current) => {
      if (!current[peerId]) return current
      const next = { ...current }
      delete next[peerId]
      return next
    })
  }, [])

  const signal = useCallback(
    (target: string, kind: VoiceSignalRow['kind'], payload: Record<string, unknown>) =>
      sendVoiceSignal(sessionId, target, kind, payload),
    [sessionId],
  )

  const ensurePeer = useCallback(
    (remote: VoiceSessionRow): Peer => {
      const existing = peers.current.get(remote.session_id)
      if (existing) return existing
      const pc = new RTCPeerConnection({ iceServers: iceServers.current })
      const track = localStream.current?.getAudioTracks()[0]
      pc.addTransceiver(track ?? 'audio', { direction: track ? 'sendrecv' : 'recvonly' })
      const peer: Peer = {
        pc,
        pendingIce: [],
        makingOffer: false,
        ignoreOffer: false,
        settingAnswer: false,
        operations: Promise.resolve(),
        iceRestarted: false,
      }
      peers.current.set(remote.session_id, peer)
      pc.onicecandidate = ({ candidate }) => {
        if (candidate)
          void signal(
            remote.session_id,
            'ice',
            candidate.toJSON() as unknown as Record<string, unknown>,
          ).catch(() => closePeer(remote.session_id))
      }
      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track])
        setStreams((current) => ({ ...current, [remote.session_id]: stream }))
      }
      const restartIce = () => {
        if (peer.iceRestarted) {
          closePeer(remote.session_id)
          return
        }
        peer.iceRestarted = true
        if (peer.disconnectTimer) window.clearTimeout(peer.disconnectTimer)
        pc.restartIce()
        peer.disconnectTimer = window.setTimeout(() => {
          peer.disconnectTimer = undefined
          if (peers.current.get(remote.session_id) === peer && pc.connectionState !== 'connected')
            closePeer(remote.session_id)
        }, 8_000)
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          peer.iceRestarted = false
          if (peer.disconnectTimer) window.clearTimeout(peer.disconnectTimer)
          peer.disconnectTimer = undefined
          return
        }
        if (pc.connectionState === 'disconnected' && !peer.disconnectTimer) {
          peer.disconnectTimer = window.setTimeout(() => {
            peer.disconnectTimer = undefined
            if (
              peers.current.get(remote.session_id) === peer &&
              pc.connectionState === 'disconnected'
            )
              restartIce()
          }, 3_000)
          return
        }
        if (pc.connectionState === 'failed') {
          restartIce()
          return
        }
        if (pc.connectionState === 'closed') closePeer(remote.session_id)
      }
      pc.onnegotiationneeded = () => {
        void enqueuePeerOperation(peer, async () => {
          if (pc.signalingState === 'closed') return
          try {
            peer.makingOffer = true
            await pc.setLocalDescription()
            const description = pc.localDescription
            if (description?.type === 'offer' || description?.type === 'answer')
              await signal(remote.session_id, description.type, {
                type: description.type,
                sdp: description.sdp,
              })
          } finally {
            peer.makingOffer = false
          }
        }).catch(() => closePeer(remote.session_id))
      }
      return peer
    },
    [closePeer, signal],
  )

  const syncSessions = useCallback(() => {
    const key = `${roomId}:${gameId ?? ''}:${channel}`
    if (syncInFlight.current?.key === key) return syncInFlight.current.request
    const request = loadVoiceSessions(roomId, gameId, channel).then((next) => {
      if (!mounted.current) return next
      updateSessions(next)
      const active = new Set(next.map((item) => item.session_id))
      for (const peerId of peers.current.keys()) if (!active.has(peerId)) closePeer(peerId)
      for (const remote of next)
        if (shouldInitiateVoicePeer(sessionId, remote.session_id)) ensurePeer(remote)
      return next
    })
    syncInFlight.current = { key, request }
    void request.then(
      () => {
        if (syncInFlight.current?.request === request) syncInFlight.current = null
      },
      () => {
        if (syncInFlight.current?.request === request) syncInFlight.current = null
      },
    )
    return request
  }, [channel, closePeer, ensurePeer, gameId, roomId, sessionId, updateSessions])

  const applySession = useCallback(
    (row: VoiceSessionRow) => {
      const scope = { roomId, gameId, channel }
      if (!voiceSessionInScope(row, scope)) return
      updateSessions(upsertVoiceSession(sessionsRef.current, row, scope))
      if (shouldInitiateVoicePeer(sessionId, row.session_id)) ensurePeer(row)
    },
    [channel, ensurePeer, gameId, roomId, sessionId, updateSessions],
  )

  const dropSession = useCallback(
    (removedSessionId: string) => {
      updateSessions(removeVoiceSession(sessionsRef.current, removedSessionId))
      if (removedSessionId !== sessionId) closePeer(removedSessionId)
    },
    [closePeer, sessionId, updateSessions],
  )

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
        await enqueuePeerOperation(peer, async () => {
          const pc = peer.pc
          if (pc.signalingState === 'closed') return
          if (row.kind === 'ice') {
            if (peer.ignoreOffer) return
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
          try {
            await pc.setRemoteDescription(description)
          } finally {
            peer.settingAnswer = false
          }
          for (const candidate of peer.pendingIce.splice(0)) await pc.addIceCandidate(candidate)
          if (description.type === 'offer') {
            await pc.setLocalDescription()
            const answer = pc.localDescription
            if (answer)
              await signal(remote.session_id, 'answer', { type: answer.type, sdp: answer.sdp })
          }
        })
      } catch {
        closePeer(row.sender_session)
      } finally {
        void deleteVoiceSignal(row.id, sessionId).catch(() => {})
      }
    },
    [closePeer, ensurePeer, sessionId, signal, syncSessions],
  )

  const releaseMicrophone = useCallback(async () => {
    const stream = localStream.current
    localStream.current = null
    for (const track of stream?.getTracks() ?? []) {
      track.onended = null
      track.stop()
    }
    const replacements: Promise<void>[] = []
    for (const peer of peers.current.values()) {
      const transceiver = peer.pc
        .getTransceivers()
        .find((item) => item.receiver.track.kind === 'audio')
      if (!transceiver) continue
      replacements.push(transceiver.sender.replaceTrack(null))
      if (transceiver.direction === 'sendrecv') transceiver.direction = 'recvonly'
      if (transceiver.direction === 'sendonly') transceiver.direction = 'inactive'
    }
    await Promise.all(replacements)
  }, [])

  const handleMicrophoneEnded = useCallback(
    (stream: MediaStream) => {
      if (localStream.current !== stream) return
      micEnabledRef.current = false
      setMicEnabled(false)
      void releaseMicrophone()
        .then(() => heartbeatVoice(sessionId, false))
        .then(applySession)
        .catch((error) => fb.error(error))
      fb.toast('Micro đã ngắt kết nối')
    },
    [applySession, fb, releaseMicrophone, sessionId],
  )

  const stop = useCallback(async () => {
    setJoined(false)
    setMicEnabled(false)
    micEnabledRef.current = false
    updateSessions([])
    for (const peer of peers.current.values()) peer.pc.close()
    peers.current.clear()
    await releaseMicrophone()
    setStreams({})
    if (realtime.current) await supabase.removeChannel(realtime.current)
    realtime.current = null
    await leaveVoice(sessionId).catch(() => {})
  }, [releaseMicrophone, sessionId, updateSessions])

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
    let heartbeatsSinceReconcile = 0
    const channelName = `voice:${roomId}:${channel}:${sessionId}`
    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voice_sessions', filter: `room_id=eq.${roomId}` },
        (event) => {
          if (event.eventType === 'DELETE') {
            const removedSessionId = (event.old as Partial<VoiceSessionRow>).session_id
            if (removedSessionId) dropSession(removedSessionId)
            return
          }
          const row = event.new as VoiceSessionRow
          if (row.session_id) applySession(row)
        },
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
        .then(async (own) => {
          if (!alive) return
          if (!own.mic_enabled && micEnabledRef.current) {
            await releaseMicrophone()
            micEnabledRef.current = false
            setMicEnabled(false)
          }
          applySession(own)
          heartbeatsSinceReconcile += 1
          if (heartbeatsSinceReconcile >= RECONCILE_EVERY_HEARTBEATS) {
            heartbeatsSinceReconcile = 0
            void syncSessions().catch((error) => fb.error(error))
          }
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
  }, [
    applySession,
    channel,
    dropSession,
    fb,
    handleSignal,
    joined,
    roomId,
    releaseMicrophone,
    sessionId,
    stop,
    syncSessions,
  ])

  useEffect(() => {
    if (canSpeak || !micEnabled) return
    micEnabledRef.current = false
    void releaseMicrophone()
      .then(() => heartbeatVoice(sessionId, false))
      .then(applySession)
      .catch((error) => fb.error(error))
      .finally(() => {
        if (mounted.current) setMicEnabled(false)
      })
  }, [applySession, canSpeak, fb, micEnabled, releaseMicrophone, sessionId])

  const join = async () => {
    setBusy(true)
    try {
      const own = await joinVoice(roomId, gameId, channel, sessionId)
      iceServers.current = await loadVoiceIceServers(roomId, sessionId)
        .then((config) => config.iceServers)
        .catch(() => fallbackVoiceIceServers())
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
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error('Trình duyệt này không hỗ trợ microphone.')
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        })
        const track = stream.getAudioTracks()[0]
        if (!track) {
          stream.getTracks().forEach((item) => item.stop())
          throw new Error('Không tìm thấy microphone.')
        }
        const permission = await heartbeatVoice(sessionId, true)
        if (!permission.can_speak) {
          stream.getTracks().forEach((item) => item.stop())
          throw new Error('Bạn chỉ có thể nghe trong kênh voice này.')
        }
        localStream.current = stream
        track.onended = () => handleMicrophoneEnded(stream)
        for (const peer of peers.current.values()) {
          const transceiver =
            peer.pc.getTransceivers().find((item) => item.receiver.track.kind === 'audio') ??
            peer.pc.addTransceiver('audio', { direction: 'recvonly' })
          await transceiver.sender.replaceTrack(track)
          transceiver.direction = 'sendrecv'
        }
        track.enabled = true
        applySession(permission)
      } else {
        await releaseMicrophone()
        applySession(await heartbeatVoice(sessionId, false))
      }
      micEnabledRef.current = next
      setMicEnabled(next)
    } catch (error) {
      await releaseMicrophone().catch(() => {})
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
