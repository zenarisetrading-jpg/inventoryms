-- Migration 091: Tighten RLS permissions on sync tables and secure execute_sql
-- =========================================================================

-- 1. Tighten inventory_snapshot policies
ALTER TABLE public.inventory_snapshot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_inventory_snapshot" ON public.inventory_snapshot;
DROP POLICY IF EXISTS "read_inventory_snapshot" ON public.inventory_snapshot;

CREATE POLICY "read_inventory_snapshot" ON public.inventory_snapshot
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "service_all_inventory_snapshot" ON public.inventory_snapshot
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- 2. Tighten sales_snapshot policies
ALTER TABLE public.sales_snapshot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_sales_snapshot" ON public.sales_snapshot;
DROP POLICY IF EXISTS "read_sales_snapshot" ON public.sales_snapshot;

CREATE POLICY "read_sales_snapshot" ON public.sales_snapshot
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "service_all_sales_snapshot" ON public.sales_snapshot
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- 3. Tighten amazon_sales policies
ALTER TABLE public.amazon_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_amazon_sales" ON public.amazon_sales;
DROP POLICY IF EXISTS "read_amazon_sales" ON public.amazon_sales;

CREATE POLICY "read_amazon_sales" ON public.amazon_sales
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "service_all_amazon_sales" ON public.amazon_sales
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- 4. Tighten amazon_sync_log policies
ALTER TABLE public.amazon_sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_amazon_sync_log" ON public.amazon_sync_log;
DROP POLICY IF EXISTS "service_all_amazon_sync_log" ON public.amazon_sync_log;
DROP POLICY IF EXISTS "read_amazon_sync_log" ON public.amazon_sync_log;

CREATE POLICY "read_amazon_sync_log" ON public.amazon_sync_log
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "service_all_amazon_sync_log" ON public.amazon_sync_log
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- 5. Revoke DDL/DML execute_sql from anon & authenticated to close security hole
REVOKE EXECUTE ON FUNCTION public.execute_sql(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.execute_sql(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.execute_sql(text) TO service_role;

-- 6. Ensure get_latest_amazon_sync_status is callable by anon & authenticated
GRANT EXECUTE ON FUNCTION public.get_latest_amazon_sync_status(TEXT, TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
