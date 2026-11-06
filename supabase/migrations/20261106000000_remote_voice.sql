-- Live audio for remote rooms. WebRTC carries audio peer-to-peer; Postgres only stores short-lived
-- participant presence and signaling envelopes. No audio is recorded or persisted.

create table public.voice_sessions (
  session_id uuid primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  game_id uuid references public.games (id) on delete cascade,
  channel text not null check (channel in ('lobby', 'public', 'wolves')),
  user_id uuid not null references auth.users (id) on delete cascade,
  member_id uuid references public.room_members (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  can_speak boolean not null default false,
  mic_enabled boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (room_id, user_id)
);
create index voice_sessions_scope
  on public.voice_sessions (room_id, channel, game_id, last_seen desc);

create table public.voice_signals (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  sender_session uuid not null references public.voice_sessions (session_id) on delete cascade,
  target_session uuid not null references public.voice_sessions (session_id) on delete cascade,
  kind text not null check (kind in ('offer', 'answer', 'ice')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 65536),
  created_at timestamptz not null default now(),
  check (sender_session <> target_session)
);
create index voice_signals_target on public.voice_signals (target_session, id);
create index voice_signals_sender_rate on public.voice_signals (sender_session, created_at desc);

-- Read access follows the same phase/channel boundaries as text chat. Dead players may listen to
-- public discussion but cannot speak. The host never gets live access to the wolves channel.
create or replace function public.gw_voice_can_read(
  p_room uuid, p_game uuid, p_channel text
) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r public.rooms;
  g public.games;
  m public.room_members;
  host_user boolean;
begin
  if uid is null or p_channel not in ('lobby', 'public', 'wolves') then return false; end if;
  select * into r from public.rooms where id = p_room;
  if not found or r.status = 'closed' or r.options ->> 'mode' <> 'remote' then return false; end if;
  host_user := r.host_id = uid;
  select * into m from public.room_members
    where room_id = p_room and user_id = uid and status = 'active' and device;
  if not host_user and not found then return false; end if;

  if p_channel = 'lobby' then
    return p_game is null and r.status = 'open';
  end if;

  select * into g from public.games where id = p_game and room_id = p_room;
  if not found then return false; end if;
  if p_channel = 'public' then
    return g.status = 'ended' or (
      g.status = 'playing' and g.public_state ->> 'phase' = 'day'
      and g.public_state ->> 'dayStep' = 'discuss'
    );
  end if;
  if host_user then return false; end if;
  return exists (
    select 1 from public.chat_channel_memberships c
    join public.remote_phases p on p.game_id = c.game_id
    where c.game_id = p_game and c.member_id = m.id and c.channel = 'wolves'
      and c.can_read and p.status = 'open' and p.kind = 'night_action'
  );
end;
$$;

create or replace function public.gw_voice_can_speak(
  p_room uuid, p_game uuid, p_channel text
) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r public.rooms;
  g public.games;
  m public.room_members;
begin
  if not public.gw_voice_can_read(p_room, p_game, p_channel) then return false; end if;
  select * into r from public.rooms where id = p_room;
  if r.host_id = uid then return p_channel <> 'wolves'; end if;
  select * into m from public.room_members
    where room_id = p_room and user_id = uid and status = 'active' and device;
  if not found or (m.muted_until is not null and m.muted_until > now()) then return false; end if;
  if p_channel = 'lobby' then return true; end if;
  select * into g from public.games where id = p_game and room_id = p_room;
  if p_channel = 'wolves' then return public.gw_can_write_wolves(p_game, m.id); end if;
  if g.status = 'ended' then return true; end if;
  return coalesce((
    select (x ->> 'alive')::boolean
    from jsonb_array_elements(g.public_state -> 'players') x
    where x ->> 'id' = m.id::text
  ), false);
end;
$$;

create or replace function public.join_voice(
  p_room uuid, p_game uuid, p_channel text, p_session uuid, p_mic_enabled boolean default false
) returns public.voice_sessions
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.gw_require_user();
  r public.rooms;
  m public.room_members;
  result public.voice_sessions;
  speak boolean;
  active_count int;
begin
  if not public.gw_voice_can_read(p_room, p_game, p_channel) then
    perform public.gw_error('VOICE_CLOSED', 'Voice đang khóa hoặc bạn không có quyền tham gia.');
  end if;
  select * into r from public.rooms where id = p_room;
  select * into m from public.room_members
    where room_id = p_room and user_id = uid and status = 'active' and device;
  speak := public.gw_voice_can_speak(p_room, p_game, p_channel);

  delete from public.voice_sessions where last_seen < now() - interval '45 seconds';
  delete from public.voice_signals where created_at < now() - interval '5 minutes';
  delete from public.voice_sessions where room_id = p_room and user_id = uid;
  select count(*) into active_count from public.voice_sessions
    where room_id = p_room and channel = p_channel and game_id is not distinct from p_game
      and last_seen >= now() - interval '45 seconds';
  if active_count >= 16 then
    perform public.gw_error('VOICE_FULL', 'Kênh voice đã đủ 16 người đang kết nối.');
  end if;

  insert into public.voice_sessions (
    session_id, room_id, game_id, channel, user_id, member_id, display_name,
    can_speak, mic_enabled
  ) values (
    p_session, p_room, p_game, p_channel, uid, case when r.host_id = uid then null else m.id end,
    case when r.host_id = uid then 'Quản trò' else m.name end, speak, speak and p_mic_enabled
  ) returning * into result;
  return result;
end;
$$;

create or replace function public.heartbeat_voice(
  p_session uuid, p_mic_enabled boolean
) returns public.voice_sessions
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.gw_require_user();
  current public.voice_sessions;
  result public.voice_sessions;
  speak boolean;
begin
  select * into current from public.voice_sessions
    where session_id = p_session and user_id = uid for update;
  if not found then perform public.gw_error('VOICE_SESSION', 'Phiên voice không còn hoạt động.'); end if;
  if not public.gw_voice_can_read(current.room_id, current.game_id, current.channel) then
    delete from public.voice_sessions where session_id = current.session_id;
    perform public.gw_error('VOICE_CLOSED', 'Kênh voice đã đóng.');
  end if;
  speak := public.gw_voice_can_speak(current.room_id, current.game_id, current.channel);
  update public.voice_sessions set
    can_speak = speak,
    mic_enabled = speak and p_mic_enabled,
    last_seen = now()
  where session_id = current.session_id
  returning * into result;
  delete from public.voice_sessions where last_seen < now() - interval '45 seconds';
  delete from public.voice_signals where created_at < now() - interval '5 minutes';
  return result;
end;
$$;

create or replace function public.leave_voice(p_session uuid) returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.voice_sessions where session_id = p_session and user_id = auth.uid();
$$;

create or replace function public.send_voice_signal(
  p_session uuid, p_target uuid, p_kind text, p_payload jsonb
) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.gw_require_user();
  sender public.voice_sessions;
  target public.voice_sessions;
  result bigint;
begin
  if p_kind not in ('offer', 'answer', 'ice') or jsonb_typeof(p_payload) <> 'object'
    or pg_column_size(p_payload) > 65536 then
    perform public.gw_error('BAD_SIGNAL', 'Tín hiệu voice không hợp lệ.');
  end if;
  select * into sender from public.voice_sessions
    where session_id = p_session and user_id = uid and last_seen >= now() - interval '45 seconds';
  if not found or not public.gw_voice_can_read(sender.room_id, sender.game_id, sender.channel) then
    perform public.gw_error('VOICE_SESSION', 'Phiên voice không còn hoạt động.');
  end if;
  select * into target from public.voice_sessions
    where session_id = p_target and room_id = sender.room_id and channel = sender.channel
      and game_id is not distinct from sender.game_id and last_seen >= now() - interval '45 seconds';
  if not found or target.session_id = sender.session_id then
    perform public.gw_error('VOICE_TARGET', 'Người nhận voice không còn kết nối.');
  end if;
  if (select count(*) from public.voice_signals
      where sender_session = sender.session_id and created_at > now() - interval '10 seconds') >= 500 then
    perform public.gw_error('RATE_LIMITED', 'Tín hiệu voice gửi quá nhanh.');
  end if;
  insert into public.voice_signals (room_id, sender_session, target_session, kind, payload)
  values (sender.room_id, sender.session_id, target.session_id, p_kind, p_payload)
  returning id into result;
  return result;
end;
$$;

revoke all on public.voice_sessions, public.voice_signals from anon, authenticated;
grant select on public.voice_sessions, public.voice_signals to authenticated;
grant delete on public.voice_signals to authenticated;
revoke all on function public.gw_voice_can_read(uuid, uuid, text),
  public.gw_voice_can_speak(uuid, uuid, text), public.join_voice(uuid, uuid, text, uuid, boolean),
  public.heartbeat_voice(uuid, boolean), public.leave_voice(uuid),
  public.send_voice_signal(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.gw_voice_can_read(uuid, uuid, text),
  public.gw_voice_can_speak(uuid, uuid, text), public.join_voice(uuid, uuid, text, uuid, boolean),
  public.heartbeat_voice(uuid, boolean), public.leave_voice(uuid),
  public.send_voice_signal(uuid, uuid, text, jsonb) to authenticated;

alter table public.voice_sessions enable row level security;
alter table public.voice_signals enable row level security;
create policy voice_session_read on public.voice_sessions for select to authenticated using (
  last_seen >= now() - interval '60 seconds'
  and public.gw_voice_can_read(room_id, game_id, channel)
);
create policy voice_signal_target_read on public.voice_signals for select to authenticated using (
  exists (
    select 1 from public.voice_sessions s
    where s.session_id = target_session and s.user_id = auth.uid()
      and s.last_seen >= now() - interval '60 seconds'
  )
);
create policy voice_signal_target_delete on public.voice_signals for delete to authenticated using (
  exists (
    select 1 from public.voice_sessions s
    where s.session_id = target_session and s.user_id = auth.uid()
  )
);

alter publication supabase_realtime add table public.voice_sessions, public.voice_signals;

-- Preserve the existing remote funnel and add only an aggregate live-voice count. No SDP, ICE,
-- user id or participant name is exposed through metrics.
create or replace function public.gw_remote_metrics()
returns jsonb
language sql stable security definer set search_path = '' as $$
  with cohort as (
    select r.id
    from public.rooms r
    where r.options ->> 'mode' = 'remote'
      and r.created_at > now() - interval '24 hours'
  ), funnel as (
    select
      count(*) as created,
      count(*) filter (where exists (
        select 1 from public.room_members m where m.room_id = c.id and m.device
      )) as joined,
      count(*) filter (where exists (
        select 1 from public.room_members m where m.room_id = c.id and m.device
      ) and not exists (
        select 1 from public.room_members m where m.room_id = c.id and m.device and not m.ready
      )) as ready,
      count(*) filter (where exists (
        select 1 from public.games g
        where g.room_id = c.id and g.status in ('playing', 'ended')
      )) as started,
      count(*) filter (where exists (
        select 1 from public.games g where g.room_id = c.id and g.status = 'ended'
      )) as finished
    from cohort c
  )
  select jsonb_build_object(
    'remote_rooms_24h', (select created from funnel),
    'funnel_24h', (select jsonb_build_object(
      'created', created,
      'joined', joined,
      'ready', ready,
      'started', started,
      'finished', finished
    ) from funnel),
    'active_remote_games', (select count(*) from public.games g join public.rooms r on r.id = g.room_id
      where r.options ->> 'mode' = 'remote' and g.status = 'playing'),
    'active_voice_sessions', (select count(*) from public.voice_sessions
      where last_seen >= now() - interval '45 seconds'),
    'open_prompts', (select count(*) from public.game_prompts where status in ('open', 'submitted')),
    'expired_prompts_24h', (select count(*) from public.game_prompts
      where status = 'expired' and deadline > now() - interval '24 hours'),
    'afk_total', (select coalesce(sum(afk_count), 0) from public.room_members),
    'device_takeovers', (select coalesce(sum(greatest(claim_count - 1, 0)), 0)
      from public.player_device_sessions),
    'moderation_24h', (select count(*) from public.moderation_events
      where created_at > now() - interval '24 hours')
  );
$$;

revoke all on function public.gw_remote_metrics() from public, anon, authenticated;
grant execute on function public.gw_remote_metrics() to service_role;
