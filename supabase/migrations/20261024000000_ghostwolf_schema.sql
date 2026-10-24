-- Ghostwolf: phòng, thành viên, ván, vai riêng, lịch sử, bộ vai đã lưu, vai tùy chỉnh.
-- Nguyên tắc: client chỉ đọc qua RLS; mọi thay đổi đi qua RPC (security definer) hoặc
-- Edge Function `game-command` (service role → commit_game). Không bảng nào cho client ghi trực tiếp,
-- trừ role_presets/custom_roles của chính chủ.

create extension if not exists pgcrypto with schema extensions;

create type public.room_status as enum ('open', 'locked', 'closed');
-- closed: phòng đã đóng — thành viên chỉ còn đọc được dòng của mình để nhận thông báo.
create type public.member_status as enum ('active', 'left', 'kicked', 'closed');
create type public.game_status as enum ('setup', 'dealt', 'sent', 'playing', 'ended');

-- ───────────────────────── Bảng ─────────────────────────

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Z0-9]{6}$'),
  name text not null check (char_length(name) between 1 and 60),
  host_id uuid not null references auth.users (id) on delete cascade,
  status public.room_status not null default 'open',
  options jsonb not null default '{}'::jsonb,
  current_game_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
-- Mã chỉ cần duy nhất trong các phòng chưa đóng; đóng phòng là vô hiệu hóa mã.
create unique index rooms_active_code on public.rooms (code) where status <> 'closed';
create index rooms_host on public.rooms (host_id);

create table public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  -- null: người không có điện thoại, quản trò thêm thủ công.
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  seat int not null,
  device boolean not null,
  status public.member_status not null default 'active',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index room_members_active_user on public.room_members (room_id, user_id)
  where status = 'active' and user_id is not null;
create unique index room_members_active_name on public.room_members (room_id, lower(btrim(name)))
  where status = 'active';
create index room_members_user on public.room_members (user_id);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  number int not null,
  status public.game_status not null default 'setup',
  revision int not null default 0,
  -- Chỉ dữ liệu công khai (engine/views.ts → publicView).
  public_state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (room_id, number)
);
alter table public.rooms
  add constraint rooms_current_game_fk foreign key (current_game_id) references public.games (id) on delete set null;

-- Toàn bộ trạng thái engine (vai, mục tiêu đêm, tài nguyên, nhật ký riêng): chỉ quản trò.
create table public.game_secrets (
  game_id uuid primary key references public.games (id) on delete cascade,
  state jsonb not null
);

-- Vai của từng người: mỗi người chỉ đọc được dòng của mình, sau khi quản trò bấm Gửi.
create table public.assignments (
  game_id uuid not null references public.games (id) on delete cascade,
  member_id uuid not null references public.room_members (id) on delete cascade,
  role_id text not null,
  role jsonb not null,
  viewed_at timestamptz,
  primary key (game_id, member_id)
);

-- Ảnh chụp trạng thái trước mỗi lệnh trong ván để hoàn tác (chỉ service role).
create table public.game_history (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  revision int not null,
  label text not null,
  state jsonb not null,
  created_at timestamptz not null default now()
);
create index game_history_game on public.game_history (game_id, id desc);

-- Chống xử lý trùng (double-click, retry).
create table public.game_commands (
  game_id uuid not null references public.games (id) on delete cascade,
  command_id uuid not null,
  revision int not null,
  created_at timestamptz not null default now(),
  primary key (game_id, command_id)
);

