-- RT-03: replace client-selected Realtime Presence keys with a server-derived heartbeat.

create table public.room_presence (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  member_id uuid references public.room_members (id) on delete cascade,
  is_host boolean not null,
  last_seen timestamptz not null default now(),
  primary key (room_id, user_id),
  check ((is_host and member_id is null) or (not is_host and member_id is not null))
);
create index room_presence_recent on public.room_presence (room_id, last_seen desc);

revoke all on public.room_presence from public, anon, authenticated;
grant select on public.room_presence to authenticated;
alter table public.room_presence enable row level security;

create policy room_presence_participant_read on public.room_presence
for select to authenticated
using (public.is_room_host(room_id) or public.is_active_member(room_id));

create or replace function public.heartbeat_room(p_room uuid)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.gw_require_user();
  resolved_member uuid;
  resolved_host boolean := false;
begin
  if exists (
    select 1 from public.rooms
    where id = p_room and host_id = uid and status <> 'closed'
  ) then
    resolved_host := true;
  else
    select id into resolved_member
    from public.room_members
    where room_id = p_room and user_id = uid and status = 'active';
    if not found then
      perform public.gw_error('NOT_IN_ROOM', 'Phiên này không còn ở trong phòng.');
    end if;
  end if;

  insert into public.room_presence (room_id, user_id, member_id, is_host, last_seen)
  values (p_room, uid, resolved_member, resolved_host, now())
  on conflict (room_id, user_id) do update
    set member_id = excluded.member_id,
        is_host = excluded.is_host,
        last_seen = excluded.last_seen;

  delete from public.room_presence
  where room_id = p_room and last_seen < now() - interval '1 day';

  return case when resolved_host then 'host' else resolved_member::text end;
end;
$$;

revoke execute on function public.heartbeat_room(uuid) from public, anon, authenticated;
grant execute on function public.heartbeat_room(uuid) to authenticated;

alter publication supabase_realtime add table public.room_presence;

-- The app no longer uses private Presence channels, so remove the spoofable client-key surface.
drop policy if exists room_presence_read on realtime.messages;
drop policy if exists room_presence_write on realtime.messages;
