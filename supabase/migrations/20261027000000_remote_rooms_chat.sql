-- Remote phase 1: room settings, ready check, public/lobby chat and basic moderation.

alter table public.room_members
  add column ready boolean not null default false,
  add column ready_at timestamptz,
  add column muted_until timestamptz,
  add column afk_count int not null default 0 check (afk_count >= 0);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  game_id uuid references public.games (id) on delete cascade,
  channel text not null check (channel in ('lobby', 'public', 'wolves', 'system', 'moderator')),
  sender_member_id uuid references public.room_members (id) on delete set null,
  client_message_id uuid not null,
  reply_to_id uuid references public.chat_messages (id) on delete set null,
  body text not null check (char_length(body) <= 500),
  day int,
  phase_sequence int,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  unique (room_id, client_message_id)
);
create index chat_messages_page on public.chat_messages (room_id, channel, created_at desc, id desc);

create table public.moderation_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  game_id uuid references public.games (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  target_member_id uuid references public.room_members (id) on delete set null,
  kind text not null check (kind in (
    'mute', 'unmute', 'delete_message', 'kick', 'act_for_player', 'extend_deadline', 'timeout'
  )),
  reason text not null default '' check (char_length(reason) <= 300),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index moderation_events_room on public.moderation_events (room_id, created_at desc);

create or replace function public.gw_options(p jsonb) returns jsonb
language plpgsql immutable as $$
declare
  discussion int := case when coalesce(p ->> 'discussionSeconds', '') ~ '^\d+$'
    then (p ->> 'discussionSeconds')::int else 300 end;
  night_action int := case when coalesce(p ->> 'nightActionSeconds', '') ~ '^\d+$'
    then (p ->> 'nightActionSeconds')::int else 45 end;
  vote_time int := case when coalesce(p ->> 'voteSeconds', '') ~ '^\d+$'
    then (p ->> 'voteSeconds')::int else 60 end;
begin
  return jsonb_build_object(
    'chief', coalesce((p ->> 'chief')::boolean, true),
    'revealOnDeath', coalesce((p ->> 'revealOnDeath')::boolean, false),
    'hunterShootsWhenPoisoned', coalesce((p ->> 'hunterShootsWhenPoisoned')::boolean, false),
    'witchSelfHeal', coalesce((p ->> 'witchSelfHeal')::boolean, true),
    'callDeadRoles', coalesce((p ->> 'callDeadRoles')::boolean, true),
    'mode', case when p ->> 'mode' = 'remote' then 'remote' else 'local' end,
    'discussionSeconds', greatest(60, least(900, discussion)),
    'nightActionSeconds', greatest(15, least(180, night_action)),
    'voteSeconds', greatest(15, least(180, vote_time)),
    'allowVoteChange', coalesce((p ->> 'allowVoteChange')::boolean, true),
    'revealIndividualVotes', coalesce((p ->> 'revealIndividualVotes')::boolean, false),
    'autoAdvance', coalesce((p ->> 'autoAdvance')::boolean, false),
    'revealWolfChatAfterGame', coalesce((p ->> 'revealWolfChatAfterGame')::boolean, true)
  );
end;
$$;

create or replace function public.player_set_ready(p_room uuid, p_ready boolean)
returns public.room_members
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.gw_require_user();
  r public.rooms;
  m public.room_members;
begin
  select * into r from public.rooms where id = p_room;
  if not found or r.status = 'closed' then
    perform public.gw_error('ROOM_CLOSED', 'Phòng không còn hoạt động.');
  end if;
  if r.options ->> 'mode' <> 'remote' then
    perform public.gw_error('LOCAL_ROOM', 'Phòng cùng chỗ không dùng trạng thái sẵn sàng.');
  end if;
  if r.status <> 'open' then perform public.gw_error('ROOM_LOCKED', 'Phòng đã chốt.'); end if;
  update public.room_members set ready = p_ready,
    ready_at = case when p_ready then now() else null end, updated_at = now()
  where room_id = p_room and user_id = uid and status = 'active'
  returning * into m;
  if not found then perform public.gw_error('NOT_MEMBER', 'Bạn không còn trong phòng.'); end if;
  return m;
end;
$$;

create or replace function public.send_chat_message(
  p_room uuid,
  p_game uuid,
  p_channel text,
  p_client_message_id uuid,
  p_body text,
  p_reply_to uuid default null
) returns public.chat_messages
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.gw_require_user();
  r public.rooms;
  m public.room_members;
  g public.games;
  msg public.chat_messages;
  clean_body text := btrim(coalesce(p_body, ''));
  host_user boolean;
  phase text;
  day_step text;
begin
  select * into r from public.rooms where id = p_room;
  if not found or r.status = 'closed' then perform public.gw_error('ROOM_CLOSED', 'Phòng đã đóng.'); end if;
  host_user := r.host_id = uid;
  select * into m from public.room_members
    where room_id = p_room and user_id = uid and status = 'active';
  if not host_user and not found then perform public.gw_error('NOT_MEMBER', 'Bạn không còn trong phòng.'); end if;
  if r.options ->> 'mode' <> 'remote' then
    perform public.gw_error('LOCAL_ROOM', 'Chat trong ứng dụng chỉ dùng cho phòng từ xa.');
  end if;
  if p_channel not in ('lobby', 'public', 'wolves') then perform public.gw_error('BAD_CHANNEL', 'Kênh chat không hợp lệ.'); end if;
  if clean_body = '' then perform public.gw_error('EMPTY_MESSAGE', 'Tin nhắn đang trống.'); end if;
  if char_length(clean_body) > 500 then perform public.gw_error('MESSAGE_TOO_LONG', 'Tin nhắn tối đa 500 ký tự.'); end if;
  if not host_user and m.muted_until is not null and m.muted_until > now() then
    perform public.gw_error('MUTED', 'Bạn đang bị tắt quyền chat tạm thời.');
  end if;

  if p_game is not null then
    select * into g from public.games where id = p_game and room_id = p_room;
    if not found then perform public.gw_error('NO_GAME', 'Không tìm thấy ván trong phòng.'); end if;
    phase := g.public_state ->> 'phase';
    day_step := g.public_state ->> 'dayStep';
  end if;
  if p_channel = 'lobby' and p_game is not null and g.status in ('playing', 'ended') then
    perform public.gw_error('CHAT_CLOSED', 'Chat phòng chờ đã khóa.');
  elsif p_channel = 'public' then
    if p_game is null then perform public.gw_error('NO_GAME', 'Chat chung cần một ván.'); end if;
    if g.status <> 'ended' and not (g.status = 'playing' and phase = 'day' and day_step = 'discuss') then
      perform public.gw_error('CHAT_CLOSED', 'Chat chung đang khóa ở phase này.');
    end if;
    if not host_user and g.status <> 'ended' and not coalesce(
      (select (x ->> 'alive')::boolean from jsonb_array_elements(g.public_state -> 'players') x
       where x ->> 'id' = m.id::text), false
    ) then perform public.gw_error('DEAD_PLAYER', 'Người đã bị loại chỉ được đọc chat.'); end if;
  elsif p_channel = 'wolves' then
    perform public.gw_error('CHAT_CLOSED', 'Chat Sói chưa mở ở phase này.');
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.chat_messages c where c.id = p_reply_to and c.room_id = p_room and c.channel = p_channel
  ) then perform public.gw_error('BAD_REPLY', 'Tin được trả lời không thuộc kênh này.'); end if;

  if not host_user and (
    (select count(*) from public.chat_messages c where c.room_id = p_room and c.sender_member_id = m.id
      and c.created_at > now() - interval '10 seconds') >= 5
    or (select count(*) from public.chat_messages c where c.room_id = p_room and c.sender_member_id = m.id
      and c.created_at > now() - interval '1 minute') >= 30
  ) then perform public.gw_error('RATE_LIMITED', 'Bạn gửi quá nhanh. Chờ một chút rồi thử lại.'); end if;

  insert into public.chat_messages (
    room_id, game_id, channel, sender_member_id, client_message_id, reply_to_id, body, day
  ) values (
    p_room, p_game, p_channel, case when host_user then null else m.id end,
    p_client_message_id, p_reply_to, clean_body,
    case when p_game is null then null else (g.public_state ->> 'day')::int end
  ) on conflict (room_id, client_message_id) do update set client_message_id = excluded.client_message_id
  returning * into msg;
  return msg;
