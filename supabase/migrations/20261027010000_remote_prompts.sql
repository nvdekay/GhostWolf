-- Remote phase 2: private prompt lifecycle, idempotent submissions and secret-channel projection.

create table public.remote_phases (
  game_id uuid primary key references public.games (id) on delete cascade,
  sequence int not null check (sequence >= 0),
  kind text not null,
  started_at timestamptz not null default now(),
  deadline timestamptz,
  locked_at timestamptz,
  status text not null default 'open' check (status in ('open', 'locked', 'expired', 'cancelled')),
  required_count int not null default 0 check (required_count >= 0),
  submitted_count int not null default 0 check (submitted_count >= 0),
  updated_at timestamptz not null default now()
);

create table public.remote_phase_secrets (
  game_id uuid primary key references public.games (id) on delete cascade,
  step text,
  projection jsonb not null default '{}'::jsonb
);

create table public.game_prompts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  member_id uuid not null references public.room_members (id) on delete cascade,
  phase_sequence int not null,
  kind text not null,
  payload jsonb not null,
  status text not null default 'open' check (status in ('open', 'submitted', 'locked', 'expired', 'cancelled')),
  deadline timestamptz,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  locked_at timestamptz,
  unique (game_id, phase_sequence, member_id)
);
create index game_prompts_member on public.game_prompts (member_id, created_at desc);

create table public.game_action_submissions (
  prompt_id uuid not null references public.game_prompts (id) on delete cascade,
  member_id uuid not null references public.room_members (id) on delete cascade,
  client_action_id uuid not null unique,
  payload jsonb not null,
  revision int not null default 1 check (revision > 0),
  submitted_at timestamptz not null default now(),
  primary key (prompt_id, member_id)
);

create table public.chat_channel_memberships (
  game_id uuid not null references public.games (id) on delete cascade,
  channel text not null check (channel in ('wolves')),
  member_id uuid not null references public.room_members (id) on delete cascade,
  can_read boolean not null default false,
  can_write boolean not null default false,
  valid_from_sequence int not null,
  valid_until_sequence int,
  primary key (game_id, channel, member_id)
);

create table public.private_knowledge (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  member_id uuid not null references public.room_members (id) on delete cascade,
  kind text not null,
  day int not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (game_id, member_id, kind, day)
);

create table public.private_notices (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  member_id uuid not null references public.room_members (id) on delete cascade,
  phase_sequence int not null,
  kind text not null,
  payload jsonb not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (game_id, member_id, kind, phase_sequence)
);

