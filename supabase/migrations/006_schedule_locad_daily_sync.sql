-- 006_schedule_locad_daily_sync.sql
-- Daily Locad inventory sync scheduler via pg_cron + pg_net.
-- Runs at 03:15 UTC every day (07:15 UAE, UTC+4).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove old job if present (idempotent migration)
select cron.unschedule('daily_locad_sync')
where exists (
  select 1 from cron.job where jobname = 'daily_locad_sync'
);

select cron.schedule(
  'daily_locad_sync',
  '15 3 * * *',
  $$
  select
    net.http_post(
      url := 'https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/sync/locad',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    );
  $$
);
