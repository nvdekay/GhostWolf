-- Production retention jobs. pg_cron stores schedules and run history in the cron schema.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'ghostwolf-cleanup',
  '17 3 * * *',
  $$ select public.gw_cleanup() $$
);

-- pg_cron does not prune its own run history.
select cron.schedule(
  'ghostwolf-cron-history-cleanup',
  '47 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '14 days' $$
);

create or replace function public.gw_cron_health()
returns jsonb
language sql stable security definer set search_path = '' as $$
  with cleanup_job as (
    select jobid, schedule, active
    from cron.job
    where jobname = 'ghostwolf-cleanup'
  ), last_run as (
    select d.status, d.start_time, d.end_time
    from cron.job_run_details d
    join cleanup_job j on j.jobid = d.jobid
    order by d.start_time desc
    limit 1
  )
  select jsonb_build_object(
    'scheduled', exists(select 1 from cleanup_job),
    'active', coalesce((select active from cleanup_job), false),
    'schedule', (select schedule from cleanup_job),
    'last_status', (select status from last_run),
    'last_started_at', (select start_time from last_run),
    'last_finished_at', (select end_time from last_run)
  );
$$;

revoke all on function public.gw_cron_health() from public, anon, authenticated;
grant execute on function public.gw_cron_health() to service_role;

do $$
begin
  if not exists (
    select 1 from cron.job
    where jobname = 'ghostwolf-cleanup' and schedule = '17 3 * * *' and active
  ) then
    raise exception 'ghostwolf-cleanup cron job was not scheduled';
  end if;
  if not exists (
    select 1 from cron.job
    where jobname = 'ghostwolf-cron-history-cleanup' and schedule = '47 3 * * *' and active
  ) then
    raise exception 'ghostwolf-cron-history-cleanup cron job was not scheduled';
  end if;
end;
$$;
