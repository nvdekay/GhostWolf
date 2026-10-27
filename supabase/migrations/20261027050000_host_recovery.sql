-- FE-02: one-time recovery key lets a host move an active room to a fresh anonymous session.
-- Only a SHA-256 digest is stored; each successful recovery rotates the key atomically.

create table public.room_host_recovery (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  secret_hash bytea not null,
  rotated_at timestamptz not null default now()
);

revoke all on public.room_host_recovery from public, anon, authenticated;
alter table public.room_host_recovery enable row level security;

create or replace function public.gw_recovery_key()
returns text
language sql volatile set search_path = '' as $$
  select upper(
    substr(raw, 1, 6) || '-' || substr(raw, 7, 6) || '-' ||
    substr(raw, 13, 6) || '-' || substr(raw, 19, 6)
  )
  from (select encode(extensions.gen_random_bytes(12), 'hex') as raw) generated;
$$;

create or replace function public.gw_recovery_key_clean(p_key text)
returns text
language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p_key, ''), '[^A-Fa-f0-9]', '', 'g'));
$$;

create or replace function public.gw_set_recovery_key(p_room uuid, p_key text)
returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.room_host_recovery (room_id, secret_hash, rotated_at)
  values (
    p_room,
    extensions.digest(public.gw_recovery_key_clean(p_key), 'sha256'),
    now()
  )
  on conflict (room_id) do update
    set secret_hash = excluded.secret_hash, rotated_at = excluded.rotated_at;
$$;

create or replace function public.create_room_with_recovery(
  p_name text,
  p_options jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.rooms;
  recovery_key text := public.gw_recovery_key();
begin
  r := public.create_room(p_name, p_options);
  perform public.gw_set_recovery_key(r.id, recovery_key);
  return jsonb_build_object('room', to_jsonb(r), 'recovery_key', recovery_key);
end;
$$;

create or replace function public.rotate_host_recovery(p_room uuid)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  recovery_key text := public.gw_recovery_key();
begin
  if not exists (
    select 1 from public.rooms
    where id = p_room and host_id = public.gw_require_user() and status <> 'closed'
    for update
  ) then
    perform public.gw_error('NOT_HOST', 'Chỉ quản trò của phòng đang mở mới tạo được mã khôi phục.');
  end if;
  perform public.gw_set_recovery_key(p_room, recovery_key);
  return recovery_key;
end;
$$;

create or replace function public.recover_room_host(p_code text, p_recovery_key text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.gw_require_user();
  clean_key text := public.gw_recovery_key_clean(p_recovery_key);
  r public.rooms;
  stored_hash bytea;
  next_key text;
begin
  if char_length(clean_key) <> 24 then
    perform public.gw_error('RECOVERY_INVALID', 'Mã phòng hoặc mã khôi phục không đúng.');
  end if;

  select * into r
  from public.rooms
  where code = upper(btrim(p_code)) and status <> 'closed'
  for update;

  if not found then
    perform public.gw_error('RECOVERY_INVALID', 'Mã phòng hoặc mã khôi phục không đúng.');
  end if;

  select secret_hash into stored_hash
  from public.room_host_recovery
  where room_id = r.id;

  if stored_hash is null
     or stored_hash <> extensions.digest(clean_key, 'sha256') then
    perform public.gw_error('RECOVERY_INVALID', 'Mã phòng hoặc mã khôi phục không đúng.');
  end if;

  if r.host_id = uid then
    perform public.gw_error('ALREADY_HOST', 'Thiết bị này đã là quản trò của phòng.');
  end if;
  if exists (
    select 1 from public.room_members
    where room_id = r.id and user_id = uid and status = 'active'
  ) then
    perform public.gw_error('RECOVERY_MEMBER', 'Thiết bị người chơi không thể đồng thời làm quản trò.');
  end if;
  if (select count(*) from public.rooms where host_id = uid and status <> 'closed')
     >= public.gw_max_open_rooms() then
    perform public.gw_error(
      'TOO_MANY_ROOMS',
      format('Bạn đang có %s phòng chưa đóng. Đóng bớt phòng cũ rồi thử lại.', public.gw_max_open_rooms())
    );
  end if;

  next_key := public.gw_recovery_key();
  update public.rooms
  set host_id = uid, updated_at = now()
  where id = r.id;
  perform public.gw_set_recovery_key(r.id, next_key);

  return jsonb_build_object('room_id', r.id, 'recovery_key', next_key);
end;
$$;

revoke execute on function public.gw_recovery_key(), public.gw_recovery_key_clean(text),
  public.gw_set_recovery_key(uuid, text), public.create_room_with_recovery(text, jsonb),
  public.rotate_host_recovery(uuid), public.recover_room_host(text, text)
from public, anon, authenticated;

grant execute on function public.create_room_with_recovery(text, jsonb),
  public.rotate_host_recovery(uuid), public.recover_room_host(text, text)
to authenticated;
