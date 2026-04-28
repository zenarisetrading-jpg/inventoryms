-- Migration: Create fact_inventory_planning table and refresh function

DROP TABLE IF EXISTS fact_inventory_planning CASCADE;

CREATE TABLE fact_inventory_planning (
    sku TEXT PRIMARY KEY,
    category TEXT,
    sub_category TEXT,
    action_flag TEXT,

    fba_units NUMERIC,
    amazon_sv NUMERIC,
    fbn_units NUMERIC,
    noon_sv NUMERIC,

    locad_units NUMERIC,
    locad_boxes NUMERIC,
    units_per_box NUMERIC,

    blended_sv NUMERIC,
    required_30d NUMERIC,
    stock_in_hand NUMERIC,
    shortfall NUMERIC,
    moq NUMERIC,

    amazon_coverage NUMERIC,
    noon_coverage NUMERIC,
    total_coverage NUMERIC,

    cogs NUMERIC,

    suggested_reorder_qty NUMERIC,
    already_ordered NUMERIC,
    pending_qty_to_reorder NUMERIC,
    total_reorder_cost NUMERIC,

    send_to_fba_units NUMERIC,
    send_to_fbn_units NUMERIC,

    fba_boxes NUMERIC,
    fbn_boxes NUMERIC,

    loaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grant access to authenticated and service_role
GRANT ALL ON fact_inventory_planning TO authenticated;
GRANT ALL ON fact_inventory_planning TO service_role;

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
        fbn_boxes,

        loaded_at
    )
    WITH latest_snapshot AS (
        SELECT 
            sku,
            node,
            available,
            ROW_NUMBER() OVER (PARTITION BY sku, node ORDER BY synced_at DESC) AS rn
        FROM inventory_snapshot
    ),

    inventory_data AS (
        SELECT 
            ls.sku,
            SUM(CASE WHEN ls.node = 'amazon_fba' THEN ls.available ELSE 0 END) AS fba_units,
            SUM(CASE WHEN ls.node = 'noon_fbn' THEN ls.available ELSE 0 END) AS fbn_units,
            SUM(CASE WHEN ls.node = 'locad_warehouse' THEN ls.available ELSE 0 END) AS locad_boxes
        FROM latest_snapshot ls
        WHERE rn = 1
        GROUP BY ls.sku
    ),

    sales_pivot AS (
        SELECT
            sku,
            SUM(CASE WHEN channel='amazon' THEN units_sold ELSE 0 END) AS amazon_units,
            SUM(CASE WHEN channel='noon' THEN units_sold ELSE 0 END) AS noon_units
        FROM sales_snapshot
        WHERE date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY sku
    ),

    po_agg AS (
        SELECT 
            sku,
            SUM(units_ordered) AS units_ordered
        FROM fact_purchase
        WHERE status != 'closed'
        GROUP BY sku
    ),

    base AS (
        SELECT 
            i.sku,

            COALESCE(i.fba_units,0) AS fba_units,
            COALESCE(i.fbn_units,0) AS fbn_units,
            COALESCE(i.locad_boxes,0) AS locad_boxes,

            sm.category,
            sm.sub_category,
            sm.moq,
            sm.units_per_box,
            sm.cogs,

            COALESCE(i.locad_boxes,0) * sm.units_per_box AS locad_units,

            COALESCE(sp.amazon_units,0)/30.0 AS amazon_sv,
            COALESCE(sp.noon_units,0)/30.0 AS noon_sv,

            (COALESCE(sp.amazon_units,0)+COALESCE(sp.noon_units,0))/30.0 AS blended_sv,

            COALESCE(sp.amazon_units,0) AS amazon_required_30,
            COALESCE(sp.noon_units,0) AS noon_required_30

        FROM inventory_data i
        INNER JOIN sku_master sm 
            ON i.sku = sm.sku AND sm.is_active = TRUE
        LEFT JOIN sales_pivot sp 
            ON i.sku = sp.sku
    ),

    final_calc AS (
        SELECT *,

            (fba_units + fbn_units + locad_units) AS stock_in_hand,

            GREATEST(
                (amazon_required_30 + noon_required_30) 
                - (fba_units + fbn_units + locad_units),
            0) AS shortfall,

            CASE WHEN amazon_sv > 0 THEN fba_units / amazon_sv ELSE 0 END AS amazon_coverage,
            CASE WHEN noon_sv > 0 THEN fbn_units / noon_sv ELSE 0 END AS noon_coverage,
            CASE WHEN blended_sv > 0 THEN (fba_units + fbn_units + locad_units) / blended_sv ELSE 0 END AS total_coverage,

            CASE 
                WHEN blended_sv = 0 THEN 0
                ELSE GREATEST(
                    moq,
                    CEIL((blended_sv * 50) / NULLIF(units_per_box, 0)) * units_per_box
                )
            END AS suggested_reorder_qty

        FROM base
    ),

    allocation AS (
        SELECT *,

        CASE 
            WHEN amazon_sv = 0 AND fba_units > 0 THEN 0
            WHEN locad_units >= amazon_required_30
            THEN CEIL(amazon_required_30 / NULLIF(units_per_box, 0)) * units_per_box
            ELSE CEIL(locad_units / NULLIF(units_per_box, 0)) * units_per_box
        END AS send_to_fba,

        CASE 
            WHEN amazon_sv = 0 THEN
                CASE 
                    WHEN noon_sv > 0 AND fbn_units < noon_required_30
                    THEN CEIL((noon_required_30 - fbn_units) / NULLIF(units_per_box, 0)) * units_per_box
                    ELSE 0
                END
            WHEN locad_units >= (amazon_required_30 + noon_required_30)
            THEN CEIL(noon_required_30 / NULLIF(units_per_box, 0)) * units_per_box
            WHEN locad_units > amazon_required_30
            THEN CEIL((locad_units - amazon_required_30) / NULLIF(units_per_box, 0)) * units_per_box
            ELSE 0
        END AS send_to_fbn

        FROM final_calc
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

        locad_units,
        locad_boxes,
        units_per_box,

        ROUND(blended_sv,2),

        (amazon_required_30 + noon_required_30),
        stock_in_hand,
        shortfall,
        moq,

        ROUND(amazon_coverage,2),
        ROUND(noon_coverage,2),
        ROUND(total_coverage,2),

        cogs,

        suggested_reorder_qty,

        COALESCE(p.units_ordered, 0) AS already_ordered,
        GREATEST(suggested_reorder_qty - COALESCE(p.units_ordered, 0), 0) AS pending_qty_to_reorder,

        ROUND(GREATEST(suggested_reorder_qty - COALESCE(p.units_ordered, 0), 0) * cogs, 2) AS total_reorder_cost,

        send_to_fba,
        send_to_fbn,

        (send_to_fba / NULLIF(units_per_box, 0)),
        (send_to_fbn / NULLIF(units_per_box, 0)),

        NOW()

    FROM allocation a
    LEFT JOIN po_agg p 
        ON a.sku = p.sku;

END;
$$ LANGUAGE plpgsql;
