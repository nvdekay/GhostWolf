-- Remote phase 3: private voting through the prompt lifecycle and server-owned deadline extension.

create or replace function public.submit_remote_vote(
  p_game uuid,
  p_phase_sequence int,
  p_client_action_id uuid,
  p_candidate uuid
) returns public.game_action_submissions
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.gw_require_user();
  m public.room_members;
  p public.game_prompts;
  allow_change boolean;
begin
  select rm.* into m
  from public.room_members rm
  join public.games g on g.room_id = rm.room_id
  where g.id = p_game and rm.user_id = uid and rm.status = 'active';
  if not found then perform public.gw_error('NOT_MEMBER', 'Bạn không còn trong phòng.'); end if;
  select coalesce((r.options ->> 'allowVoteChange')::boolean, true) into allow_change
  from public.games g join public.rooms r on r.id = g.room_id where g.id = p_game;
  select * into p from public.game_prompts
    where game_id = p_game and member_id = m.id and phase_sequence = p_phase_sequence and kind = 'vote';
  if not found then perform public.gw_error('NO_PROMPT', 'Bạn không có quyền bỏ phiếu ở lượt này.'); end if;
  if not allow_change and exists (
    select 1 from public.game_action_submissions where prompt_id = p.id and member_id = m.id
  ) then perform public.gw_error('VOTE_LOCKED', 'Phòng này không cho đổi phiếu.'); end if;
  return public.submit_remote_action(
    p_game, p.id, p_phase_sequence, p_client_action_id,
    jsonb_build_object('targets', case when p_candidate is null then '[]'::jsonb
      else jsonb_build_array(p_candidate::text) end)
  );
end;
$$;

create or replace function public.host_extend_remote_phase(
  p_game uuid,
  p_actor_user uuid,
  p_seconds int,
  p_reason text
) returns public.remote_phases
language plpgsql volatile security definer set search_path = '' as $$
declare
  target_room uuid;
  phase public.remote_phases;
begin
  if p_seconds < 1 or p_seconds > 600 then
    perform public.gw_error('BAD_DURATION', 'Mỗi lần chỉ được gia hạn tối đa 10 phút.');
  end if;
  select g.room_id into target_room from public.games g join public.rooms r on r.id = g.room_id
    where g.id = p_game and r.host_id = p_actor_user;
  if not found then perform public.gw_error('NOT_HOST', 'Chỉ quản trò được gia hạn.'); end if;
  update public.remote_phases set
    deadline = greatest(coalesce(deadline, now()), now()) + make_interval(secs => p_seconds),
    updated_at = now()
  where game_id = p_game and status = 'open'
  returning * into phase;
  if not found then perform public.gw_error('PHASE_LOCKED', 'Phase đã khóa.'); end if;
  update public.game_prompts set deadline = phase.deadline
    where game_id = p_game and phase_sequence = phase.sequence and status in ('open', 'submitted');
  insert into public.moderation_events (
    room_id, game_id, actor_user_id, kind, reason, metadata
  ) values (
    target_room, p_game, p_actor_user, 'extend_deadline', left(coalesce(p_reason, ''), 300),
    jsonb_build_object('seconds', p_seconds, 'phaseSequence', phase.sequence)
  );
  return phase;
end;
$$;

revoke all on function public.submit_remote_vote(uuid, int, uuid, uuid) from public;
grant execute on function public.submit_remote_vote(uuid, int, uuid, uuid) to authenticated;
revoke all on function public.host_extend_remote_phase(uuid, uuid, int, text) from public;
grant execute on function public.host_extend_remote_phase(uuid, uuid, int, text) to service_role;

-- The host sees prompt status/progress, never the private vote/action payload before aggregation.
drop policy submission_read on public.game_action_submissions;
create policy submission_read on public.game_action_submissions for select to authenticated using (
  exists (
    select 1 from public.room_members m
    where m.id = member_id and m.user_id = auth.uid() and m.status = 'active'
  )
);
