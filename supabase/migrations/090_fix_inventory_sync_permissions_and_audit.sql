-- Migration 090: Fix RLS permissions, indexes, and add Amazon sync audit log
-- =========================================================================

-- 1. Ensure RLS policies on inventory_snapshot, sales_snapshot, amazon_sales
DO $$
BEGIN
    -- inventory_snapshot
    ALTER TABLE public.inventory_snapshot ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "service_all_inventory_snapshot" ON public.inventory_snapshot;
    CREATE POLICY "service_all_inventory_snapshot" ON public.inventory_snapshot FOR ALL USING (true) WITH CHECK (true);

    -- sales_snapshot
    ALTER TABLE public.sales_snapshot ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "service_all_sales_snapshot" ON public.sales_snapshot;
    CREATE POLICY "service_all_sales_snapshot" ON public.sales_snapshot FOR ALL USING (true) WITH CHECK (true);

    -- amazon_sales
    ALTER TABLE public.amazon_sales ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "service_all_amazon_sales" ON public.amazon_sales;
    CREATE POLICY "service_all_amazon_sales" ON public.amazon_sales FOR ALL USING (true) WITH CHECK (true);
END $$;

-- 2. Create amazon_sync_log table for sync observability
CREATE TABLE IF NOT EXISTS public.amazon_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country TEXT NOT NULL DEFAULT 'UAE',
    saddl_id TEXT NOT NULL DEFAULT 's2c_uae_test',
    status TEXT NOT NULL DEFAULT 'running', -- 'running', 'success', 'partial', 'failed'
    records_fetched INT NOT NULL DEFAULT 0,
    records_updated INT NOT NULL DEFAULT 0,
    error_details TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

ALTER TABLE public.amazon_sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_amazon_sync_log" ON public.amazon_sync_log;
CREATE POLICY "allow_all_amazon_sync_log" ON public.amazon_sync_log FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.amazon_sync_log TO anon, authenticated, service_role;

-- 3. Create helper RPC to get latest sync status per country and saddl_id
CREATE OR REPLACE FUNCTION public.get_latest_amazon_sync_status(p_country TEXT DEFAULT 'UAE', p_saddl_id TEXT DEFAULT 's2c_uae_test')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_latest RECORD;
    v_last_success RECORD;
    v_result json;
BEGIN
    SELECT * INTO v_latest
    FROM public.amazon_sync_log
    WHERE country = p_country AND saddl_id = p_saddl_id
    ORDER BY started_at DESC
    LIMIT 1;

    SELECT * INTO v_last_success
    FROM public.amazon_sync_log
    WHERE country = p_country AND saddl_id = p_saddl_id AND status = 'success'
    ORDER BY completed_at DESC
    LIMIT 1;

    v_result := json_build_object(
        'latest_status', COALESCE(v_latest.status, 'never_run'),
        'started_at', v_latest.started_at,
        'completed_at', v_latest.completed_at,
        'records_fetched', COALESCE(v_latest.records_fetched, 0),
        'records_updated', COALESCE(v_latest.records_updated, 0),
        'error_details', v_latest.error_details,
        'last_success_at', v_last_success.completed_at
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_amazon_sync_status(TEXT, TEXT) TO anon, authenticated, service_role;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
