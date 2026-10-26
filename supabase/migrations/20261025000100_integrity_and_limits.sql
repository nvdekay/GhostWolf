-- DB-01: ràng buộc toàn vẹn. OPS-01: giới hạn nghiệp vụ và hàm dọn dữ liệu cũ.
--
-- An toàn khi deploy:
-- - CHECK thêm dạng NOT VALID rồi VALIDATE: nếu dữ liệu cũ vi phạm, cả migration rollback
--   (không áp một nửa). Dữ liệu do app tạo luôn thỏa (seat ≥ 1, number ≥ 1, revision ≥ 0).
-- - Trigger chỉ kiểm tra dòng mới/được sửa, không quét dữ liệu cũ.
-- - Giới hạn chỉ chặn thao tác mới (tạo phòng, vào phòng, lệnh ván), không đụng dữ liệu đang có.
-- - gw_cleanup không tự chạy; chỉ service role gọi được (xem README).

-- ───────────────────────── DB-01 ─────────────────────────

alter table public.room_members add constraint room_members_seat_positive check (seat >= 1) not valid;
alter table public.room_members validate constraint room_members_seat_positive;
alter table public.games add constraint games_number_positive check (number >= 1) not valid;
alter table public.games validate constraint games_number_positive;
alter table public.games add constraint games_revision_nonnegative check (revision >= 0) not valid;
alter table public.games validate constraint games_revision_nonnegative;

-- rooms.current_game_id phải là ván của chính phòng đó.
create or replace function public.gw_current_game_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.current_game_id is not null and not exists (
    select 1 from public.games g where g.id = new.current_game_id and g.room_id = new.id
  ) then
    perform public.gw_error('BAD_CURRENT_GAME', 'Ván hiện hành không thuộc phòng này.');
  end if;
  return new;
end;
$$;
create trigger rooms_current_game_guard before insert or update of current_game_id on public.rooms
  for each row execute function public.gw_current_game_guard();

-- Vai chỉ gán cho thành viên cùng phòng với ván.
create or replace function public.gw_assignment_room_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.games g join public.room_members m on m.room_id = g.room_id
    where g.id = new.game_id and m.id = new.member_id
  ) then
    perform public.gw_error('BAD_ASSIGNMENT', 'Người chơi không thuộc phòng của ván này.');
  end if;
  return new;
end;
$$;
create trigger assignments_room_guard before insert or update of game_id, member_id on public.assignments
  for each row execute function public.gw_assignment_room_guard();

-- ───────────────────────── OPS-01: giới hạn ─────────────────────────

-- Khớp MAX_PLAYERS trong engine/catalog.ts.
create or replace function public.gw_max_members() returns int language sql immutable as $$ select 30 $$;
create or replace function public.gw_max_open_rooms() returns int language sql immutable as $$ select 10 $$;

create or replace function public.gw_require_room_space(p_room uuid) returns void
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.room_members where room_id = p_room and status = 'active')
     >= public.gw_max_members() then
    perform public.gw_error('ROOM_FULL', format('Phòng đã đủ %s người.', public.gw_max_members()));
  end if;
end;
$$;

create or replace function public.create_room(p_name text, p_options jsonb default '{}'::jsonb)
returns public.rooms
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.gw_require_user();
  r public.rooms;
  attempt int := 0;
begin
  if (select count(*) from public.rooms where host_id = uid and status <> 'closed')
     >= public.gw_max_open_rooms() then
    perform public.gw_error('TOO_MANY_ROOMS',
      format('Bạn đang có %s phòng chưa đóng. Đóng bớt phòng cũ rồi tạo phòng mới.', public.gw_max_open_rooms()));
  end if;
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

  if exists (select 1 from public.room_members where room_id = r.id and user_id = uid and status = 'kicked') then
    perform public.gw_error('KICKED', 'Quản trò đã mời bạn ra khỏi phòng này.');
  end if;

  if r.status = 'locked' then perform public.gw_error('ROOM_LOCKED', 'Phòng đã chốt, không vào thêm được.'); end if;
  perform public.gw_require_room_space(r.id);
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

create or replace function public.host_add_member(p_room uuid, p_name text) returns public.room_members
language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.rooms := public.gw_host_room(p_room);
  m public.room_members;
  n text := public.gw_clean_name(p_name, 40);
begin
  if r.status <> 'open' then perform public.gw_error('ROOM_LOCKED', 'Mở lại phòng để thêm người.'); end if;
  perform public.gw_require_room_space(r.id);
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

-- Giới hạn tần suất lệnh cho một ván: 60 lệnh / 10 giây (thao tác thật chậm hơn nhiều).
create index if not exists game_commands_recent on public.game_commands (game_id, created_at desc);

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
    ended_at = case when new_status = 'ended' then coalesce(ended_at, now()) else null end
  where id = p_game;
  insert into public.game_commands (game_id, command_id, revision) values (p_game, p_command_id, cur + 1);
  return jsonb_build_object('revision', cur + 1, 'duplicate', false);
end;
$$;

-- ───────────────────────── OPS-01: dọn dữ liệu cũ ─────────────────────────
-- Chỉ xóa dữ liệu không còn hoạt động:
--  1. Phòng đã đóng quá p_closed_days ngày (kéo theo ván, vai, lịch sử của phòng đó).
--  2. Lịch sử hoàn tác và nhật ký lệnh của ván đã kết thúc quá p_history_days ngày
--     (không còn hoàn tác được sau khi kết thúc; idempotency chỉ cần trong lúc chơi).
--  3. Người dùng ẩn danh không đăng nhập lại quá p_anon_days ngày, không làm quản trò phòng chưa đóng
--     và không còn là thành viên đang hoạt động ở phòng nào.
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
  n_users int;
begin
  if least(p_closed_days, p_history_days, p_anon_days) < 1 then
    perform public.gw_error('BAD_ARGS', 'Số ngày phải ≥ 1.');
  end if;

  delete from public.rooms
  where status = 'closed' and closed_at < now() - make_interval(days => p_closed_days);
  get diagnostics n_rooms = row_count;

  delete from public.game_history h using public.games g
  where g.id = h.game_id and g.status = 'ended' and g.ended_at < now() - make_interval(days => p_history_days);
  get diagnostics n_history = row_count;

  delete from public.game_commands c using public.games g
  where g.id = c.game_id and g.status = 'ended' and g.ended_at < now() - make_interval(days => p_history_days);
  get diagnostics n_commands = row_count;

  delete from auth.users u
  where u.is_anonymous
    and coalesce(u.last_sign_in_at, u.created_at) < now() - make_interval(days => p_anon_days)
    and not exists (select 1 from public.rooms r where r.host_id = u.id and r.status <> 'closed')
    and not exists (select 1 from public.room_members m where m.user_id = u.id and m.status = 'active');
  get diagnostics n_users = row_count;

  return jsonb_build_object('rooms', n_rooms, 'history', n_history, 'commands', n_commands, 'anon_users', n_users);
end;
$$;

revoke execute on function public.gw_cleanup(int, int, int) from public, anon, authenticated;
grant execute on function public.gw_cleanup(int, int, int) to service_role;
revoke execute on function public.gw_require_room_space(uuid), public.gw_max_members(), public.gw_max_open_rooms(),
  public.gw_current_game_guard(), public.gw_assignment_room_guard() from public, anon, authenticated;
