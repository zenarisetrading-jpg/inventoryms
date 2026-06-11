-- =========================================================
-- 055_add_refresh_triggers.sql
-- Create database triggers to automatically refresh fact tables
-- when source data tables (sales and inventory) are updated.
-- =========================================================

-- 1. Trigger Function for Sales
CREATE OR REPLACE FUNCTION trigger_refresh_fact_sales()
RETURNS TRIGGER AS $$
BEGIN
    -- Refresh sales data with a 30-day lookback for efficiency
    PERFORM refresh_fact_sales_data(30);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach trigger to amazon_sales
DROP TRIGGER IF EXISTS trg_refresh_amazon_sales ON public.amazon_sales;
CREATE TRIGGER trg_refresh_amazon_sales
AFTER INSERT OR UPDATE OR DELETE ON public.amazon_sales
FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_fact_sales();

-- 3. Attach trigger to noon_sales
DROP TRIGGER IF EXISTS trg_refresh_noon_sales ON public.noon_sales;
CREATE TRIGGER trg_refresh_noon_sales
AFTER INSERT OR UPDATE OR DELETE ON public.noon_sales
FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_fact_sales();

-- 4. Attach trigger to minutes_sales
DROP TRIGGER IF EXISTS trg_refresh_minutes_sales ON public.minutes_sales;
CREATE TRIGGER trg_refresh_minutes_sales
AFTER INSERT OR UPDATE OR DELETE ON public.minutes_sales
FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_fact_sales();


-- 5. Trigger Function for Inventory
CREATE OR REPLACE FUNCTION trigger_refresh_fact_inventory()
RETURNS TRIGGER AS $$
BEGIN
    -- Refresh inventory planning data
    PERFORM refresh_fact_inventory_planning();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Attach trigger to inventory_snapshot
DROP TRIGGER IF EXISTS trg_refresh_inventory_snapshot ON public.inventory_snapshot;
CREATE TRIGGER trg_refresh_inventory_snapshot
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_snapshot
FOR EACH STATEMENT EXECUTE FUNCTION trigger_refresh_fact_inventory();
