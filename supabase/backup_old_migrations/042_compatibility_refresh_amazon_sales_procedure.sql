-- =========================================================
-- 042_compatibility_refresh_amazon_sales_procedure.sql
-- Compatibility layer for database schedulers/pg_cron jobs
-- that invoke 'CALL refresh_amazon_sales();' instead of the
-- function 'SELECT public.refresh_amazon_sales_data();'.
-- =========================================================

CREATE OR REPLACE PROCEDURE public.refresh_amazon_sales()
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Execute the underlying Amazon sales refresh function
    PERFORM public.refresh_amazon_sales_data();
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON PROCEDURE public.refresh_amazon_sales() TO authenticated, anon, service_role;
