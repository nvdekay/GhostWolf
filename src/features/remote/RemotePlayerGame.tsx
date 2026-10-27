import { useEffect, useState } from 'react'
import { useFeedback } from '@/app/feedback'
import { Icon } from '@/components/Icon'
import type { RoomSnapshot } from '@/realtime/roomStore'
import { sendPlayerCommand } from '@/services/player'
import type { GamePromptRow, GameRow, MemberRow, RoomRow } from '@/services/types'
import { RemoteChat } from './RemoteChat'
import './remote.css'

const PHASE_LABEL: Record<string, string> = {
  role_confirmation: 'Chờ mọi người xác nhận vai',
  night_action: 'Ngôi làng đang ngủ',
  night_review: 'Quản trò đang xem lại kết quả đêm',
  day_announcement: 'Trời sáng',
  effect_resolution: 'Đang xử lý hiệu ứng',
  day_discussion: 'Thảo luận ban ngày',
  day_voting: 'Bỏ phiếu',
  vote_result: 'Đang chờ công bố kết quả',
  game_result: 'Kết quả ván',
}

function Deadline({ value }: { value: string | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!value) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [value])
  if (!value) return null
  const left = Math.max(0, Math.ceil((new Date(value).getTime() - now) / 1000))
  return (
    <span className="remote-game__deadline tabular" aria-label={`${left} giây còn lại`}>
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
    </span>
  )
}

