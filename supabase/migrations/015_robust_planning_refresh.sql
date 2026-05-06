-- Migration: Robust refresh for fact_inventory_planning with null handling and SKU driver
-- This ensures all active SKUs are shown and null values in sku_master don't break calculations.

CREATE OR REPLACE FUNCTION refresh_fact_inventory_planning()
RETURNS void AS $$
BEGIN
    -- 1. Clear existing fact data
    TRUNCATE TABLE fact_inventory_planning;

    -- 2. Recalculate and Insert fresh snapshots
    INSERT INTO fact_inventory_planning (
        sku,
        category,
        sub_category,
        action_flag,

        fba_units,
        amazon_sv,
        fbn_units,
        noon_sv,

        locad_units,
        locad_boxes,
        units_per_box,

        blended_sv,
        required_30d,
        stock_in_hand,
        shortfall,
        moq,

        amazon_coverage,
        noon_coverage,
        total_coverage,

        suggested_reorder_qty,
        total_reorder_cost,

        send_to_fba_units,
        send_to_fbn_units,

        fba_boxes,
        fbn_boxes,

        loaded_at
    )
    WITH latest_inventory AS (
        -- Get latest available per SKU per Node per Facility
        SELECT 
            sku,
            node,
            SUM(available) as total_available,
            SUM(inbound) as total_inbound -- Not used yet but available
        FROM (
            SELECT sku, node, warehouse_name, available, inbound,
                   ROW_NUMBER() OVER (PARTITION BY sku, node, warehouse_name ORDER BY snapshot_date DESC, synced_at DESC) as rn
            FROM inventory_snapshot
        ) t
        WHERE rn = 1
        GROUP BY sku, node
    ),

    inventory_pivot AS (
        SELECT 
            sku,
            MAX(CASE WHEN node = 'amazon_fba' THEN total_available ELSE 0 END) AS fba_units,
            MAX(CASE WHEN node = 'noon_fbn' THEN total_available ELSE 0 END) AS fbn_units,
            MAX(CASE WHEN node = 'locad_warehouse' THEN total_available ELSE 0 END) AS locad_boxes
        FROM latest_inventory
        GROUP BY sku
    ),

    sales_30d AS (
        SELECT
            sku,
            SUM(CASE WHEN channel='amazon' THEN units_sold ELSE 0 END) AS amz_units,
            SUM(CASE WHEN channel='noon' THEN units_sold ELSE 0 END) AS noon_units
        FROM sales_snapshot
        WHERE date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY sku
    ),

    -- DRIVER: Start from sku_master to ensure all SKUs are visible
    base AS (
        SELECT 
            sm.sku,
            sm.category,
            sm.sub_category,
            COALESCE(sm.moq, 0) as moq,
            COALESCE(sm.units_per_box, 1) as upb, -- Ensure UPB is at least 1 to avoid NULL/0 issues
            COALESCE(sm.cogs, 0) as cogs,
            
            COALESCE(i.fba_units, 0) as fba,
            COALESCE(i.fbn_units, 0) as fbn,
            COALESCE(i.locad_boxes, 0) as l_boxes,
            (COALESCE(i.locad_boxes, 0) * COALESCE(sm.units_per_box, 1)) as l_units,
            
            COALESCE(s.amz_units, 0) / 30.0 as amz_sv,
            COALESCE(s.noon_units, 0) / 30.0 as noon_sv,
            (COALESCE(s.amz_units, 0) + COALESCE(s.noon_units, 0)) / 30.0 as blended_sv,
            
            (COALESCE(s.amz_units, 0) + COALESCE(s.noon_units, 0)) as req_30d
        FROM sku_master sm
        LEFT JOIN inventory_pivot i ON sm.sku = i.sku
        LEFT JOIN sales_30d s ON sm.sku = s.sku
        WHERE sm.is_active = TRUE
    ),

    final_calc AS (
        SELECT *,
            (fba + fbn + l_units) AS stock_in_hand,

            GREATEST(req_30d - (fba + fbn + l_units), 0) AS shortfall_amt,

            CASE WHEN amz_sv > 0 THEN fba / amz_sv ELSE 0 END AS amz_cov,
            CASE WHEN noon_sv > 0 THEN fbn / noon_sv ELSE 0 END AS noon_cov,
            CASE WHEN blended_sv > 0 THEN (fba + fbn + l_units) / blended_sv ELSE 0 END AS tot_cov,

            CASE 
                WHEN blended_sv = 0 THEN 0
                ELSE GREATEST(
                    moq,
                    CEIL((blended_sv * 50) / NULLIF(upb, 0)) * upb
                )
            END AS suggested_reorder
        FROM base
    ),

    allocation AS (
        SELECT *,
        -- Send to FBA (from Locad)
        CASE 
            WHEN amz_sv = 0 AND fba > 0 THEN 0
            WHEN l_units >= (amz_sv * 30)
            THEN CEIL((amz_sv * 30) / NULLIF(upb, 0)) * upb
            ELSE CEIL(l_units / NULLIF(upb, 0)) * upb
        END AS send_fba,

        -- Send to FBN (from Locad)
        CASE 
            WHEN noon_sv = 0 THEN 0
            WHEN l_units > (amz_sv * 30) -- If we have surplus after FBA
            THEN 
                CASE 
                    WHEN (l_units - (amz_sv * 30)) >= (noon_sv * 30)
                    THEN CEIL((noon_sv * 30) / NULLIF(upb, 0)) * upb
                    ELSE CEIL((l_units - (amz_sv * 30)) / NULLIF(upb, 0)) * upb
                END
            ELSE 0
        END AS send_fbn

        FROM final_calc
    )

    SELECT 
        sku,
        category,
        sub_category,
        CASE 
            WHEN blended_sv = 0 THEN 'NO SALES'
            WHEN tot_cov < 15 THEN 'URGENT'
            WHEN tot_cov < 30 THEN 'REORDER'
            ELSE 'OK'
        END,

        fba,
        ROUND(amz_sv, 2),
        fbn,
        ROUND(noon_sv, 2),

        l_units,
        l_boxes,
        upb,

        ROUND(blended_sv, 2),
        req_30d,
        stock_in_hand,
        shortfall_amt,
        moq,

        ROUND(amz_cov, 2),
        ROUND(noon_cov, 2),
        ROUND(tot_cov, 2),

        suggested_reorder,
        ROUND(suggested_reorder * cogs, 2),

        send_fba,
        send_fbn,

        CEIL(send_fba / NULLIF(upb, 0)),
        CEIL(send_fbn / NULLIF(upb, 0)),

        NOW()

    FROM allocation;
END;
$$ LANGUAGE plpgsql;
