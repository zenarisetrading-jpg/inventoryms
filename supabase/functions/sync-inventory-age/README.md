# Inventory Age Sync — Supabase Edge Function

Production-ready Edge Function that synchronizes the `inventory_age` table from a
Source Supabase project to a Destination Supabase project. Runs daily at 2:00 AM UTC
via `pg_cron`.

## Table Schema

```sql
CREATE TABLE public.inventory_age (
    report_date  DATE    NOT NULL,
    account_id   TEXT    NOT NULL,
    sku          TEXT    NOT NULL,
    bucket       TEXT    NOT NULL,
    item_count   INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT inventory_age_pkey PRIMARY KEY (report_date, account_id, sku, bucket)
);

-- Indexes
CREATE INDEX idx_inventory_age_account_id  ON public.inventory_age (account_id);
CREATE INDEX idx_inventory_age_report_date ON public.inventory_age (report_date);
CREATE INDEX idx_inventory_age_sku         ON public.inventory_age (sku);
```

## Environment Secrets

| Variable | Description |
|---|---|
| `SOURCE_SUPABASE_URL` | API URL of the source project (e.g. `https://xxx.supabase.co`) |
| `SOURCE_SERVICE_ROLE_KEY` | Service role key for the source project |
| `DEST_SUPABASE_URL` | API URL of the destination project |
| `DEST_SERVICE_ROLE_KEY` | Service role key for the destination project |

**Set secrets via CLI:**
```bash
supabase secrets set SOURCE_SUPABASE_URL="https://xxx.supabase.co"
supabase secrets set SOURCE_SERVICE_ROLE_KEY="eyJ..."
supabase secrets set DEST_SUPABASE_URL="https://yyy.supabase.co"
supabase secrets set DEST_SERVICE_ROLE_KEY="eyJ..."
```

> **Important:** Use the API URL format (`https://<project-ref>.supabase.co`), NOT
> the dashboard URL (`https://supabase.com/dashboard/project/...`).

## Deployment

```bash
# Link the destination project
supabase link --project-ref <dest-project-ref>

# Deploy (--no-verify-jwt allows pg_cron to invoke without auth)
supabase functions deploy sync-inventory-age --no-verify-jwt
```

## Scheduled Execution (pg_cron)

The cron job is configured via [schedule_cron.sql](./schedule_cron.sql):
```bash
supabase db query --linked -f supabase/functions/sync-inventory-age/schedule_cron.sql
```

This schedules `0 2 * * *` (daily at 2:00 AM UTC).

## Manual Trigger (PowerShell)

```powershell
Invoke-RestMethod -Uri "https://<dest-ref>.supabase.co/functions/v1/sync-inventory-age" -Method Post
```

## How It Works

1. Reads all records from the source `inventory_age` table in batches of 1,000.
2. Upserts each batch into the destination using the composite primary key
   `(report_date, account_id, sku, bucket)`.
3. Verifies source and destination counts match.
4. Returns a JSON report with counts, timing, and match status.
5. Retries failed operations up to 3 times with exponential backoff.
6. Fully idempotent — running multiple times never creates duplicates.
