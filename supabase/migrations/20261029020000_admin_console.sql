-- Admin console (admin-hub): số liệu và thao tác cấp nền tảng.
-- Mọi hàm admin_* chỉ service role gọi được; console giữ service-role key phía server và
-- không bao giờ đọc bí mật ván (game_secrets, assignments, kênh sói, lựa chọn ban đêm).

-- ───────────────────────── Nhật ký thao tác của console ─────────────────────────
-- Không khóa ngoại tới phòng/thành viên: nhật ký phải còn sau khi gw_cleanup xóa phòng cũ.
-- moderation_events không dùng được vì actor_user_id bắt buộc là một user Supabase.
create table public.admin_actions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  action text not null check (action in (
    'close_room', 'kick_member', 'mute_member', 'unmute_member', 'delete_message', 'run_cleanup'
  )),
  room_id uuid,
  member_id uuid,
  message_id uuid,
  reason text not null default '' check (char_length(reason) <= 300),
  metadata jsonb not null default '{}'::jsonb
);
create index admin_actions_created on public.admin_actions (created_at desc, id desc);
create index admin_actions_room on public.admin_actions (room_id, created_at desc);
alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from anon, authenticated;

-- ───────────────────────── Thống kê theo ngày (giờ Việt Nam) ─────────────────────────
-- Cộng dồn bằng trigger vì gw_cleanup xóa phòng đã đóng (kèm thành viên, ván) sau 30 ngày.
create table public.admin_daily_stats (
  day date primary key,
  rooms_created int not null default 0,
  remote_rooms_created int not null default 0,
  members_joined int not null default 0,
  games_started int not null default 0,
  games_ended int not null default 0
);
-- Mỗi ván chỉ được đếm bắt đầu/kết thúc một lần dù hoàn tác qua lại giữa các trạng thái.
create table public.admin_game_marks (
  game_id uuid primary key references public.games (id) on delete cascade,
  started boolean not null default false,
  ended boolean not null default false
);
alter table public.admin_daily_stats enable row level security;
alter table public.admin_game_marks enable row level security;
revoke all on public.admin_daily_stats, public.admin_game_marks from anon, authenticated;

create or replace function public.gw_vn_day(p_ts timestamptz) returns date
language sql immutable as $$
  select (p_ts at time zone 'Asia/Ho_Chi_Minh')::date;
$$;

create or replace function public.gw_admin_bump(
  p_day date, p_rooms int, p_remote int, p_members int, p_started int, p_ended int
) returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.admin_daily_stats as s
    (day, rooms_created, remote_rooms_created, members_joined, games_started, games_ended)
  values (p_day, p_rooms, p_remote, p_members, p_started, p_ended)
  on conflict (day) do update set
    rooms_created = s.rooms_created + excluded.rooms_created,
    remote_rooms_created = s.remote_rooms_created + excluded.remote_rooms_created,
    members_joined = s.members_joined + excluded.members_joined,
    games_started = s.games_started + excluded.games_started,
    games_ended = s.games_ended + excluded.games_ended;
$$;

create or replace function public.gw_admin_count_room() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gw_admin_bump(public.gw_vn_day(new.created_at), 1,
    case when new.options ->> 'mode' = 'remote' then 1 else 0 end, 0, 0, 0);
  return null;
end;
$$;

create or replace function public.gw_admin_count_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.gw_admin_bump(public.gw_vn_day(new.joined_at), 0, 0, 1, 0, 0);
  return null;
end;
$$;

create or replace function public.gw_admin_count_game() returns trigger
language plpgsql security definer set search_path = '' as $$
declare hit int;
begin
  if new.status in ('playing', 'ended') then
    insert into public.admin_game_marks as m (game_id, started) values (new.id, true)
    on conflict (game_id) do update set started = true where not m.started
    returning 1 into hit;
    if hit is not null then perform public.gw_admin_bump(public.gw_vn_day(now()), 0, 0, 0, 1, 0); end if;
  end if;
  if new.status = 'ended' then
    hit := null;
    update public.admin_game_marks set ended = true where game_id = new.id and not ended
    returning 1 into hit;
    if hit is not null then perform public.gw_admin_bump(public.gw_vn_day(now()), 0, 0, 0, 0, 1); end if;
  end if;
  return null;
end;
$$;

