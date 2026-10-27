-- Remote phase 4: one controlling device, privacy-safe metrics and retention.

create table public.player_device_sessions (
  member_id uuid primary key references public.room_members (id) on delete cascade,
  session_id uuid not null,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claim_count int not null default 1 check (claim_count > 0)
);

alter table public.player_device_sessions enable row level security;
create policy device_session_own on public.player_device_sessions for select to authenticated using (
  exists (
    select 1 from public.room_members m
    where m.id = member_id and m.user_id = auth.uid() and m.status = 'active'
  )
);
revoke all on public.player_device_sessions from anon, authenticated;
grant select on public.player_device_sessions to authenticated;
alter publication supabase_realtime add table public.player_device_sessions;

create or replace function public.gw_ignore_duplicate_private_notice()
returns trigger
language plpgsql volatile security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.private_notices n
    where n.game_id = new.game_id and n.member_id = new.member_id and n.kind = new.kind
  ) then return null; end if;
  return new;
end;
$$;
create trigger private_notice_dedupe before insert on public.private_notices
for each row execute function public.gw_ignore_duplicate_private_notice();
revoke all on function public.gw_ignore_duplicate_private_notice() from public, anon, authenticated;

create or replace function public.claim_player_session(p_room uuid, p_session uuid)
returns public.player_device_sessions
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.gw_require_user();
  m public.room_members;
  result public.player_device_sessions;
begin
  select rm.* into m from public.room_members rm join public.rooms r on r.id = rm.room_id
    where rm.room_id = p_room and rm.user_id = uid and rm.status = 'active'
      and rm.device and r.status <> 'closed' and r.options ->> 'mode' = 'remote';
  if not found then perform public.gw_error('NOT_MEMBER', 'Không có ghế remote đang hoạt động.'); end if;
  insert into public.player_device_sessions (member_id, session_id)
  values (m.id, p_session)
  on conflict (member_id) do update set
    session_id = excluded.session_id,
    claimed_at = case
      when public.player_device_sessions.session_id <> excluded.session_id then now()
      else public.player_device_sessions.claimed_at end,
    updated_at = now(),
    claim_count = public.player_device_sessions.claim_count +
      case when public.player_device_sessions.session_id <> excluded.session_id then 1 else 0 end
  returning * into result;
  return result;
end;
$$;

create or replace function public.require_player_session(p_room uuid, p_session uuid)
returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.gw_require_user();
begin
  if exists (select 1 from public.rooms r where r.id = p_room and r.host_id = uid) then
    return;
  end if;
  if not exists (
    select 1 from public.player_device_sessions d
    join public.room_members m on m.id = d.member_id
    where m.room_id = p_room and m.user_id = uid and m.status = 'active'
      and d.session_id = p_session
  ) then
    perform public.gw_error('DEVICE_REPLACED', 'Một thiết bị khác đang điều khiển ghế này.');
  end if;
end;
$$;

revoke all on function public.claim_player_session(uuid, uuid),
  public.require_player_session(uuid, uuid) from public;
grant execute on function public.claim_player_session(uuid, uuid),
  public.require_player_session(uuid, uuid) to authenticated;

create or replace function public.gw_remote_metrics()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'remote_rooms_24h', (select count(*) from public.rooms
      where options ->> 'mode' = 'remote' and created_at > now() - interval '24 hours'),
    'active_remote_games', (select count(*) from public.games g join public.rooms r on r.id = g.room_id
      where r.options ->> 'mode' = 'remote' and g.status = 'playing'),
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

-- Extend the existing cleanup with ended-game private data. Closed-room chat remains 30 days
-- because deleting its room cascades all chat rows.
create or replace function public.gw_cleanup(
  p_closed_days int default 30,
  p_history_days int default 7,
  p_anon_days int default 90
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  n_rooms int;
  n_history int;
  n_commands int;
  n_prompts int;
  n_knowledge int;
  n_notices int;
  n_users int;
begin
  if least(p_closed_days, p_history_days, p_anon_days) < 1 then
    perform public.gw_error('BAD_ARGS', 'Số ngày phải ≥ 1.');
  end if;
  delete from public.rooms
  where status = 'closed' and closed_at < now() - make_interval(days => p_closed_days);
  get diagnostics n_rooms = row_count;
  delete from public.game_history h using public.games g
  where g.id = h.game_id and g.status = 'ended'
    and g.ended_at < now() - make_interval(days => p_history_days);
  get diagnostics n_history = row_count;
  delete from public.game_commands c using public.games g
  where g.id = c.game_id and g.status = 'ended'
    and g.ended_at < now() - make_interval(days => p_history_days);
  get diagnostics n_commands = row_count;
  delete from public.game_prompts p using public.games g
  where g.id = p.game_id and g.status = 'ended'
    and g.ended_at < now() - make_interval(days => p_history_days);
  get diagnostics n_prompts = row_count;
  delete from public.private_knowledge k using public.games g
  where g.id = k.game_id and g.status = 'ended'
    and g.ended_at < now() - make_interval(days => p_history_days);
  get diagnostics n_knowledge = row_count;
  delete from public.private_notices n using public.games g
  where g.id = n.game_id and g.status = 'ended'
    and g.ended_at < now() - make_interval(days => p_history_days);
  get diagnostics n_notices = row_count;
  delete from auth.users u
  where u.is_anonymous
    and coalesce(u.last_sign_in_at, u.created_at) < now() - make_interval(days => p_anon_days)
    and not exists (select 1 from public.rooms r where r.host_id = u.id and r.status <> 'closed')
    and not exists (select 1 from public.room_members m where m.user_id = u.id and m.status = 'active');
  get diagnostics n_users = row_count;
  return jsonb_build_object(
    'rooms', n_rooms, 'history', n_history, 'commands', n_commands,
    'prompts', n_prompts, 'knowledge', n_knowledge, 'notices', n_notices,
    'anon_users', n_users
  );
end;
$$;

revoke execute on function public.gw_cleanup(int, int, int) from public, anon, authenticated;
grant execute on function public.gw_cleanup(int, int, int) to service_role;