create table public.custom_roles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  team text not null check (team in ('village', 'wolf', 'solo')),
  short text not null default '' check (char_length(short) <= 500),
  wakes boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_presets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  counts jsonb not null check (jsonb_typeof(counts) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

-- ───────────────────────── Hàm tiện ích ─────────────────────────

create or replace function public.is_room_host(p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rooms r where r.id = p_room and r.host_id = auth.uid());
$$;

create or replace function public.is_active_member(p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = p_room and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

create or replace function public.is_game_host(p_game uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.games g join public.rooms r on r.id = g.room_id
    where g.id = p_game and r.host_id = auth.uid()
  );
$$;

create or replace function public.gw_error(p_code text, p_message text) returns void
language plpgsql as $$
begin
  raise exception '%', p_message using errcode = 'P0001', detail = p_code;
end;
$$;

create or replace function public.gw_require_user() returns uuid
language plpgsql stable as $$
declare uid uuid := auth.uid();
begin
  if uid is null then perform public.gw_error('AUTH_REQUIRED', 'Cần đăng nhập ẩn danh trước.'); end if;
  return uid;
end;
$$;

create or replace function public.gw_room_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 ký tự, bỏ I L O 0 1
  code text := '';
  b int;
begin
  while char_length(code) < 6 loop
    b := get_byte(extensions.gen_random_bytes(1), 0);
    if b < 248 then -- 248 = 31 * 8: tránh lệch phân bố
      code := code || substr(alphabet, (b % 31) + 1, 1);
    end if;
  end loop;
  return code;
end;
$$;

create or replace function public.gw_clean_name(p_name text, p_max int) returns text
language plpgsql immutable as $$
declare n text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if n = '' then perform public.gw_error('NAME_REQUIRED', 'Cần nhập tên.'); end if;
  if char_length(n) > p_max then perform public.gw_error('NAME_TOO_LONG', format('Tên tối đa %s ký tự.', p_max)); end if;
  return n;
end;
$$;

create or replace function public.gw_options(p jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'chief', coalesce((p ->> 'chief')::boolean, true),
    'revealOnDeath', coalesce((p ->> 'revealOnDeath')::boolean, false),
    'hunterShootsWhenPoisoned', coalesce((p ->> 'hunterShootsWhenPoisoned')::boolean, false),
    'witchSelfHeal', coalesce((p ->> 'witchSelfHeal')::boolean, true),
    'callDeadRoles', coalesce((p ->> 'callDeadRoles')::boolean, true)
  );
$$;

-- ───────────────────────── RPC phòng ─────────────────────────

create or replace function public.create_room(p_name text, p_options jsonb default '{}'::jsonb)
returns public.rooms
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.gw_require_user();
  r public.rooms;
  attempt int := 0;
begin
  loop
    attempt := attempt + 1;
    begin
      insert into public.rooms (code, name, host_id, options)
      values (public.gw_room_code(), public.gw_clean_name(p_name, 60), uid, public.gw_options(p_options))
      returning * into r;
      return r;
    exception when unique_violation then
      if attempt >= 20 then perform public.gw_error('CODE_EXHAUSTED', 'Không tạo được mã phòng, thử lại.'); end if;
    end;
  end loop;
end;
$$;

create or replace function public.find_room(p_code text)
returns table (id uuid, name text, status public.room_status, is_host boolean, member_id uuid)
language sql stable security definer set search_path = '' as $$
  select r.id, r.name, r.status, r.host_id = auth.uid(),
    (select m.id from public.room_members m where m.room_id = r.id and m.user_id = auth.uid() and m.status = 'active')
  from public.rooms r
  where r.code = upper(btrim(p_code)) and r.status <> 'closed';
$$;

create or replace function public.join_room(p_code text, p_name text)
returns public.room_members
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.gw_require_user();
  r public.rooms;
  m public.room_members;
  n text;
begin
  select * into r from public.rooms where code = upper(btrim(p_code)) and status <> 'closed' for update;
  if not found then perform public.gw_error('ROOM_NOT_FOUND', 'Không tìm thấy phòng, hoặc phòng đã đóng.'); end if;
  if r.host_id = uid then perform public.gw_error('IS_HOST', 'Bạn là quản trò của phòng này.'); end if;

  -- Vào lại (refresh, mất mạng): giữ nguyên danh tính và ghế.
  select * into m from public.room_members where room_id = r.id and user_id = uid and status = 'active';
  if found then return m; end if;

  if r.status = 'locked' then perform public.gw_error('ROOM_LOCKED', 'Phòng đã chốt, không vào thêm được.'); end if;
  n := public.gw_clean_name(p_name, 40);
  if exists (select 1 from public.room_members where room_id = r.id and status = 'active' and lower(name) = lower(n)) then
    perform public.gw_error('NAME_TAKEN', 'Tên này đã có trong phòng. Chọn tên khác.');
  end if;

  insert into public.room_members (room_id, user_id, name, seat, device)
  values (r.id, uid, n,
    coalesce((select max(seat) from public.room_members where room_id = r.id and status = 'active'), 0) + 1, true)
  returning * into m;
  return m;
end;
$$;

create or replace function public.leave_room(p_room uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := public.gw_require_user();
begin
  update public.room_members set status = 'left', updated_at = now()
  where room_id = p_room and user_id = uid and status = 'active';
end;
$$;

create or replace function public.gw_host_room(p_room uuid, p_lock boolean default true) returns public.rooms
language plpgsql volatile set search_path = '' as $$
declare r public.rooms;
begin
  perform public.gw_require_user();
  if p_lock then
    select * into r from public.rooms where id = p_room for update;
  else
    select * into r from public.rooms where id = p_room;
  end if;
  if not found or r.host_id <> auth.uid() then perform public.gw_error('NOT_HOST', 'Chỉ quản trò của phòng mới làm được việc này.'); end if;
  if r.status = 'closed' then perform public.gw_error('ROOM_CLOSED', 'Phòng đã đóng.'); end if;
  return r;
end;
$$;

create or replace function public.host_add_member(p_room uuid, p_name text) returns public.room_members
language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.rooms := public.gw_host_room(p_room);
  m public.room_members;
  n text := public.gw_clean_name(p_name, 40);
begin
  if r.status <> 'open' then perform public.gw_error('ROOM_LOCKED', 'Mở lại phòng để thêm người.'); end if;
  if exists (select 1 from public.room_members where room_id = r.id and status = 'active' and lower(name) = lower(n)) then
    perform public.gw_error('NAME_TAKEN', 'Tên này đã có trong phòng. Chọn tên khác.');
  end if;
  insert into public.room_members (room_id, user_id, name, seat, device)
  values (r.id, null, n,
    coalesce((select max(seat) from public.room_members where room_id = r.id and status = 'active'), 0) + 1, false)
  returning * into m;
  return m;
end;
$$;

create or replace function public.host_kick(p_member uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  m public.room_members;
  r public.rooms;
begin
  select * into m from public.room_members where id = p_member;
  if not found then perform public.gw_error('NO_MEMBER', 'Không tìm thấy người chơi.'); end if;
  r := public.gw_host_room(m.room_id);
  if r.status <> 'open' then perform public.gw_error('ROOM_LOCKED', 'Mở lại phòng để mời người rời đi.'); end if;
  update public.room_members set status = 'kicked', updated_at = now() where id = p_member and status = 'active';
end;
$$;

create or replace function public.host_lock(p_room uuid) returns public.rooms
language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.rooms := public.gw_host_room(p_room);
  n int;
begin
  if r.status <> 'open' then perform public.gw_error('ROOM_LOCKED', 'Phòng đã chốt.'); end if;
  select count(*) into n from public.room_members where room_id = r.id and status = 'active';
  if n < 4 then perform public.gw_error('TOO_FEW', format('Cần ít nhất 4 người · còn thiếu %s.', 4 - n)); end if;
  -- Đánh lại số ghế liên tục theo thứ tự vào phòng.
  update public.room_members m set seat = x.rn
  from (select id, row_number() over (order by seat, joined_at) as rn
        from public.room_members where room_id = r.id and status = 'active') x
  where m.id = x.id;
  update public.rooms set status = 'locked', updated_at = now() where id = r.id returning * into r;
  return r;
end;
$$;

create or replace function public.host_unlock(p_room uuid) returns public.rooms
language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.rooms := public.gw_host_room(p_room);
  g public.games;
begin
  if r.status <> 'locked' then perform public.gw_error('NOT_LOCKED', 'Phòng đang mở.'); end if;
  select * into g from public.games where id = r.current_game_id for update;
  if found and g.status not in ('setup', 'dealt', 'ended') then
    perform public.gw_error('ROLES_SENT', 'Vai đã gửi cho người chơi, không mở lại phòng được.');
  end if;
  if found and g.status = 'dealt' then
    -- Danh sách sẽ thay đổi: hủy bản chia chưa gửi.
    delete from public.assignments where game_id = g.id;
    update public.game_secrets
      set state = jsonb_set(jsonb_set(state, '{status}', '"setup"'), '{players}', '[]'::jsonb)
      where game_id = g.id;
    update public.games set status = 'setup', revision = revision + 1, updated_at = now(),
      public_state = jsonb_set(jsonb_set(public_state, '{status}', '"setup"'), '{players}', '[]'::jsonb)
      where id = g.id;
  end if;
  update public.rooms set status = 'open', updated_at = now() where id = r.id returning * into r;
  return r;
end;
$$;

create or replace function public.host_close(p_room uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r public.rooms := public.gw_host_room(p_room);
begin
  update public.rooms set status = 'closed', closed_at = now(), updated_at = now() where id = r.id;
  -- Thông báo tới máy đang kết nối và cắt quyền đọc dữ liệu phòng của họ.
  update public.room_members set status = 'closed', updated_at = now() where room_id = r.id and status = 'active';
end;
$$;

-- Người chơi xác nhận đã xem vai (idempotent).
create or replace function public.ack_role(p_game uuid) returns timestamptz
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.gw_require_user();
  t timestamptz;
begin
  update public.assignments a set viewed_at = coalesce(a.viewed_at, now())
  from public.room_members m, public.games g
  where a.game_id = p_game and m.id = a.member_id and m.user_id = uid and m.status = 'active'
    and g.id = a.game_id and g.status in ('sent', 'playing', 'ended')
  returning a.viewed_at into t;
  if t is null then perform public.gw_error('NO_ASSIGNMENT', 'Chưa có vai để xác nhận.'); end if;
  return t;
end;
$$;

-- Quản trò xác nhận thay người không có điện thoại (đã xem trên máy quản trò).
create or replace function public.host_ack_role(p_game uuid, p_member uuid) returns timestamptz
language plpgsql volatile security definer set search_path = '' as $$
declare t timestamptz;
begin
  if not public.is_game_host(p_game) then perform public.gw_error('NOT_HOST', 'Chỉ quản trò mới làm được việc này.'); end if;
  update public.assignments a set viewed_at = coalesce(a.viewed_at, now())
  from public.room_members m, public.games g
  where a.game_id = p_game and a.member_id = p_member and m.id = a.member_id and m.device = false
    and g.id = a.game_id and g.status in ('sent', 'playing', 'ended')
  returning a.viewed_at into t;
  if t is null then perform public.gw_error('NO_ASSIGNMENT', 'Không xác nhận được cho người này.'); end if;
  return t;
end;
$$;

-- ───────────────────────── Ghi ván (chỉ service role) ─────────────────────────

create or replace function public.create_game(p_room uuid, p_state jsonb, p_public jsonb) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  gid uuid;
  num int;
begin
  -- Khóa phòng và trả lại ván đang dùng nếu có (chống double-click tạo hai ván).
  select r.current_game_id into gid from public.rooms r
    left join public.games g on g.id = r.current_game_id
    where r.id = p_room and (g.id is null or g.status <> 'ended') for update of r;
  if gid is not null then return gid; end if;
  perform 1 from public.rooms where id = p_room for update;
  select coalesce(max(number), 0) + 1 into num from public.games where room_id = p_room;
  insert into public.games (room_id, number, status, public_state)
  values (p_room, num, (p_state ->> 'status')::public.game_status, p_public) returning id into gid;
  insert into public.game_secrets (game_id, state) values (gid, p_state);
  update public.rooms set current_game_id = gid, updated_at = now() where id = p_room;
  return gid;
end;
$$;

-- Ghi kết quả một lệnh: một transaction, kiểm tra revision, chống trùng command_id.
create or replace function public.commit_game(
  p_game uuid,
  p_expected_revision int,
  p_command_id uuid,
  p_state jsonb,
  p_public jsonb,
  p_label text default null,
  p_history_state jsonb default null,
  p_pop_history boolean default false,
  p_assignments jsonb default null
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
    ended_at = case when new_status = 'ended' then coalesce(ended_at, now()) else null end
  where id = p_game;
  insert into public.game_commands (game_id, command_id, revision) values (p_game, p_command_id, cur + 1);
  return jsonb_build_object('revision', cur + 1, 'duplicate', false);
end;
$$;

-- Không cho xóa vai tùy chỉnh còn được dùng trong bộ vai đã lưu hoặc ván đang chuẩn bị.
create or replace function public.gw_custom_role_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare key text := 'custom:' || old.id::text;
begin
  if exists (select 1 from public.role_presets p where p.owner_id = old.owner_id and (p.counts ? key)) then
    perform public.gw_error('ROLE_IN_USE', 'Vai đang có trong một bộ vai đã lưu. Xóa khỏi bộ vai trước.');
  end if;
  if exists (
    select 1 from public.game_secrets s join public.games g on g.id = s.game_id join public.rooms r on r.id = g.room_id
    where r.host_id = old.owner_id and g.status in ('setup', 'dealt') and (s.state -> 'counts' ? key)
  ) then
    perform public.gw_error('ROLE_IN_USE', 'Vai đang có trong bộ vai của ván đang chuẩn bị.');
  end if;
  return old;
end;
$$;
create trigger custom_roles_guard before delete on public.custom_roles
  for each row execute function public.gw_custom_role_guard();

-- ───────────────────────── Quyền ─────────────────────────

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select on public.rooms, public.room_members, public.games, public.game_secrets, public.assignments to authenticated;
grant select, insert, update, delete on public.custom_roles, public.role_presets to authenticated;

grant execute on function
  public.is_room_host(uuid), public.is_active_member(uuid), public.is_game_host(uuid),
  public.create_room(text, jsonb), public.find_room(text), public.join_room(text, text),
  public.leave_room(uuid), public.host_add_member(uuid, text), public.host_kick(uuid),
  public.host_lock(uuid), public.host_unlock(uuid), public.host_close(uuid),
  public.ack_role(uuid), public.host_ack_role(uuid, uuid)
to authenticated;
grant execute on function public.create_game(uuid, jsonb, jsonb),
  public.commit_game(uuid, int, uuid, jsonb, jsonb, text, jsonb, boolean, jsonb) to service_role;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.games enable row level security;
alter table public.game_secrets enable row level security;
alter table public.assignments enable row level security;
alter table public.game_history enable row level security;
alter table public.game_commands enable row level security;
alter table public.custom_roles enable row level security;
alter table public.role_presets enable row level security;

create policy rooms_read on public.rooms for select to authenticated
  using (host_id = auth.uid() or public.is_active_member(id));

-- Người bị mời ra/đã rời vẫn đọc được dòng của chính mình để biết trạng thái.
create policy members_read on public.room_members for select to authenticated
  using (user_id = auth.uid() or public.is_room_host(room_id) or public.is_active_member(room_id));

create policy games_read on public.games for select to authenticated
  using (public.is_room_host(room_id) or public.is_active_member(room_id));

create policy secrets_read on public.game_secrets for select to authenticated
  using (public.is_game_host(game_id));

create policy assignments_read on public.assignments for select to authenticated
  using (
    public.is_game_host(game_id)
    or exists (
      select 1 from public.room_members m join public.games g on g.id = assignments.game_id
      where m.id = assignments.member_id and m.user_id = auth.uid() and m.status = 'active'
        and g.status in ('sent', 'playing', 'ended')
    )
  );

create policy custom_roles_own on public.custom_roles for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy presets_own on public.role_presets for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ───────────────────────── Realtime ─────────────────────────
-- postgres_changes áp RLS cho từng người nhận: người chơi chỉ nhận dòng vai của mình,
-- game_secrets chỉ tới máy quản trò.
alter publication supabase_realtime add table
  public.rooms, public.room_members, public.games, public.game_secrets, public.assignments;

-- Kênh presence private "room:<id>": chỉ quản trò và thành viên đang hoạt động.
create policy room_presence_read on realtime.messages for select to authenticated
  using (
    realtime.topic() like 'room:%'
    and (public.is_room_host(substr(realtime.topic(), 6)::uuid) or public.is_active_member(substr(realtime.topic(), 6)::uuid))
  );
create policy room_presence_write on realtime.messages for insert to authenticated
  with check (
    realtime.topic() like 'room:%'
    and (public.is_room_host(substr(realtime.topic(), 6)::uuid) or public.is_active_member(substr(realtime.topic(), 6)::uuid))
  );