create trigger admin_count_room after insert on public.rooms
  for each row execute function public.gw_admin_count_room();
create trigger admin_count_member after insert on public.room_members
  for each row execute function public.gw_admin_count_member();
create trigger admin_count_game after insert or update of status on public.games
  for each row execute function public.gw_admin_count_game();

-- Số liệu cũ: chỉ những gì còn trong DB. Thời điểm bắt đầu ván không được lưu, nên lấy ngày tạo ván.
insert into public.admin_game_marks (game_id, started, ended)
select id, true, status = 'ended' from public.games where status in ('playing', 'ended');
with d as (
  select public.gw_vn_day(created_at) as day, 1 as r,
    case when options ->> 'mode' = 'remote' then 1 else 0 end as rr, 0 as m, 0 as gs, 0 as ge
  from public.rooms
  union all
  select public.gw_vn_day(joined_at), 0, 0, 1, 0, 0 from public.room_members
  union all
  select public.gw_vn_day(created_at), 0, 0, 0, 1, 0 from public.games where status in ('playing', 'ended')
  union all
  select public.gw_vn_day(coalesce(ended_at, updated_at)), 0, 0, 0, 0, 1 from public.games where status = 'ended'
)
insert into public.admin_daily_stats
  (day, rooms_created, remote_rooms_created, members_joined, games_started, games_ended)
select day, sum(r), sum(rr), sum(m), sum(gs), sum(ge) from d group by day;

-- ───────────────────────── Hàm đọc ─────────────────────────

-- Tóm tắt công khai của một ván: không có vai của người còn sống, không có nhật ký.
create or replace function public.gw_admin_game_summary(g public.games) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', g.id,
    'number', g.number,
    'status', g.status,
    'revision', g.revision,
    'createdAt', g.created_at,
    'updatedAt', g.updated_at,
    'endedAt', g.ended_at,
    'phase', g.public_state ->> 'phase',
    'day', (g.public_state ->> 'day')::int,
    'players', coalesce(jsonb_array_length(g.public_state -> 'players'), 0),
    'alive', (select count(*) from jsonb_array_elements(coalesce(g.public_state -> 'players', '[]')) p
      where (p ->> 'alive')::boolean),
    'result', case when g.status = 'ended' and g.public_state -> 'result' is not null
      and jsonb_typeof(g.public_state -> 'result') = 'object' then jsonb_build_object(
        'team', g.public_state -> 'result' ->> 'team',
        'title', g.public_state -> 'result' ->> 'title') end
  );
$$;

create or replace function public.gw_admin_window(p_from date, p_to date) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'roomsCreated', coalesce(sum(rooms_created), 0),
    'remoteRoomsCreated', coalesce(sum(remote_rooms_created), 0),
    'membersJoined', coalesce(sum(members_joined), 0),
    'gamesStarted', coalesce(sum(games_started), 0),
    'gamesEnded', coalesce(sum(games_ended), 0))
  from public.admin_daily_stats where day between p_from and p_to;
$$;

create or replace function public.admin_overview(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  today date := public.gw_vn_day(now());
  first_day date := today - (d - 1);
begin
  return jsonb_build_object(
    'generatedAt', now(),
    'range', jsonb_build_object('days', d, 'from', first_day, 'to', today,
      'previousFrom', first_day - d, 'previousTo', first_day - 1, 'timeZone', 'Asia/Ho_Chi_Minh'),
    'now', jsonb_build_object(
      'openRooms', (select count(*) from public.rooms where status <> 'closed'),
      'remoteRooms', (select count(*) from public.rooms
        where status <> 'closed' and options ->> 'mode' = 'remote'),
      'playingGames', (select count(*) from public.games g join public.rooms r on r.id = g.room_id
        where g.status = 'playing' and r.status <> 'closed'),
      'activeMembers', (select count(*) from public.room_members m join public.rooms r on r.id = m.room_id
        where m.status = 'active' and r.status <> 'closed'),
      'mutedMembers', (select count(*) from public.room_members m join public.rooms r on r.id = m.room_id
        where m.status = 'active' and r.status <> 'closed' and m.muted_until > now()),
      -- Cùng ngưỡng 45 giây với ONLINE_TTL_MS của client (src/realtime/roomStore.ts).
      'onlinePlayers', (select count(*) from public.room_presence
        where not is_host and last_seen > now() - interval '45 seconds'),
      'onlineHosts', (select count(*) from public.room_presence
        where is_host and last_seen > now() - interval '45 seconds')),
    'totals', public.gw_admin_window(first_day, today),
    'previous', public.gw_admin_window(first_day - d, first_day - 1),
    'allTime', public.gw_admin_window('-infinity', 'infinity'),
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
        'day', s.day,
        'roomsCreated', coalesce(a.rooms_created, 0),
        'remoteRoomsCreated', coalesce(a.remote_rooms_created, 0),
        'membersJoined', coalesce(a.members_joined, 0),
        'gamesStarted', coalesce(a.games_started, 0),
        'gamesEnded', coalesce(a.games_ended, 0)) order by s.day), '[]'::jsonb)
      from (select generate_series(first_day::timestamp, today::timestamp, interval '1 day')::date as day) s
      left join public.admin_daily_stats a on a.day = s.day),
    'remote', public.gw_remote_metrics()
  );
