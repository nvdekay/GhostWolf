-- RT-01: create_game cũ chỉ khóa phòng khi ván hiện tại chưa kết thúc. Sau khi ván kết thúc,
-- nhiều game.replay đồng thời cùng qua bước kiểm tra rồi mỗi request tạo một ván mới.
-- Bản mới khóa dòng phòng vô điều kiện trước, rồi mới đọc lại ván hiện tại dưới khóa.
--
-- SEC-02: join_room cũ chỉ tìm membership đang 'active', nên người bị mời ra có thể dùng
-- cùng phiên đăng nhập để vào lại khi phòng còn mở. Người tự rời ('left') vẫn được vào lại.
--
-- Cả hai đều là `create or replace` cùng chữ ký: giữ nguyên quyền execute đã cấp.

create or replace function public.create_game(p_room uuid, p_state jsonb, p_public jsonb) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.rooms;
  cur_status public.game_status;
  gid uuid;
  num int;
begin
  select * into r from public.rooms where id = p_room for update;
  if not found then perform public.gw_error('NO_ROOM', 'Không tìm thấy phòng.'); end if;

  -- Đã có ván chưa kết thúc (double-click, hoặc request đồng thời vừa tạo xong): dùng lại.
  if r.current_game_id is not null then
    select g.status into cur_status from public.games g where g.id = r.current_game_id;
    if found and cur_status <> 'ended' then return r.current_game_id; end if;
  end if;

  select coalesce(max(number), 0) + 1 into num from public.games where room_id = p_room;
  insert into public.games (room_id, number, status, public_state)
  values (p_room, num, (p_state ->> 'status')::public.game_status, p_public) returning id into gid;
  insert into public.game_secrets (game_id, state) values (gid, p_state);
  update public.rooms set current_game_id = gid, updated_at = now() where id = p_room;
  return gid;
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
