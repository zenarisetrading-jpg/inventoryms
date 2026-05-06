-- Migration: 017_dynamic_required_stock.sql
-- Update required stock calculation based on category:
-- CAT A: 60 days
-- CAT B: 45 days
-- CAT C: 30 days

CREATE OR REPLACE FUNCTION refresh_fact_inventory_planning()
RETURNS void AS $$
BEGIN
    -- Step 1: Clear old data
    TRUNCATE TABLE fact_inventory_planning;

    -- Step 2: Insert fresh data
    INSERT INTO fact_inventory_planning (
        sku,
        category,
        sub_category,
        action_flag,

        fba_units,
        amazon_sv,
        fbn_units,
        noon_sv,
        minutes_units,
        minutes_sv,

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
        cogs,
        suggested_reorder_qty,
        already_ordered,
        pending_qty_to_reorder,
        total_reorder_cost,
        send_to_fba_units,
        send_to_fbn_units,
        fba_boxes,
        fbn_boxes
    )
    WITH latest_snapshot AS (
        SELECT 
            sku, 
            node, 
            available, 
            warehouse_name,
            ROW_NUMBER() OVER(PARTITION BY sku, node, warehouse_name ORDER BY snapshot_date DESC) as rn
        FROM inventory_snapshot
    ),

    inventory_data AS (
        SELECT
            ls.sku,
            SUM(CASE WHEN ls.node = 'amazon_fba' THEN ls.available ELSE 0 END) AS fba_units,
            SUM(CASE WHEN ls.node = 'noon_fbn' THEN ls.available ELSE 0 END) AS fbn_units,
            SUM(CASE WHEN ls.node = 'Minutes' THEN ls.available ELSE 0 END) AS minutes_units,
            SUM(CASE WHEN ls.node = 'locad_warehouse' THEN ls.available ELSE 0 END) AS locad_boxes
        FROM latest_snapshot ls
        WHERE rn = 1
        GROUP BY ls.sku
    ),

    sales_pivot AS (
        SELECT
            sku,
            SUM(CASE WHEN channel='amazon' THEN units_sold ELSE 0 END) AS amazon_units,
            SUM(CASE WHEN channel='noon' THEN units_sold ELSE 0 END) AS noon_units,
            SUM(CASE WHEN channel='noon_minutes' THEN units_sold ELSE 0 END) AS minutes_units
        FROM sales_snapshot
        WHERE date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY sku
    ),

    fact_purchase_agg AS (
        SELECT 
            sku,
            SUM(units_ordered - units_received) AS pending_ordered
        FROM po_line_items li
        JOIN po_register r ON li.po_id = r.id
        WHERE r.status IN ('ordered', 'shipped', 'in_transit')
        GROUP BY sku
    ),

    base AS (
        SELECT 
            i.sku,
            COALESCE(i.fba_units,0) AS fba_units,
            COALESCE(i.fbn_units,0) AS fbn_units,
            COALESCE(i.minutes_units,0) AS minutes_units,
            COALESCE(i.locad_boxes,0) AS locad_boxes,

            sm.category,
            sm.sub_category,
            sm.moq,
            sm.units_per_box,
            sm.cogs,

            COALESCE(i.locad_boxes,0) * sm.units_per_box AS locad_units,

            COALESCE(sp.amazon_units,0)/30.0 AS amazon_sv,
            COALESCE(sp.noon_units,0)/30.0 AS noon_sv,
            COALESCE(sp.minutes_units,0)/30.0 AS minutes_sv,

            (COALESCE(sp.amazon_units,0)+COALESCE(sp.noon_units,0)+COALESCE(sp.minutes_units,0))/30.0 AS blended_sv,

            COALESCE(sp.amazon_units,0) AS amazon_required_30,
            COALESCE(sp.noon_units,0) AS noon_required_30,
            COALESCE(sp.minutes_units,0) AS minutes_required_30

        FROM inventory_data i
        INNER JOIN sku_master sm 
            ON i.sku = sm.sku AND sm.is_active = TRUE
        LEFT JOIN sales_pivot sp 
            ON i.sku = sp.sku
    ),

    final_calc AS (
        SELECT *,
            (fba_units + fbn_units + minutes_units + locad_units) AS stock_in_hand,

            -- DYNAMIC REQUIRED based on category
            (blended_sv * (
                CASE 
                    WHEN category = 'A' THEN 60
                    WHEN category = 'B' THEN 45
                    ELSE 30
                END
            )) AS dynamic_required,

            GREATEST(
                (blended_sv * (
                    CASE 
                        WHEN category = 'A' THEN 60
                        WHEN category = 'B' THEN 45
                        ELSE 30
                    END
                )) - (fba_units + fbn_units + minutes_units + locad_units),
            0) AS shortfall,

            CASE WHEN amazon_sv > 0 THEN fba_units / amazon_sv ELSE 0 END AS amazon_coverage,
            CASE WHEN noon_sv > 0 THEN fbn_units / noon_sv ELSE 0 END AS noon_coverage,
            CASE WHEN blended_sv > 0 THEN (fba_units + fbn_units + minutes_units + locad_units) / blended_sv ELSE 0 END AS total_coverage,

            CASE 
                WHEN shortfall < NULLIF(units_per_box, 0) THEN 0
                ELSE GREATEST(
                    moq,
                    CEIL(shortfall / NULLIF(units_per_box, 0)) * units_per_box
                )
            END AS suggested_reorder_qty

        FROM base
    ),

    allocation_step1 AS (
        SELECT *,
        CASE
            WHEN fba_units <= 0 AND amazon_sv <= 0 THEN 1
            WHEN fba_units < units_per_box AND amazon_sv > 0 THEN GREATEST(1, COALESCE(CEIL(GREATEST(0, amazon_required_30 - fba_units) / NULLIF(units_per_box, 0)), 0))
            ELSE COALESCE(CEIL(GREATEST(0, amazon_required_30 - fba_units) / NULLIF(units_per_box, 0)), 0)
        END AS fba_need_boxes,
        
        CASE
            WHEN fbn_units <= 0 AND noon_sv <= 0 THEN 1
            WHEN fbn_units < units_per_box AND noon_sv > 0 THEN GREATEST(1, COALESCE(CEIL(GREATEST(0, noon_required_30 - fbn_units) / NULLIF(units_per_box, 0)), 0))
            ELSE COALESCE(CEIL(GREATEST(0, noon_required_30 - fbn_units) / NULLIF(units_per_box, 0)), 0)
        END AS fbn_need_boxes
        
        FROM final_calc
    ),

    allocation AS (
        SELECT *,
        LEAST(locad_boxes, fba_need_boxes) * units_per_box AS send_to_fba,
        LEAST(GREATEST(0, locad_boxes - fba_need_boxes), fbn_need_boxes) * units_per_box AS send_to_fbn
        FROM allocation_step1
    )

    SELECT 
        a.sku,
        a.category,
        a.sub_category,

        CASE 
            WHEN blended_sv = 0 THEN 'NO SALES'
            WHEN total_coverage < 15 THEN 'URGENT'
            WHEN total_coverage < 30 THEN 'REORDER'
            ELSE 'OK'
        END,

        fba_units,
        ROUND(amazon_sv,2),
        fbn_units,
        ROUND(noon_sv,2),
        minutes_units,
        ROUND(minutes_sv,2),

        locad_units,
        locad_boxes,
        units_per_box,

        ROUND(blended_sv,2),

        dynamic_required,
        stock_in_hand,
        shortfall,
        moq,

        ROUND(amazon_coverage,2),
        ROUND(noon_coverage,2),
        ROUND(total_coverage,2),

        cogs,

        suggested_reorder_qty,
        COALESCE(pa.pending_ordered, 0),
        GREATEST(0, suggested_reorder_qty - COALESCE(pa.pending_ordered, 0)),
        GREATEST(0, suggested_reorder_qty - COALESCE(pa.pending_ordered, 0)) * cogs,
        send_to_fba,
        send_to_fbn,
        send_to_fba / NULLIF(units_per_box, 0),
        send_to_fbn / NULLIF(units_per_box, 0)

    FROM allocation a
    LEFT JOIN fact_purchase_agg pa ON a.sku = pa.sku;

END;
$$ LANGUAGE plpgsql;