end;
$$;

-- p_status: null = tất cả, 'active' = chưa đóng, hoặc một room_status. Phân trang theo (created_at, id).
create or replace function public.admin_list_rooms(
  p_status text default null, p_q text default null, p_limit int default 50,
  p_before timestamptz default null, p_before_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  lim int := least(greatest(coalesce(p_limit, 50), 1), 100);
  q text := nullif(btrim(coalesce(p_q, '')), '');
  rows jsonb;
begin
  if p_status is not null and p_status not in ('active', 'open', 'locked', 'closed') then
    perform public.gw_error('BAD_ARGS', 'Trạng thái phòng không hợp lệ.');
  end if;
  select coalesce(jsonb_agg(x.item order by x.created_at desc, x.id desc), '[]'::jsonb) into rows
  from (
    select r.created_at, r.id, jsonb_build_object(
      'id', r.id, 'code', r.code, 'name', r.name, 'status', r.status,
      'mode', coalesce(r.options ->> 'mode', 'local'),
      'createdAt', r.created_at, 'updatedAt', r.updated_at, 'closedAt', r.closed_at,
      'activeMembers', (select count(*) from public.room_members m where m.room_id = r.id and m.status = 'active'),
      'totalMembers', (select count(*) from public.room_members m where m.room_id = r.id),
      'games', (select count(*) from public.games g where g.room_id = r.id),
      'game', (select public.gw_admin_game_summary(g) from public.games g where g.id = r.current_game_id)
    ) as item
    from public.rooms r
    where (p_status is null
        or (p_status = 'active' and r.status <> 'closed')
        or r.status::text = p_status)
      and (q is null or starts_with(r.code, upper(q)) or position(lower(q) in lower(r.name)) > 0)
      and (p_before is null or (r.created_at, r.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by r.created_at desc, r.id desc
    limit lim + 1
  ) x;
  return jsonb_build_object(
    'items', case when jsonb_array_length(rows) > lim then rows - lim else rows end,
    'nextCursor', case when jsonb_array_length(rows) > lim then jsonb_build_object(
      'before', rows -> (lim - 1) ->> 'createdAt', 'beforeId', rows -> (lim - 1) ->> 'id') end
  );
end;
$$;

create or replace function public.admin_room_detail(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id = p_room;
  if not found then perform public.gw_error('NO_ROOM', 'Không tìm thấy phòng.'); end if;
  return jsonb_build_object(
    'room', jsonb_build_object(
      'id', r.id, 'code', r.code, 'name', r.name, 'status', r.status,
      'mode', coalesce(r.options ->> 'mode', 'local'), 'hostId', r.host_id,
      'createdAt', r.created_at, 'updatedAt', r.updated_at, 'closedAt', r.closed_at,
      'currentGameId', r.current_game_id),
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'seat', m.seat, 'device', m.device, 'status', m.status,
        'isHost', m.user_id = r.host_id, 'ready', m.ready, 'joinedAt', m.joined_at,
        'mutedUntil', m.muted_until, 'afkCount', m.afk_count,
        'deviceClaims', coalesce(s.claim_count, 0),
        'lastSeen', (select max(p.last_seen) from public.room_presence p where p.member_id = m.id)
      ) order by (m.status <> 'active'), m.seat, m.joined_at), '[]'::jsonb)
      from public.room_members m left join public.player_device_sessions s on s.member_id = m.id
      where m.room_id = r.id),
    'hostLastSeen', (select max(p.last_seen) from public.room_presence p
      where p.room_id = r.id and p.is_host),
    'games', (select coalesce(jsonb_agg(public.gw_admin_game_summary(g) order by g.number desc), '[]'::jsonb)
      from public.games g where g.room_id = r.id),
    'events', (select coalesce(jsonb_agg(e.item order by e.at desc), '[]'::jsonb) from (
      select me.created_at as at, jsonb_build_object(
        'source', 'host', 'id', me.id::text, 'kind', me.kind, 'reason', me.reason, 'createdAt', me.created_at,
        'memberId', me.target_member_id, 'memberName', tm.name) as item
      from public.moderation_events me left join public.room_members tm on tm.id = me.target_member_id
      where me.room_id = r.id
      union all
      select a.created_at, jsonb_build_object(
        'source', 'admin', 'id', a.id::text, 'kind', a.action, 'reason', a.reason, 'createdAt', a.created_at,
        'memberId', a.member_id, 'memberName', am.name)
      from public.admin_actions a left join public.room_members am on am.id = a.member_id
      where a.room_id = r.id
      order by 1 desc limit 100) e)
  );