function PromptCard({
  room,
  game,
  prompt,
  snap,
}: {
  room: RoomRow
  game: GameRow
  prompt: GamePromptRow
  snap: RoomSnapshot & { refresh: () => Promise<void> }
}) {
  const fb = useFeedback()
  const submitted = snap.submissions.find((row) => row.prompt_id === prompt.id)
  const submittedTargets =
    submitted?.payload.targets ?? (submitted?.payload.poison ? [submitted.payload.poison] : [])
  const [key, setKey] = useState(prompt.id)
  const [targets, setTargets] = useState<string[]>(submittedTargets)
  const [heal, setHeal] = useState(!!submitted?.payload.heal)
  const [busy, setBusy] = useState(false)
  if (key !== prompt.id) {
    setKey(prompt.id)
    setTargets(submittedTargets)
    setHeal(!!submitted?.payload.heal)
  }

  const toggle = (id: string) =>
    setTargets((current) => {
      if (current.includes(id)) return current.filter((target) => target !== id)
      if (prompt.payload.max === 1) return [id]
      return [...current, id].slice(-prompt.payload.max)
    })
  const valid =
    prompt.kind === 'witch' ||
    (targets.length >= prompt.payload.min && targets.length <= prompt.payload.max)

  const submit = async () => {
    setBusy(true)
    try {
      await sendPlayerCommand(
        room.id,
        game.id,
        prompt.kind === 'vote'
          ? {
              type: 'vote.submit',
              phaseSequence: prompt.phase_sequence,
              candidateId: targets[0] ?? null,
            }
          : {
              type: 'action.submit',
              promptId: prompt.id,
              phaseSequence: prompt.phase_sequence,
              payload:
                prompt.kind === 'witch'
                  ? { targets: [], heal, poison: targets[0] ?? null }
                  : { targets },
            },
      )
      await snap.refresh()
      fb.toast(submitted ? 'Đã cập nhật lựa chọn' : 'Server đã nhận hành động')
    } catch (error) {
      fb.error(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="remote-prompt" aria-label="Hành động bí mật">
      <div className="remote-prompt__head">
        <div>
          <span className="eyebrow">Chỉ bạn nhìn thấy</span>
          <h2>{prompt.payload.title}</h2>
        </div>
        <Deadline value={prompt.deadline} />
      </div>
      <p className="muted">{prompt.payload.instructions}</p>
      {prompt.kind === 'witch' && prompt.payload.wolfVictim && (
        <div className="note-box">Bầy Sói đang nhắm tới {prompt.payload.wolfVictim.name}.</div>
      )}
      {prompt.kind === 'witch' && prompt.payload.healAvailable && (
        <label className="remote-prompt__heal">
          <input
            type="checkbox"
            checked={heal}
            onChange={(event) => setHeal(event.target.checked)}
          />
          Dùng bình cứu
        </label>
      )}
      {prompt.payload.targets.length > 0 && (
        <div className="remote-prompt__targets">
          {prompt.payload.targets.map((target) => (
            <button
              key={target.id}
              className="btn btn-secondary"
              aria-pressed={targets.includes(target.id)}
              onClick={() => toggle(target.id)}
            >
              {target.name}
            </button>
          ))}
        </div>
      )}
      <button className="btn btn-ink btn-lg btn-block" disabled={!valid || busy} onClick={submit}>
        {busy
          ? 'Đang gửi…'
          : submitted
            ? prompt.kind === 'vote'
              ? 'Đổi phiếu'
              : 'Cập nhật lựa chọn'
            : prompt.kind === 'vote'
              ? 'Gửi phiếu'
              : 'Xác nhận hành động'}
      </button>
      <p className="remote-prompt__status" role="status">
        {busy
          ? 'Đang gửi tới server'
          : submitted
            ? `Đã ghi nhận · lần ${submitted.revision}`
            : 'Chưa gửi'}
      </p>
    </section>
  )
}

export function RemotePlayerGame({
  room,
  game,
  me,
  snap,
  onLeave,
}: {
  room: RoomRow
  game: GameRow
  me: MemberRow
  snap: RoomSnapshot & { refresh: () => Promise<void> }
  onLeave: () => void
}) {
  const phase = snap.remotePhase
  const prompt = snap.prompts.find(
    (row) => row.member_id === me.id && row.phase_sequence === phase?.sequence,
  )
  const myPublic = game.public_state.players.find((player) => player.id === me.id)
  const canPublicChat =
    game.status === 'ended' || (phase?.kind === 'day_discussion' && (myPublic?.alive ?? false))

  return (
    <main className="join remote-game">
      <div className="join__bar join__bar--split">
        <span className="muted join__meta">
          {room.name} · {me.name}
        </span>
        <button className="btn btn-ghost btn-ghost--muted" onClick={onLeave}>
          Rời phòng
        </button>
      </div>
      <div className="join__phase">
        <span className="gold-text">
          <Icon name={game.public_state.phase === 'night' ? 'moon' : 'sun'} size={28} />
        </span>
        <h1 aria-live="polite">
          {phase ? (PHASE_LABEL[phase.kind] ?? phase.kind) : 'Đang đồng bộ lượt…'}
        </h1>
        <p className="muted">Ngày {game.public_state.day}</p>
        <Deadline value={phase?.deadline ?? null} />
      </div>
      <div className="join__alive" data-alive={myPublic?.alive ?? true}>
        <span className="dot" />
        {myPublic?.alive === false ? 'Bạn đã bị loại · chỉ được theo dõi' : 'Bạn đang còn sống'}
      </div>
      {prompt ? (
        <PromptCard room={room} game={game} prompt={prompt} snap={snap} />
      ) : phase?.kind === 'night_action' ? (
        <div className="remote-game__waiting">
          <Icon name="lock" size={28} />
          <p>Hãy chờ trong im lặng. Nếu đến lượt, hành động bí mật sẽ xuất hiện tại đây.</p>
        </div>
      ) : null}
      {prompt?.kind === 'wolf' && (
        <RemoteChat
          roomId={room.id}
          gameId={game.id}
          channel="wolves"
          members={snap.members}
          canSend
        />
      )}
      {phase?.kind === 'day_discussion' && (
        <RemoteChat
          roomId={room.id}
          gameId={game.id}
          channel="public"
          members={snap.members}
          canSend={canPublicChat}
        />
      )}
      {phase?.kind === 'vote_result' && game.public_state.voteResult && (
        <section className="remote-notebook" aria-label="Kết quả bỏ phiếu">
          <h2>Kết quả bỏ phiếu</h2>
          <ul>
            {Object.entries(game.public_state.voteResult.tally).map(([memberId, count]) => (
              <li key={memberId}>
                {snap.members.find((member) => member.id === memberId)?.name ?? 'Người chơi'}:{' '}
                {count} phiếu
              </li>
            ))}
            <li>Phiếu trắng: {game.public_state.voteResult.abstain}</li>
          </ul>
        </section>
      )}
      {snap.knowledge.length > 0 && (
        <section className="remote-notebook">
          <h2>Sổ riêng</h2>
          <ul>
            {snap.knowledge.map((item) => (
              <li key={item.id}>
                Ngày {item.day}: {String(item.payload.summary ?? item.kind)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {snap.notices.map((item) => (
        <div className="note-box" role="status" key={item.id}>
          {String(item.payload.summary ?? item.kind)}
        </div>
      ))}
    </main>
  )
}
