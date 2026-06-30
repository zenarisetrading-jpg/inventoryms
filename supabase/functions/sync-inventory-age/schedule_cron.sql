-- Schedule the sync-inventory-age Edge Function to run daily at 2:00 AM UTC
-- Uses pg_cron + pg_net to make an HTTP POST to the Edge Function endpoint

SELECT cron.schedule(
    'sync-inventory-age-job',
    '0 2 * * *',
    $$
    SELECT net.http_post(
        url := 'https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/sync-inventory-age',
        headers := '{"Content-Type": "application/json"}'::jsonb
    ) AS request_id;
    $$
);
