-- 088_schedule_hourly_fact_refresh.sql
-- Schedule refresh_fact_inventory_planning() to run every hour at minute 0

-- 1. Remove existing cron job if it exists
SELECT cron.unschedule('hourly_refresh_fact_inventory_planning')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'hourly_refresh_fact_inventory_planning'
);

-- 2. Schedule hourly execution via pg_cron
SELECT cron.schedule(
  'hourly_refresh_fact_inventory_planning',
  '0 * * * *',
  $$ SELECT refresh_fact_inventory_planning(); $$
);
