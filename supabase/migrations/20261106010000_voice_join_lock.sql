-- Serialize joins per room so the 16-participant voice cap cannot be bypassed by concurrent RPCs.
-- Locking the room row also lets us re-check channel access after any in-flight room transition.

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
  select * into r from public.rooms where id = p_room for update;
  if not found or not public.gw_voice_can_read(p_room, p_game, p_channel) then
    perform public.gw_error('VOICE_CLOSED', 'Voice đang khóa hoặc bạn không có quyền tham gia.');
  end if;

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

revoke all on function public.join_voice(uuid, uuid, text, uuid, boolean) from public, anon;
grant execute on function public.join_voice(uuid, uuid, text, uuid, boolean) to authenticated;
