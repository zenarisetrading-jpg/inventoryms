-- Migration 084: Create get_dashboard_data RPC

CREATE OR REPLACE FUNCTION get_dashboard_data(
    p_country text,
    p_account_id text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
    v_alerts json;
    v_ship_now json;
    v_reorder_now json;
    v_inbound json;
    v_metrics record;
    v_oos_skus_amazon json;
    v_oos_skus_noon json;
    v_oos_skus_minutes json;
    v_oos_skus_total_risk json;
    
    v_synced_at text;
    v_snap_amazon text;
    v_snap_noon text;
    v_snap_minutes text;
    v_snap_locad text;
BEGIN

    -- CREATE TEMP TABLE for the joined data so we don't repeat the join
    CREATE TEMP TABLE tmp_dashboard_data ON COMMIT DROP AS
    SELECT 
        f.*,
        sm.name,
        sm.category AS meta_category,
        sm.lead_time_days,
        sm.cogs AS meta_cogs,
        COALESCE(sm.is_active, true) AS meta_is_active,
        COALESCE(sm.amazon_active, true) AS meta_amazon_active,
        COALESCE(sm.noon_active, true) AS meta_noon_active,
        COALESCE(sm.minutes_active, true) AS meta_minutes_active,
        COALESCE(f.blended_sv, 0) AS safe_blended_sv,
        COALESCE(f.amazon_sv, 0) AS safe_amazon_sv,
        COALESCE(f.noon_sv, 0) AS safe_noon_sv,
        COALESCE(f.minutes_sv, 0) AS safe_minutes_sv,
        COALESCE(f.fba_units, 0) AS safe_fba_units,
        COALESCE(f.fbn_units, 0) AS safe_fbn_units,
        COALESCE(f.minutes_units, 0) AS safe_minutes_units,
        COALESCE(f.amazon_coverage, 0) AS safe_amz_cov,
        COALESCE(f.noon_coverage, 0) AS safe_noon_cov,
        COALESCE(f.fba_boxes, 0) AS safe_fba_boxes,
        COALESCE(f.fbn_boxes, 0) AS safe_fbn_boxes,
        0 AS safe_minutes_boxes, -- using 0 as fallback, adjust if minutes_boxes exists
        COALESCE(f.locad_units, 0) AS safe_locad_units,
        COALESCE(f.locad_boxes, 0) AS safe_locad_boxes,
        COALESCE(f.units_per_box, 1) AS safe_upb,
        COALESCE(f.total_coverage, 0) AS safe_total_cov,
        COALESCE(f.suggested_reorder_qty, 0) AS safe_reorder_qty,
        COALESCE(f.send_to_fba_units, 0) AS safe_send_fba,
        COALESCE(f.send_to_fbn_units, 0) AS safe_send_fbn
    FROM fact_inventory_planning f
    JOIN sku_master sm ON f.sku = sm.sku AND sm.country = p_country
    WHERE f.country = p_country
      AND (p_account_id IS NULL OR f.saddl_id = p_account_id)
      AND COALESCE(sm.is_active, true) = true;

    -- 1. Alerts
    SELECT COALESCE(json_agg(
        json_build_object(
            'sku', sku,
            'name', name,
            'action_flag', CASE WHEN safe_amz_cov = 0 AND safe_noon_cov = 0 AND (safe_amazon_sv > 0 OR safe_noon_sv > 0) THEN 'CRITICAL_OOS_RISK' ELSE 'OOS_RISK' END,
            'total_coverage', safe_total_cov,
            'coverage_amazon', safe_amz_cov,
            'coverage_noon', safe_noon_cov,
            'coverage_warehouse', CASE WHEN safe_blended_sv > 0 THEN safe_locad_units / safe_blended_sv ELSE 0 END,
            'blended_sv', safe_blended_sv
        ) ORDER BY safe_total_cov ASC
    ), '[]'::json) INTO v_alerts
    FROM tmp_dashboard_data
    WHERE (safe_amz_cov = 0 AND safe_noon_cov = 0 AND (safe_amazon_sv > 0 OR safe_noon_sv > 0))
       OR ((safe_amz_cov > 0 AND safe_amz_cov < 14) OR (safe_noon_cov > 0 AND safe_noon_cov < 14));

    -- 2. Ship Now
    SELECT COALESCE(json_agg(
        json_build_object(
            'sku', sku,
            'name', name,
            'allocation_logic', COALESCE(action_flag, CASE WHEN safe_amz_cov = 0 AND safe_noon_cov = 0 AND (safe_amazon_sv > 0 OR safe_noon_sv > 0) THEN 'CRITICAL PRIORITIZED' ELSE 'STANDARD REPLENISHMENT' END),
            'blended_sv', safe_blended_sv,
            'amazon_sv', safe_amazon_sv,
            'noon_sv', safe_noon_sv,
            'minutes_sv', safe_minutes_sv,
            'current_fba_stock_units', safe_fba_units,
            'current_fbn_stock_units', safe_fbn_units,
            'current_minutes_stock_units', safe_minutes_units,
            'boxes_in_hand', safe_locad_boxes,
            'boxes_required_30d_amz', CEIL((safe_amazon_sv * 30) / GREATEST(1, safe_upb)),
            'boxes_required_30d_noon', CEIL((safe_noon_sv * 30) / GREATEST(1, safe_upb)),
            'boxes_required_30d_minutes', CEIL((safe_minutes_sv * 30) / GREATEST(1, safe_upb)),
            'suggested_boxes_amazon', safe_fba_boxes,
            'suggested_boxes_noon', safe_fbn_boxes,
            'suggested_boxes_minutes', safe_minutes_boxes,
            'total_boxes_to_ship', safe_fba_boxes + safe_fbn_boxes + safe_minutes_boxes,
            'total_units_to_ship', safe_send_fba + safe_send_fbn,
            'send_to_fba_units', safe_send_fba,
            'send_to_fbn_units', safe_send_fbn,
            'send_to_minutes_units', 0,
            'units_per_box', safe_upb,
            'plan_date', CURRENT_TIMESTAMP
        )
    ), '[]'::json) INTO v_ship_now
    FROM tmp_dashboard_data
    WHERE safe_fba_boxes > 0 OR safe_fbn_boxes > 0 OR safe_minutes_boxes > 0;

    -- 3. Reorder Now
    SELECT COALESCE(json_agg(
        json_build_object(
            'sku', sku,
            'name', name,
            'category', meta_category,
            'should_reorder', true,
            'suggested_units', safe_reorder_qty,
            'projected_coverage', safe_total_cov,
            'blended_sv', safe_blended_sv,
            'lead_time_days', COALESCE(lead_time_days, 30),
            'moq', COALESCE(moq, 0),
            'cogs', COALESCE(meta_cogs, 0)
        ) ORDER BY safe_total_cov ASC
    ), '[]'::json) INTO v_reorder_now
    FROM tmp_dashboard_data
    WHERE safe_reorder_qty > 0;

    -- 4. Inbound POs
    SELECT COALESCE(json_agg(
        json_build_object(
            'id', po_number,
            'po_number', po_number,
            'supplier', MAX(supplier),
            'eta', MAX(eta),
            'status', MAX(status),
            'total_units', SUM(COALESCE(units_ordered, 0) - COALESCE(units_received, 0)),
            'line_items', json_agg(
                json_build_object(
                    'sku', fp.sku,
                    'name', COALESCE((SELECT name FROM sku_master WHERE sku = fp.sku AND country = p_country LIMIT 1), fp.sku),
                    'units_ordered', units_ordered,
                    'units_received', COALESCE(units_received, 0)
                )
            )
        )
    ), '[]'::json) INTO v_inbound
    FROM fact_purchase fp
    WHERE fp.country = p_country
      AND (p_account_id IS NULL OR fp.saddl_id = p_account_id)
      AND LOWER(TRIM(fp.status)) IN ('ordered', 'shipped', 'in_transit')
    GROUP BY po_number;

    -- 5. Metrics & OOS Arrays
    SELECT 
        COUNT(CASE WHEN meta_amazon_active THEN 1 END) AS amzLiveCount,
        COUNT(CASE WHEN meta_amazon_active AND safe_fba_units <= 0 THEN 1 END) AS amzOOSCount,
        COUNT(CASE WHEN meta_noon_active THEN 1 END) AS noonLiveCount,
        COUNT(CASE WHEN meta_noon_active AND safe_fbn_units <= 0 THEN 1 END) AS noonOOSCount,
        COUNT(CASE WHEN meta_minutes_active THEN 1 END) AS minLiveCount,
        COUNT(CASE WHEN meta_minutes_active AND safe_minutes_units <= 0 THEN 1 END) AS minOOSCount,
        COUNT(CASE WHEN meta_amazon_active OR meta_noon_active OR meta_minutes_active THEN 1 END) AS totalLiveCount,
        COUNT(CASE WHEN (meta_amazon_active OR meta_noon_active OR meta_minutes_active) 
                   AND (CASE WHEN meta_amazon_active THEN safe_fba_units ELSE 0 END + 
                        CASE WHEN meta_noon_active THEN safe_fbn_units ELSE 0 END + 
                        CASE WHEN meta_minutes_active THEN safe_minutes_units ELSE 0 END) <= 0 
              THEN 1 END) AS totalOOSCount
    INTO v_metrics
    FROM tmp_dashboard_data;

    SELECT COALESCE(json_agg(
        json_build_object('sku', sku, 'name', name, 'blended_sv', safe_blended_sv, 'coverage_amazon', 0, 'coverage_noon', safe_noon_cov, 'fba_units', safe_fba_units, 'fbn_units', safe_fbn_units, 'minutes_units', safe_minutes_units) ORDER BY safe_blended_sv DESC
    ), '[]'::json) INTO v_oos_skus_amazon FROM tmp_dashboard_data WHERE meta_amazon_active AND safe_fba_units <= 0;

    SELECT COALESCE(json_agg(
        json_build_object('sku', sku, 'name', name, 'blended_sv', safe_blended_sv, 'coverage_amazon', safe_amz_cov, 'coverage_noon', 0, 'fba_units', safe_fba_units, 'fbn_units', safe_fbn_units, 'minutes_units', safe_minutes_units) ORDER BY safe_blended_sv DESC
    ), '[]'::json) INTO v_oos_skus_noon FROM tmp_dashboard_data WHERE meta_noon_active AND safe_fbn_units <= 0;

    SELECT COALESCE(json_agg(
        json_build_object('sku', sku, 'name', name, 'blended_sv', safe_blended_sv, 'coverage_amazon', safe_amz_cov, 'coverage_noon', safe_noon_cov, 'fba_units', safe_fba_units, 'fbn_units', safe_fbn_units, 'minutes_units', 0) ORDER BY safe_blended_sv DESC
    ), '[]'::json) INTO v_oos_skus_minutes FROM tmp_dashboard_data WHERE meta_minutes_active AND safe_minutes_units <= 0;

    SELECT COALESCE(json_agg(
        json_build_object('sku', sku, 'name', name, 'category', meta_category, 'product_category', sub_category, 'sub_category', sub_category, 'blended_sv', safe_blended_sv, 'suggested_units', safe_reorder_qty, 'total_cost_aed', safe_reorder_qty * COALESCE(meta_cogs, 0)) ORDER BY safe_blended_sv DESC
    ), '[]'::json) INTO v_oos_skus_total_risk FROM tmp_dashboard_data WHERE safe_fba_units <= 0 AND safe_fbn_units <= 0 AND safe_total_cov < 14;

    -- Snapshot dates
    SELECT MAX(synced_at)::text INTO v_synced_at FROM inventory_snapshot WHERE country = p_country AND (p_account_id IS NULL OR saddl_id = p_account_id);
    SELECT MAX(snapshot_date)::text INTO v_snap_amazon FROM inventory_snapshot WHERE node = 'amazon_fba' AND country = p_country AND (p_account_id IS NULL OR saddl_id = p_account_id);
    SELECT MAX(snapshot_date)::text INTO v_snap_noon FROM inventory_snapshot WHERE node = 'noon_fbn' AND country = p_country AND (p_account_id IS NULL OR saddl_id = p_account_id);
    SELECT MAX(snapshot_date)::text INTO v_snap_minutes FROM inventory_snapshot WHERE node = 'Minutes' AND country = p_country AND (p_account_id IS NULL OR saddl_id = p_account_id);
    SELECT MAX(snapshot_date)::text INTO v_snap_locad FROM inventory_snapshot WHERE node = 'locad_warehouse' AND country = p_country AND (p_account_id IS NULL OR saddl_id = p_account_id);

    RETURN json_build_object(
        'alerts', v_alerts,
        'ship_now', (SELECT COALESCE(json_agg(el), '[]'::json) FROM (SELECT * FROM json_array_elements(v_ship_now) ORDER BY (value->>'total_units_to_ship')::numeric DESC) x(el)),
        'reorder_now', v_reorder_now,
        'transfers', '[]'::json,
        'inbound', v_inbound,
        'excess', '[]'::json,
        'live_selling_skus', v_metrics.totalLiveCount,
        'live_skus_amazon', v_metrics.amzLiveCount,
        'live_skus_noon', v_metrics.noonLiveCount,
        'live_skus_minutes', v_metrics.minLiveCount,
        'oos_pct_amazon', CASE WHEN v_metrics.amzLiveCount > 0 THEN ROUND((v_metrics.amzOOSCount::numeric / v_metrics.amzLiveCount) * 100, 1) ELSE 0 END,
        'oos_pct_noon', CASE WHEN v_metrics.noonLiveCount > 0 THEN ROUND((v_metrics.noonOOSCount::numeric / v_metrics.noonLiveCount) * 100, 1) ELSE 0 END,
        'oos_pct_minutes', CASE WHEN v_metrics.minLiveCount > 0 THEN ROUND((v_metrics.minOOSCount::numeric / v_metrics.minLiveCount) * 100, 1) ELSE 0 END,
        'oos_pct_total', CASE WHEN v_metrics.totalLiveCount > 0 THEN ROUND((v_metrics.totalOOSCount::numeric / v_metrics.totalLiveCount) * 100, 1) ELSE 0 END,
        'oos_count_amazon', v_metrics.amzOOSCount,
        'oos_count_noon', v_metrics.noonOOSCount,
        'oos_count_minutes', v_metrics.minOOSCount,
        'oos_count_total', v_metrics.totalOOSCount,
        'oos_skus_amazon', v_oos_skus_amazon,
        'oos_skus_noon', v_oos_skus_noon,
        'oos_skus_minutes', v_oos_skus_minutes,
        'oos_skus_total_risk', v_oos_skus_total_risk,
        'last_synced', COALESCE(v_synced_at, CURRENT_TIMESTAMP::text),
        'latest_snapshot_amazon', COALESCE(v_snap_amazon, '—'),
        'latest_snapshot_noon', COALESCE(v_snap_noon, '—'),
        'latest_snapshot_minutes', COALESCE(v_snap_minutes, '—'),
        'latest_snapshot_locad', COALESCE(v_snap_locad, '—'),
        'generated_at', CURRENT_TIMESTAMP::text
    );
END;
$$;
