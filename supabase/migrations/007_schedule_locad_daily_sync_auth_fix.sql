-- 007_schedule_locad_daily_sync_auth_fix.sql
-- Ensure daily Locad cron job uses explicit anon JWT for Edge Function auth.

select cron.unschedule('daily_locad_sync')
where exists (
  select 1 from cron.job where jobname = 'daily_locad_sync'
);

select cron.schedule(
  'daily_locad_sync',
  '15 3 * * *',
  $job$
  select
    net.http_post(
      url := 'https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/sync/locad',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
      ),
      body := '{}'::jsonb
    );
  $job$
);
