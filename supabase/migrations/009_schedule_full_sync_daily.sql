-- 008_schedule_full_sync_daily.sql
-- Replaces individual sync jobs with a full daily sync (Amazon + Locad) at 10:00 AM IST (04:30 AM UTC).

-- 1. Remove the old Locad-only sync job
select cron.unschedule('daily_locad_sync')
where exists (
  select 1 from cron.job where jobname = 'daily_locad_sync'
);

-- 2. Create the new Full Sync job
select cron.schedule(
  'daily_full_sync',
  '30 4 * * *',
  $job$
  select
    net.http_post(
      url := 'https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/sync/all',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
      ),
      body := '{}'::jsonb
    );
  $job$
);
