-- Migration: 023_dashboard_stats_rpc.sql
-- Adds pricing metadata and RPC for dashboard summary cards

-- 1. Add pricing to sku_master
ALTER TABLE sku_master ADD COLUMN IF NOT EXISTS avg_sell_price_aed NUMERIC DEFAULT 0;

-- 2. Populate some dummy prices based on COGS if they are 0 (COGS * 2.5 is a safe guess for these categories)
UPDATE sku_master SET avg_sell_price_aed = cogs * 2.5 WHERE (avg_sell_price_aed IS NULL OR avg_sell_price_aed = 0) AND cogs > 0;

-- 3. Add advertising rate to system_config if missing
INSERT INTO system_config (key, value, description) 
VALUES ('abc_adv_rate', '0.15', 'Estimated advertising cost as percentage of revenue')
ON CONFLICT (key) DO NOTHING;

-- 4. Create RPC for Dashboard Stats
CREATE OR REPLACE FUNCTION get_dashboard_sales_summary()
RETURNS JSONB AS $$
DECLARE
    max_date DATE;
    today_date DATE;
    yesterday_date DATE;
    mtd_start DATE;
    last_month_start DATE;
    last_month_end DATE;
    days_in_month INT;
    days_passed_mtd INT;
    fee_rate NUMERIC;
    adv_rate NUMERIC;
    result JSONB;
BEGIN
    -- Get current context
    SELECT MAX(date) INTO max_date FROM sales_snapshot;
    IF max_date IS NULL THEN RETURN '{}'::JSONB; END IF;
    
    today_date := max_date;
    yesterday_date := max_date - INTERVAL '1 day';
    mtd_start := DATE_TRUNC('month', max_date);
    last_month_start := mtd_start - INTERVAL '1 month';
    last_month_end := mtd_start - INTERVAL '1 day';
    
    days_in_month := EXTRACT(DAY FROM (DATE_TRUNC('month', max_date) + INTERVAL '1 month' - INTERVAL '1 day'));
    days_passed_mtd := EXTRACT(DAY FROM max_date);

    -- Get rates from config
    SELECT value::NUMERIC INTO fee_rate FROM system_config WHERE key = 'abc_fee_rate';
    SELECT value::NUMERIC INTO adv_rate FROM system_config WHERE key = 'abc_adv_rate';
    
    WITH date_ranges AS (
        SELECT 'today' as label, today_date as start_d, today_date as end_d
        UNION ALL
        SELECT 'yesterday', yesterday_date, yesterday_date
        UNION ALL
        SELECT 'mtd', mtd_start, max_date
        UNION ALL
        SELECT 'last_month', last_month_start, last_month_end
    ),
    range_stats AS (
        SELECT 
            dr.label,
            COALESCE(SUM(s.units_sold), 0) as units,
            COALESCE(COUNT(DISTINCT s.id), 0) as orders, -- Note: this is a proxy since we don't have order_id
            COALESCE(SUM(s.units_sold * sm.avg_sell_price_aed), 0) as sales_aed,
            COALESCE(SUM(s.units_sold * sm.cogs), 0) as total_cogs,
            -- Breakdown by channel
            COALESCE(SUM(CASE WHEN s.channel = 'amazon' THEN s.units_sold * sm.avg_sell_price_aed ELSE 0 END), 0) as amazon_sales,
            COALESCE(SUM(CASE WHEN s.channel = 'amazon' THEN s.units_sold ELSE 0 END), 0) as amazon_units,
            COALESCE(SUM(CASE WHEN s.channel = 'noon' THEN s.units_sold * sm.avg_sell_price_aed ELSE 0 END), 0) as noon_sales,
            COALESCE(SUM(CASE WHEN s.channel = 'noon' THEN s.units_sold ELSE 0 END), 0) as noon_units,
            COALESCE(SUM(CASE WHEN s.channel = 'noon_minutes' THEN s.units_sold * sm.avg_sell_price_aed ELSE 0 END), 0) as minutes_sales,
            COALESCE(SUM(CASE WHEN s.channel = 'noon_minutes' THEN s.units_sold ELSE 0 END), 0) as minutes_units
        FROM date_ranges dr
        LEFT JOIN sales_snapshot s ON s.date >= dr.start_d AND s.date <= dr.end_d
        LEFT JOIN sku_master sm ON s.sku = sm.sku
        GROUP BY dr.label
    ),
    calculated_stats AS (
        SELECT 
            *,
            (sales_aed * adv_rate) as adv_cost,
            (sales_aed * (1 - fee_rate)) as est_payout,
            (sales_aed * (1 - fee_rate) - total_cogs) as gross_profit,
            (sales_aed * (1 - fee_rate) - total_cogs - (sales_aed * adv_rate)) as net_profit,
            CASE 
                WHEN label = 'mtd' THEN (sales_aed / days_passed_mtd) * days_in_month 
                ELSE 0 
            END as forecast_sales
        FROM range_stats
    )
    SELECT jsonb_object_agg(label, row_to_json(calculated_stats)) INTO result FROM calculated_stats;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_dashboard_sales_summary() TO anon;
GRANT EXECUTE ON FUNCTION get_dashboard_sales_summary() TO authenticated;