end;
$$;

-- Chỉ các kênh mọi người trong phòng đều thấy; kênh sói và kênh quản trò không bao giờ được trả về.
create or replace function public.admin_list_chat(
  p_room uuid default null, p_q text default null, p_limit int default 50,
  p_before timestamptz default null, p_before_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  lim int := least(greatest(coalesce(p_limit, 50), 1), 100);
  q text := nullif(btrim(coalesce(p_q, '')), '');
  rows jsonb;
begin
  select coalesce(jsonb_agg(x.item order by x.created_at desc, x.id desc), '[]'::jsonb) into rows
  from (
    select c.created_at, c.id, jsonb_build_object(
      'id', c.id, 'roomId', c.room_id, 'roomCode', r.code, 'roomName', r.name,
      'gameId', c.game_id, 'channel', c.channel, 'body', c.body, 'day', c.day,
      'createdAt', c.created_at, 'deletedAt', c.deleted_at,
      'senderId', c.sender_member_id, 'senderName', m.name,
      'senderMutedUntil', m.muted_until, 'senderStatus', m.status
    ) as item
    from public.chat_messages c
    join public.rooms r on r.id = c.room_id
    left join public.room_members m on m.id = c.sender_member_id
    where c.channel in ('lobby', 'public', 'system')
      and (p_room is null or c.room_id = p_room)
      and (q is null or position(lower(q) in lower(c.body)) > 0)
      and (p_before is null or (c.created_at, c.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by c.created_at desc, c.id desc
    limit lim + 1
  ) x;
  return jsonb_build_object(
    'items', case when jsonb_array_length(rows) > lim then rows - lim else rows end,
    'nextCursor', case when jsonb_array_length(rows) > lim then jsonb_build_object(
      'before', rows -> (lim - 1) ->> 'createdAt', 'beforeId', rows -> (lim - 1) ->> 'id') end
  );
end;
$$;

-- Một dòng thời gian gồm thao tác của quản trò các phòng và của console.
create or replace function public.admin_list_audit(
  p_source text default null, p_limit int default 50, p_before timestamptz default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  lim int := least(greatest(coalesce(p_limit, 50), 1), 100);
  rows jsonb;
begin
  if p_source is not null and p_source not in ('host', 'admin') then
    perform public.gw_error('BAD_ARGS', 'Nguồn nhật ký không hợp lệ.');
  end if;
  select coalesce(jsonb_agg(e.item order by e.at desc), '[]'::jsonb) into rows from (
    select at, item from (
      select me.created_at as at, jsonb_build_object(
        'source', 'host', 'id', 'h' || me.id, 'kind', me.kind, 'reason', me.reason, 'createdAt', me.created_at,
        'roomId', me.room_id, 'roomCode', r.code, 'memberId', me.target_member_id, 'memberName', tm.name,
        'metadata', '{}'::jsonb) as item
      from public.moderation_events me
      left join public.rooms r on r.id = me.room_id
      left join public.room_members tm on tm.id = me.target_member_id
      where (p_source is null or p_source = 'host') and (p_before is null or me.created_at < p_before)
      union all
      select a.created_at, jsonb_build_object(
        'source', 'admin', 'id', 'a' || a.id, 'kind', a.action, 'reason', a.reason, 'createdAt', a.created_at,
        'roomId', a.room_id, 'roomCode', r.code, 'memberId', a.member_id, 'memberName', am.name,
        'metadata', a.metadata)
      from public.admin_actions a
      left join public.rooms r on r.id = a.room_id
      left join public.room_members am on am.id = a.member_id
      where (p_source is null or p_source = 'admin') and (p_before is null or a.created_at < p_before)
    ) u order by at desc limit lim + 1
  ) e;
  return jsonb_build_object(
    'items', case when jsonb_array_length(rows) > lim then rows - lim else rows end,
    'nextCursor', case when jsonb_array_length(rows) > lim then rows -> (lim - 1) ->> 'createdAt' end
  );
end;
$$;

create or replace function public.admin_system_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'generatedAt', now(),
    -- Lịch dọn dẹp tự động (pg_cron, 20261027040000) và lần chạy tay gần nhất từ console.
    'cron', public.gw_cron_health(),
    'lastManualCleanup', (select jsonb_build_object('at', a.created_at, 'result', a.metadata)
      from public.admin_actions a where a.action = 'run_cleanup' order by a.created_at desc limit 1),
    'presence', jsonb_build_object(
      'online', (select count(*) from public.room_presence where last_seen > now() - interval '45 seconds'),
      'rows', (select count(*) from public.room_presence)),
    'commands', jsonb_build_object(
      'lastHour', (select count(*) from public.game_commands where created_at > now() - interval '1 hour'),
      'last24h', (select count(*) from public.game_commands where created_at > now() - interval '24 hours')),
    'tables', jsonb_build_object(
      'rooms', (select count(*) from public.rooms),
      'closedRooms', (select count(*) from public.rooms where status = 'closed'),
      'members', (select count(*) from public.room_members),
      'games', (select count(*) from public.games),
      'endedGames', (select count(*) from public.games where status = 'ended'),
      'gameHistory', (select count(*) from public.game_history),
      'gameCommands', (select count(*) from public.game_commands),
      'chatMessages', (select count(*) from public.chat_messages),
      'moderationEvents', (select count(*) from public.moderation_events),
      'anonymousUsers', (select count(*) from auth.users where is_anonymous)),
    'remote', public.gw_remote_metrics()
  );
$$;

-- ───────────────────────── Hàm thao tác ─────────────────────────

-- Giống host_close: thiết bị đang mở phòng nhận thay đổi qua realtime và mất quyền đọc.
create or replace function public.admin_close_room(p_room uuid, p_reason text default '') returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id = p_room for update;
  if not found then perform public.gw_error('NO_ROOM', 'Không tìm thấy phòng.'); end if;
  if r.status = 'closed' then perform public.gw_error('ROOM_CLOSED', 'Phòng đã đóng.'); end if;
  update public.rooms set status = 'closed', closed_at = now(), updated_at = now() where id = r.id;
  update public.room_members set status = 'closed', updated_at = now() where room_id = r.id and status = 'active';
  insert into public.admin_actions (action, room_id, reason, metadata)
  values ('close_room', r.id, left(coalesce(p_reason, ''), 300),
    jsonb_build_object('code', r.code, 'name', r.name, 'previousStatus', r.status));
end;
$$;

-- Khác host_kick: được mời ra cả khi phòng đã chốt hoặc đang chơi (xử lý vi phạm).
create or replace function public.admin_kick_member(p_member uuid, p_reason text default '') returns void
language plpgsql volatile security definer set search_path = '' as $$
declare m public.room_members;
begin
  select * into m from public.room_members where id = p_member for update;
  if not found then perform public.gw_error('NO_MEMBER', 'Không tìm thấy người chơi.'); end if;
  if m.status <> 'active' then perform public.gw_error('NOT_ACTIVE', 'Người chơi không còn trong phòng.'); end if;
  if exists (select 1 from public.rooms r where r.id = m.room_id and r.host_id = m.user_id) then
    perform public.gw_error('IS_HOST', 'Không mời quản trò ra; hãy đóng phòng.');
  end if;
  update public.room_members set status = 'kicked', updated_at = now() where id = m.id;
  insert into public.admin_actions (action, room_id, member_id, reason, metadata)
  values ('kick_member', m.room_id, m.id, left(coalesce(p_reason, ''), 300), jsonb_build_object('name', m.name));
end;
$$;

-- p_until = null: bỏ tắt chat.
create or replace function public.admin_mute_member(
  p_member uuid, p_until timestamptz, p_reason text default ''
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare m public.room_members;
begin
  select * into m from public.room_members where id = p_member for update;
  if not found then perform public.gw_error('NO_MEMBER', 'Không tìm thấy người chơi.'); end if;
  if p_until is not null and p_until <= now() then
    perform public.gw_error('BAD_ARGS', 'Thời điểm hết tắt chat phải ở tương lai.');
  end if;
  update public.room_members set muted_until = p_until, updated_at = now() where id = m.id;
  insert into public.admin_actions (action, room_id, member_id, reason, metadata)
  values (case when p_until is null then 'unmute_member' else 'mute_member' end, m.room_id, m.id,
    left(coalesce(p_reason, ''), 300), jsonb_build_object('name', m.name, 'until', p_until));
end;
$$;

create or replace function public.admin_delete_chat(p_message uuid, p_reason text default '') returns void
language plpgsql volatile security definer set search_path = '' as $$
declare c public.chat_messages;
begin
  select * into c from public.chat_messages where id = p_message for update;
  if not found or c.channel not in ('lobby', 'public', 'system') then
    perform public.gw_error('NO_MESSAGE', 'Không tìm thấy tin nhắn.');
  end if;
  if c.deleted_at is not null then perform public.gw_error('ALREADY_DELETED', 'Tin nhắn đã bị xóa.'); end if;
  update public.chat_messages set body = '', deleted_at = now(), deleted_by = null where id = c.id;
  insert into public.admin_actions (action, room_id, member_id, message_id, reason, metadata)
  values ('delete_message', c.room_id, c.sender_member_id, c.id, left(coalesce(p_reason, ''), 300),
    jsonb_build_object('channel', c.channel, 'length', char_length(c.body)));
end;
$$;

create or replace function public.admin_run_cleanup(
  p_closed_days int default 30, p_history_days int default 7, p_anon_days int default 90
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare res jsonb;
begin
  res := public.gw_cleanup(p_closed_days, p_history_days, p_anon_days);
  insert into public.admin_actions (action, metadata)
  values ('run_cleanup', jsonb_build_object('closedDays', p_closed_days, 'historyDays', p_history_days,
    'anonDays', p_anon_days, 'deleted', res));
  return res;
end;
$$;

-- ───────────────────────── Quyền ─────────────────────────
revoke all on function
  public.gw_vn_day(timestamptz),
  public.gw_admin_bump(date, int, int, int, int, int),
  public.gw_admin_count_room(),
  public.gw_admin_count_member(),
  public.gw_admin_count_game(),
  public.gw_admin_game_summary(public.games),
  public.gw_admin_window(date, date),
  public.admin_overview(int),
  public.admin_list_rooms(text, text, int, timestamptz, uuid),
  public.admin_room_detail(uuid),
  public.admin_list_chat(uuid, text, int, timestamptz, uuid),
  public.admin_list_audit(text, int, timestamptz),
  public.admin_system_status(),
  public.admin_close_room(uuid, text),
  public.admin_kick_member(uuid, text),
  public.admin_mute_member(uuid, timestamptz, text),
  public.admin_delete_chat(uuid, text),
  public.admin_run_cleanup(int, int, int)
from public, anon, authenticated;
grant execute on function
  public.admin_overview(int),
  public.admin_list_rooms(text, text, int, timestamptz, uuid),
  public.admin_room_detail(uuid),
  public.admin_list_chat(uuid, text, int, timestamptz, uuid),
  public.admin_list_audit(text, int, timestamptz),
  public.admin_system_status(),
  public.admin_close_room(uuid, text),
  public.admin_kick_member(uuid, text),
  public.admin_mute_member(uuid, timestamptz, text),
  public.admin_delete_chat(uuid, text),
  public.admin_run_cleanup(int, int, int)
to service_role;
