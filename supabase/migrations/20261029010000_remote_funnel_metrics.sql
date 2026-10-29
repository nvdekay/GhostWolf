-- Cohort funnel for the scheduled production health report (no chat/role/action payloads).

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