create or replace function public.gw_apply_remote_projection(
  p_game uuid, p_projection jsonb
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  seq int;
  duration_seconds int;
  deadline_at timestamptz;
  prompt jsonb;
  wolf_id text;
  private_item jsonb;
begin
  if p_projection is null then return; end if;
  select coalesce(sequence, 0) + 1 into seq from public.remote_phases where game_id = p_game;
  seq := coalesce(seq, 1);
  duration_seconds := case when jsonb_typeof(p_projection -> 'durationSeconds') = 'number'
    then (p_projection ->> 'durationSeconds')::int else null end;
  deadline_at := case when duration_seconds is null then null else now() + make_interval(secs => duration_seconds) end;

  update public.game_prompts set status = 'locked', locked_at = coalesce(locked_at, now())
    where game_id = p_game and status in ('open', 'submitted');
  insert into public.remote_phases (
    game_id, sequence, kind, started_at, deadline, locked_at, status, required_count,
    submitted_count, updated_at
  ) values (
    p_game, seq, p_projection ->> 'kind', now(), deadline_at, null, 'open',
    coalesce((p_projection ->> 'requiredCount')::int, 0), 0, now()
  ) on conflict (game_id) do update set
    sequence = excluded.sequence, kind = excluded.kind, started_at = excluded.started_at,
    deadline = excluded.deadline, locked_at = null, status = 'open',
    required_count = excluded.required_count, submitted_count = 0, updated_at = now();
  insert into public.remote_phase_secrets (game_id, step, projection)
  values (p_game, p_projection ->> 'step', p_projection)
  on conflict (game_id) do update set step = excluded.step, projection = excluded.projection;

  for prompt in select * from jsonb_array_elements(coalesce(p_projection -> 'prompts', '[]'::jsonb)) loop
    insert into public.game_prompts (
      game_id, member_id, phase_sequence, kind, payload, deadline
    ) values (
      p_game, (prompt ->> 'memberId')::uuid, seq, prompt ->> 'kind', prompt -> 'payload', deadline_at
    );
  end loop;

  update public.chat_channel_memberships set can_read = false, can_write = false,
    valid_until_sequence = seq - 1 where game_id = p_game and channel = 'wolves';
  for wolf_id in select jsonb_array_elements_text(coalesce(p_projection -> 'wolfMembers', '[]'::jsonb)) loop
    insert into public.chat_channel_memberships (
      game_id, channel, member_id, can_read, can_write, valid_from_sequence, valid_until_sequence
    ) values (p_game, 'wolves', wolf_id::uuid, true, true, seq, null)
    on conflict (game_id, channel, member_id) do update set can_read = true, can_write = true,
      valid_from_sequence = seq, valid_until_sequence = null;
  end loop;
  for private_item in select * from jsonb_array_elements(coalesce(p_projection -> 'knowledge', '[]'::jsonb)) loop
    insert into public.private_knowledge (game_id, member_id, kind, day, payload)
    values (p_game, (private_item ->> 'memberId')::uuid, private_item ->> 'kind',
      (private_item ->> 'day')::int, private_item -> 'payload')
    on conflict (game_id, member_id, kind, day) do update set payload = excluded.payload;
  end loop;
  for private_item in select * from jsonb_array_elements(coalesce(p_projection -> 'notices', '[]'::jsonb)) loop
    insert into public.private_notices (game_id, member_id, phase_sequence, kind, payload)
    values (p_game, (private_item ->> 'memberId')::uuid, seq, private_item ->> 'kind',
      private_item -> 'payload')
    on conflict (game_id, member_id, kind, phase_sequence) do nothing;
  end loop;
end;
$$;

create or replace function public.submit_remote_action(
  p_game uuid,
  p_prompt uuid,
  p_phase_sequence int,
  p_client_action_id uuid,
  p_payload jsonb
) returns public.game_action_submissions
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.gw_require_user();
  m public.room_members;
  p public.game_prompts;
  phase public.remote_phases;
  existing public.game_action_submissions;
  result public.game_action_submissions;
  target text;
  targets jsonb := coalesce(p_payload -> 'targets', '[]'::jsonb);
  target_count int;
  min_count int;
  max_count int;
begin
  select rm.* into m from public.room_members rm join public.games g on g.room_id = rm.room_id
    where g.id = p_game and rm.user_id = uid and rm.status = 'active';
  if not found then perform public.gw_error('NOT_MEMBER', 'Bạn không còn trong phòng.'); end if;
  select * into p from public.game_prompts where id = p_prompt and game_id = p_game for update;
  if not found or p.member_id <> m.id then perform public.gw_error('NO_PROMPT', 'Prompt này không thuộc về bạn.'); end if;
  select * into phase from public.remote_phases where game_id = p_game for update;
  if phase.sequence <> p_phase_sequence or p.phase_sequence <> p_phase_sequence then
    perform public.gw_error('PHASE_STALE', 'Lượt đã thay đổi. Đã tải trạng thái mới.');
  end if;
  if phase.status <> 'open' or p.status not in ('open', 'submitted') then
    perform public.gw_error('PROMPT_LOCKED', 'Lượt này đã khóa.');
  end if;
  if p.deadline is not null and now() > p.deadline then
    update public.game_prompts set status = 'expired' where id = p.id;
    perform public.gw_error('DEADLINE', 'Đã hết thời gian gửi hành động.');
  end if;
  select * into existing from public.game_action_submissions where client_action_id = p_client_action_id;
  if found then return existing; end if;
  if jsonb_typeof(targets) <> 'array' then perform public.gw_error('BAD_PAYLOAD', 'Danh sách mục tiêu không hợp lệ.'); end if;
  target_count := jsonb_array_length(targets);
  min_count := coalesce((p.payload ->> 'min')::int, 0);
  max_count := coalesce((p.payload ->> 'max')::int, 0);
  if target_count < min_count or target_count > max_count then
    perform public.gw_error('PICK_COUNT', 'Số mục tiêu không hợp lệ.');
  end if;
  for target in select jsonb_array_elements_text(targets) loop
    if not exists (select 1 from jsonb_array_elements(p.payload -> 'targets') x where x ->> 'id' = target) then
      perform public.gw_error('BAD_TARGET', 'Mục tiêu không hợp lệ.');
    end if;
  end loop;
  if p.kind = 'witch' then
    if coalesce((p_payload ->> 'heal')::boolean, false) and not coalesce((p.payload ->> 'healAvailable')::boolean, false) then
      perform public.gw_error('NO_HEAL', 'Không dùng được bình cứu lúc này.');
    end if;
    if p_payload ->> 'poison' is not null and not coalesce((p.payload ->> 'poisonAvailable')::boolean, false) then
      perform public.gw_error('NO_POISON', 'Bình độc đã dùng.');
    end if;
    if p_payload ->> 'poison' is not null and not exists (
      select 1 from jsonb_array_elements(p.payload -> 'targets') x
      where x ->> 'id' = p_payload ->> 'poison'
    ) then perform public.gw_error('BAD_TARGET', 'Mục tiêu bình độc không hợp lệ.'); end if;
  end if;

  insert into public.game_action_submissions (prompt_id, member_id, client_action_id, payload)
  values (p.id, m.id, p_client_action_id, p_payload)
  on conflict (prompt_id, member_id) do update set client_action_id = excluded.client_action_id,
    payload = excluded.payload, revision = public.game_action_submissions.revision + 1,
    submitted_at = now()
  returning * into result;
  update public.game_prompts set status = 'submitted', submitted_at = now() where id = p.id;
  update public.remote_phases set submitted_count = (
    select count(*) from public.game_prompts where game_id = p_game
      and phase_sequence = p_phase_sequence and status = 'submitted'
  ), updated_at = now() where game_id = p_game;
  return result;
end;
$$;

create or replace function public.host_timeout_remote_prompt(
  p_game uuid,
  p_prompt uuid,
  p_actor_user uuid,
  p_client_action_id uuid,
  p_reason text
) returns public.game_action_submissions
language plpgsql volatile security definer set search_path = '' as $$
declare
  p public.game_prompts;
  phase public.remote_phases;
  target_room uuid;
  result public.game_action_submissions;
begin
  select g.room_id into target_room from public.games g join public.rooms r on r.id = g.room_id
    where g.id = p_game and r.host_id = p_actor_user;
  if not found then perform public.gw_error('NOT_HOST', 'Chỉ quản trò được thao tác hộ.'); end if;
  select * into p from public.game_prompts where id = p_prompt and game_id = p_game for update;
  if not found then perform public.gw_error('NO_PROMPT', 'Không tìm thấy prompt.'); end if;
  select * into phase from public.remote_phases where game_id = p_game for update;
  if phase.sequence <> p.phase_sequence then
    perform public.gw_error('PHASE_STALE', 'Lượt đã thay đổi.');
  end if;
  if phase.status <> 'open' or p.status not in ('open', 'submitted') then
    perform public.gw_error('PROMPT_LOCKED', 'Lượt này đã khóa.');
  end if;
  select * into result from public.game_action_submissions
    where client_action_id = p_client_action_id;
  if found then return result; end if;

  insert into public.game_action_submissions (prompt_id, member_id, client_action_id, payload)
  values (p.id, p.member_id, p_client_action_id, '{"targets":[],"timeout":true}'::jsonb)
  on conflict (prompt_id, member_id) do update set client_action_id = excluded.client_action_id,
    payload = excluded.payload, revision = public.game_action_submissions.revision + 1,
    submitted_at = now()
  returning * into result;
  update public.game_prompts set status = 'submitted', submitted_at = now() where id = p.id;
  update public.remote_phases set submitted_count = (
    select count(*) from public.game_prompts where game_id = p_game
      and phase_sequence = phase.sequence and status = 'submitted'
  ), updated_at = now() where game_id = p_game;
  update public.room_members set afk_count = afk_count + 1, updated_at = now() where id = p.member_id;
  insert into public.moderation_events (
    room_id, game_id, actor_user_id, target_member_id, kind, reason, metadata
  ) values (
    target_room, p_game, p_actor_user, p.member_id, 'timeout', left(p_reason, 300),
    jsonb_build_object('promptKind', p.kind, 'phaseSequence', p.phase_sequence)
  );
  return result;
end;
$$;

-- Secret chat is row-filtered, not hidden in UI. Host only gains access after an ended game when configured.
drop policy chat_read on public.chat_messages;
create policy chat_read on public.chat_messages for select to authenticated using (
  channel <> 'wolves' and (public.is_room_host(room_id) or public.is_active_member(room_id))
  or channel = 'wolves' and (
    exists (
      select 1 from public.chat_channel_memberships cm join public.room_members m on m.id = cm.member_id
      where cm.game_id = chat_messages.game_id and cm.channel = 'wolves' and cm.can_read
        and m.user_id = auth.uid() and m.status = 'active'
    )
    or exists (
      select 1 from public.games g join public.rooms r on r.id = g.room_id
      where g.id = chat_messages.game_id and g.status = 'ended'
        and (r.options ->> 'revealWolfChatAfterGame')::boolean
        and (r.host_id = auth.uid() or public.is_active_member(r.id))
    )
  )
);

-- Replace chat sender to enable wolves only for the active projection.
create or replace function public.gw_can_write_wolves(p_game uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_channel_memberships c join public.remote_phases p on p.game_id = c.game_id
    where c.game_id = p_game and c.member_id = p_member and c.channel = 'wolves'
      and c.can_write and p.status = 'open' and p.kind = 'night_action'
  );
$$;

-- Patch only the wolves guard in the phase-1 function body.
do $do$
declare definition text;
begin
  select pg_get_functiondef('public.send_chat_message(uuid,uuid,text,uuid,text,uuid)'::regprocedure) into definition;
  definition := replace(definition,
    $find$elsif p_channel = 'wolves' then
    perform public.gw_error('CHAT_CLOSED', 'Chat Sói chưa mở ở phase này.');$find$,
    $replacement$elsif p_channel = 'wolves' then
    if host_user or p_game is null or not public.gw_can_write_wolves(p_game, m.id) then
      perform public.gw_error('CHAT_CLOSED', 'Chat Sói đang khóa hoặc bạn không có quyền.');
    end if;$replacement$);
  execute definition;
end;
$do$;

drop function public.commit_game(uuid, int, uuid, jsonb, jsonb, text, jsonb, boolean, jsonb);
create function public.commit_game(
  p_game uuid,
  p_expected_revision int,
  p_command_id uuid,
  p_state jsonb,
  p_public jsonb,
  p_label text default null,
  p_history_state jsonb default null,
  p_pop_history boolean default false,
  p_assignments jsonb default null,
  p_remote jsonb default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  cur int;
  prev_rev int;
  new_status public.game_status := (p_state ->> 'status')::public.game_status;
begin
  select revision into cur from public.games where id = p_game for update;
  if not found then perform public.gw_error('NO_GAME', 'Không tìm thấy ván.'); end if;
  select revision into prev_rev from public.game_commands where game_id = p_game and command_id = p_command_id;
  if found then return jsonb_build_object('revision', prev_rev, 'duplicate', true); end if;
  if (select count(*) from public.game_commands
      where game_id = p_game and created_at > now() - interval '10 seconds') >= 60 then
    perform public.gw_error('RATE_LIMITED', 'Thao tác quá nhanh. Đợi vài giây rồi thử lại.');
  end if;
  if cur <> p_expected_revision then
    perform public.gw_error('REVISION_CONFLICT', 'Ván vừa được cập nhật ở nơi khác. Đã tải lại dữ liệu mới.');
  end if;
  if p_pop_history then
    delete from public.game_history where id = (select max(id) from public.game_history where game_id = p_game);
  elsif p_history_state is not null then
    insert into public.game_history (game_id, revision, label, state) values (p_game, cur, coalesce(p_label, ''), p_history_state);
    delete from public.game_history where game_id = p_game and id not in (
      select id from public.game_history where game_id = p_game order by id desc limit 40);
  end if;
  if p_assignments is not null then
    delete from public.assignments where game_id = p_game;
    insert into public.assignments (game_id, member_id, role_id, role)
    select p_game, (x ->> 'member_id')::uuid, x ->> 'role_id', x -> 'role'
    from jsonb_array_elements(p_assignments) x;
  end if;
  update public.game_secrets set state = p_state where game_id = p_game;
  update public.games set public_state = p_public, status = new_status, revision = cur + 1, updated_at = now(),
    ended_at = case when new_status = 'ended' then coalesce(ended_at, now()) else null end where id = p_game;
  insert into public.game_commands (game_id, command_id, revision) values (p_game, p_command_id, cur + 1);
  perform public.gw_apply_remote_projection(p_game, p_remote);
  return jsonb_build_object('revision', cur + 1, 'duplicate', false);
end;
$$;

-- Remote rooms cannot be locked until every device player explicitly confirms readiness.
create or replace function public.host_lock(p_room uuid) returns public.rooms
language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.rooms := public.gw_host_room(p_room);
  n int;
begin
  if r.status <> 'open' then perform public.gw_error('ROOM_LOCKED', 'Phòng đã chốt.'); end if;
  select count(*) into n from public.room_members where room_id = r.id and status = 'active';
  if n < 4 then perform public.gw_error('TOO_FEW', format('Cần ít nhất 4 người · còn thiếu %s.', 4 - n)); end if;
  if r.options ->> 'mode' = 'remote' and exists (
    select 1 from public.room_members where room_id = r.id and status = 'active' and device and not ready
  ) then perform public.gw_error('NOT_READY', 'Còn người chơi chưa sẵn sàng.'); end if;
  update public.room_members m set seat = x.rn
  from (select id, row_number() over (order by seat, joined_at) as rn
        from public.room_members where room_id = r.id and status = 'active') x
  where m.id = x.id;
  update public.rooms set status = 'locked', updated_at = now() where id = r.id returning * into r;
  return r;
end;
$$;

revoke all on public.remote_phases, public.remote_phase_secrets, public.game_prompts,
  public.game_action_submissions, public.chat_channel_memberships, public.private_knowledge,
  public.private_notices from anon, authenticated;
grant select on public.remote_phases, public.game_prompts, public.game_action_submissions,
  public.chat_channel_memberships, public.private_knowledge, public.private_notices to authenticated;
grant execute on function public.submit_remote_action(uuid, uuid, int, uuid, jsonb) to authenticated;
grant execute on function public.gw_apply_remote_projection(uuid, jsonb),
  public.commit_game(uuid, int, uuid, jsonb, jsonb, text, jsonb, boolean, jsonb, jsonb),
  public.host_timeout_remote_prompt(uuid, uuid, uuid, uuid, text) to service_role;

alter table public.remote_phases enable row level security;
alter table public.remote_phase_secrets enable row level security;
alter table public.game_prompts enable row level security;
alter table public.game_action_submissions enable row level security;
alter table public.chat_channel_memberships enable row level security;
alter table public.private_knowledge enable row level security;
alter table public.private_notices enable row level security;

create policy remote_phase_read on public.remote_phases for select to authenticated using (
  public.is_game_host(game_id) or exists (
    select 1 from public.games g where g.id = game_id and public.is_active_member(g.room_id)
  )
);
create policy prompt_read on public.game_prompts for select to authenticated using (
  public.is_game_host(game_id) or exists (
    select 1 from public.room_members m where m.id = member_id and m.user_id = auth.uid() and m.status = 'active'
  )
);
create policy submission_read on public.game_action_submissions for select to authenticated using (
  exists (select 1 from public.game_prompts p where p.id = prompt_id and (
    public.is_game_host(p.game_id) or exists (
      select 1 from public.room_members m where m.id = member_id and m.user_id = auth.uid() and m.status = 'active'
    )
  ))
);
create policy channel_membership_own on public.chat_channel_memberships for select to authenticated using (
  exists (select 1 from public.room_members m where m.id = member_id and m.user_id = auth.uid() and m.status = 'active')
);
create policy knowledge_own on public.private_knowledge for select to authenticated using (
  public.is_game_host(game_id) or exists (
    select 1 from public.room_members m where m.id = member_id and m.user_id = auth.uid() and m.status = 'active'
  )
);
create policy notices_own on public.private_notices for select to authenticated using (
  public.is_game_host(game_id) or exists (
    select 1 from public.room_members m where m.id = member_id and m.user_id = auth.uid() and m.status = 'active'
  )
);

alter publication supabase_realtime add table public.remote_phases, public.game_prompts,
  public.game_action_submissions, public.chat_channel_memberships, public.private_knowledge,
  public.private_notices;