end;
$$;

create or replace function public.host_delete_chat(p_message uuid, p_reason text default '') returns void
language plpgsql volatile security definer set search_path = '' as $$
declare c public.chat_messages;
begin
  select * into c from public.chat_messages where id = p_message for update;
  if not found then perform public.gw_error('NO_MESSAGE', 'Không tìm thấy tin nhắn.'); end if;
  if not public.is_room_host(c.room_id) then perform public.gw_error('NOT_HOST', 'Chỉ quản trò được xóa tin.'); end if;
  update public.chat_messages set body = '', deleted_at = coalesce(deleted_at, now()), deleted_by = auth.uid() where id = c.id;
  insert into public.moderation_events (room_id, game_id, actor_user_id, target_member_id, kind, reason)
  values (c.room_id, c.game_id, auth.uid(), c.sender_member_id, 'delete_message', left(coalesce(p_reason, ''), 300));
end;
$$;

create or replace function public.host_mute_member(p_member uuid, p_until timestamptz, p_reason text default '') returns void
language plpgsql volatile security definer set search_path = '' as $$
declare m public.room_members;
begin
  select * into m from public.room_members where id = p_member;
  if not found then perform public.gw_error('NO_MEMBER', 'Không tìm thấy người chơi.'); end if;
  if not public.is_room_host(m.room_id) then perform public.gw_error('NOT_HOST', 'Chỉ quản trò được tắt chat.'); end if;
  update public.room_members set muted_until = p_until, updated_at = now() where id = p_member;
  insert into public.moderation_events (room_id, actor_user_id, target_member_id, kind, reason)
  values (m.room_id, auth.uid(), m.id, case when p_until is null then 'unmute' else 'mute' end,
    left(coalesce(p_reason, ''), 300));
end;
$$;

revoke all on public.chat_messages, public.moderation_events from anon, authenticated;
grant select on public.chat_messages, public.moderation_events to authenticated;
grant execute on function public.player_set_ready(uuid, boolean),
  public.send_chat_message(uuid, uuid, text, uuid, text, uuid),
  public.host_delete_chat(uuid, text), public.host_mute_member(uuid, timestamptz, text) to authenticated;

alter table public.chat_messages enable row level security;
alter table public.moderation_events enable row level security;
create policy chat_read on public.chat_messages for select to authenticated
  using (public.is_room_host(room_id) or public.is_active_member(room_id));
create policy moderation_host_read on public.moderation_events for select to authenticated
  using (public.is_room_host(room_id));
alter publication supabase_realtime add table public.chat_messages;
