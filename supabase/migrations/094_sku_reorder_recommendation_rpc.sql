-- Migration 094: SKU-Wise Reorder Recommendation RPC and Analytics
-- ==============================================================================

-- Create RPC to fetch unified SKU reorder data with multi-period sales and supply chain details
CREATE OR REPLACE FUNCTION public.get_reorder_recommendations_data(
    p_country TEXT DEFAULT 'UAE',
    p_saddl_id TEXT DEFAULT 's2c_uae_test'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_country TEXT := COALESCE(NULLIF(p_country, ''), 'UAE');
    v_target_saddl_id TEXT := COALESCE(NULLIF(p_saddl_id, ''), 's2c_uae_test');
    v_result json;
BEGIN
    WITH 
    -- 1. Historical sales across multi-period windows (7d, 30d, 60d, 90d, 120d)
    sales_agg AS (
        SELECT 
            sku,
            SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN units_sold ELSE 0 END) AS sales_7d,
            SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '30 days' THEN units_sold ELSE 0 END) AS sales_30d,
            SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '60 days' THEN units_sold ELSE 0 END) AS sales_60d,
            SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '90 days' THEN units_sold ELSE 0 END) AS sales_90d,
            SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '120 days' THEN units_sold ELSE 0 END) AS sales_120d,
            SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '120 days' THEN COALESCE(revenue, 0) ELSE 0 END) AS revenue_120d,
            SUM(units_sold) AS sales_all_time,
            MAX(CASE WHEN units_sold > 0 THEN date ELSE NULL END) AS last_sale_date,
            MIN(CASE WHEN units_sold > 0 THEN date ELSE NULL END) AS first_sale_date,
            COUNT(DISTINCT CASE WHEN units_sold > 0 THEN date ELSE NULL END) AS days_with_sales
        FROM public.sales_snapshot
        WHERE country = v_target_country AND saddl_id = v_target_saddl_id
        GROUP BY sku
    ),

    -- 2. Latest inventory snapshot per node
    latest_snap_date AS (
        SELECT MAX(snapshot_date) AS max_date
        FROM public.inventory_snapshot
        WHERE country = v_target_country AND saddl_id = v_target_saddl_id
    ),
    snap_agg AS (
        SELECT 
            i.sku,
            SUM(CASE WHEN i.node = 'amazon_fba' THEN COALESCE(i.available, 0) ELSE 0 END) AS fba_available,
            SUM(CASE WHEN i.node = 'amazon_fba' THEN COALESCE(i.reserved, 0) ELSE 0 END) AS fba_reserved,
            SUM(CASE WHEN i.node = 'amazon_fba' THEN COALESCE(i.inbound, 0) ELSE 0 END) AS fba_inbound,
            SUM(CASE WHEN i.node = 'noon_fbn' THEN COALESCE(i.available, 0) ELSE 0 END) AS fbn_available,
            SUM(CASE WHEN i.node = 'Minutes' THEN COALESCE(i.available, 0) ELSE 0 END) AS minutes_available,
            SUM(CASE WHEN i.node = 'locad_warehouse' THEN COALESCE(i.available, 0) ELSE 0 END) AS locad_boxes,
            SUM(COALESCE(i.reserved, 0)) AS total_reserved,
            SUM(COALESCE(i.inbound, 0)) AS total_inbound,
            MAX(i.synced_at) AS last_inventory_sync
        FROM public.inventory_snapshot i
        JOIN latest_snap_date lsd ON i.snapshot_date = lsd.max_date
        WHERE i.country = v_target_country AND i.saddl_id = v_target_saddl_id
        GROUP BY i.sku
    ),

    -- 3. Pending Purchase Orders & Supplier Information
    po_agg AS (
        SELECT 
            sku,
            SUM(GREATEST(0, COALESCE(units_ordered, 0) - COALESCE(units_received, 0))) AS pending_ordered_units,
            SUM(GREATEST(0, COALESCE(units_ordered, 0) - COALESCE(units_received, 0)) * COALESCE(cogs_per_unit, 0)) AS incoming_po_value,
            MIN(CASE WHEN LOWER(TRIM(status)) IN ('ordered', 'shipped', 'in_transit') AND eta >= CURRENT_DATE THEN eta ELSE NULL END) AS earliest_eta
        FROM public.fact_purchase
        WHERE LOWER(TRIM(status)) IN ('ordered', 'shipped', 'in_transit', 'placed')
          AND COALESCE(country, 'UAE') = v_target_country
          AND saddl_id = v_target_saddl_id
        GROUP BY sku
    ),

    -- Latest Supplier by SKU
    supplier_latest AS (
        SELECT DISTINCT ON (sku)
            sku,
            supplier
        FROM public.fact_purchase
        WHERE supplier IS NOT NULL AND TRIM(supplier) <> ''
          AND COALESCE(country, 'UAE') = v_target_country
        ORDER BY sku, order_date DESC, created_at DESC
    )

    SELECT COALESCE(json_agg(
        json_build_object(
            'sku', sm.sku,
            'name', COALESCE(sm.name, sm.sku),
            'asin', sm.asin,
            'fnsku', sm.fnsku,
            'brand', CASE 
                WHEN sm.name ILIKE 'PETSLY%' OR sm.sku ILIKE 'PTSLY%' THEN 'PETSLY'
                WHEN sm.name ILIKE 'Bath & Relax%' THEN 'Bath & Relax'
                WHEN sm.name ILIKE 'Raymond Home%' THEN 'Raymond Home'
                ELSE 'S2C'
            END,
            'product_category', COALESCE(sm.product_category, 'General'),
            'sub_category', COALESCE(sm.sub_category, ''),
            'stored_abc_class', COALESCE(sm.category, 'C'),
            'is_active', COALESCE(sm.is_active, true),
            'amazon_active', COALESCE(sm.amazon_active, true),
            'noon_active', COALESCE(sm.noon_active, false),
            'minutes_active', COALESCE(sm.minutes_active, false),
            'cogs', COALESCE(sm.cogs, 0),
            'shipping_cost', COALESCE(sm.shipping_cost, 0),
            'landing_cost', COALESCE(sm.landing_cost, COALESCE(sm.cogs, 0) + COALESCE(sm.shipping_cost, 0)),
            'moq', COALESCE(sm.moq, 0),
            'units_per_box', COALESCE(NULLIF(sm.units_per_box, 0), 1),
            'lead_time_days', COALESCE(sm.lead_time_days, 45),
            
            -- Stocks
            'fba_available', COALESCE(sna.fba_available, 0),
            'fbn_available', COALESCE(sna.fbn_available, 0),
            'minutes_available', COALESCE(sna.minutes_available, 0),
            'locad_boxes', COALESCE(sna.locad_boxes, 0),
            'locad_available', COALESCE(sna.locad_boxes, 0) * COALESCE(NULLIF(sm.units_per_box, 0), 1),
            'total_available', (COALESCE(sna.fba_available, 0) + COALESCE(sna.fbn_available, 0) + COALESCE(sna.minutes_available, 0) + (COALESCE(sna.locad_boxes, 0) * COALESCE(NULLIF(sm.units_per_box, 0), 1))),
            'fba_reserved', COALESCE(sna.fba_reserved, 0),
            'fba_inbound', COALESCE(sna.fba_inbound, 0),
            'total_reserved', COALESCE(sna.total_reserved, 0),
            'total_inbound', COALESCE(sna.total_inbound, 0),
            'last_inventory_sync', sna.last_inventory_sync,

            -- Sales
            'sales_7d', COALESCE(sa.sales_7d, 0),
            'sales_30d', COALESCE(sa.sales_30d, 0),
            'sales_60d', COALESCE(sa.sales_60d, 0),
            'sales_90d', COALESCE(sa.sales_90d, 0),
            'sales_120d', COALESCE(sa.sales_120d, 0),
            'revenue_120d', COALESCE(sa.revenue_120d, 0),
            'sales_all_time', COALESCE(sa.sales_all_time, 0),
            'last_sale_date', sa.last_sale_date,
            'first_sale_date', sa.first_sale_date,
            'days_with_sales', COALESCE(sa.days_with_sales, 0),

            -- Supply Chain
            'supplier', COALESCE(sup.supplier, 'Direct Factory / SADDL'),
            'already_ordered', COALESCE(po.pending_ordered_units, 0),
            'incoming_po_value', COALESCE(po.incoming_po_value, 0),
            'earliest_eta', po.earliest_eta
        )
    ), '[]'::json) INTO v_result
    FROM public.sku_master sm
    LEFT JOIN snap_agg sna ON sm.sku = sna.sku
    LEFT JOIN sales_agg sa ON sm.sku = sa.sku
    LEFT JOIN po_agg po ON sm.sku = po.sku
    LEFT JOIN supplier_latest sup ON sm.sku = sup.sku
    WHERE sm.country = v_target_country AND sm.saddl_id = v_target_saddl_id;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reorder_recommendations_data(TEXT, TEXT) TO anon, authenticated, service_role;
