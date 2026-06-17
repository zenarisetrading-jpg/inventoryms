-- 078_new_allocation_logic.sql

-- 1. Add tracking columns and minutes columns
ALTER TABLE public.fact_inventory_planning ADD COLUMN IF NOT EXISTS allocation_reason text;
ALTER TABLE public.fact_inventory_planning ADD COLUMN IF NOT EXISTS priority_rank text;
ALTER TABLE public.fact_inventory_planning ADD COLUMN IF NOT EXISTS send_to_minutes_units numeric;
ALTER TABLE public.fact_inventory_planning ADD COLUMN IF NOT EXISTS minutes_boxes numeric;

-- 2. Update the refresh function
CREATE OR REPLACE FUNCTION refresh_fact_inventory_planning()
RETURNS void AS $$
DECLARE
  loc RECORD;
BEGIN
  -- Truncate the whole table then rebuild per-location
  TRUNCATE TABLE fact_inventory_planning;

  -- Loop through each active location
  FOR loc IN SELECT country, saddl_account_id FROM amazon_locations WHERE is_active = true
  LOOP
    INSERT INTO fact_inventory_planning (
        sku, country, saddl_id, category, sub_category, product_category, action_flag,
        fba_units, amazon_sv,
        fbn_units, noon_sv,
        minutes_units, minutes_sv,
        locad_units, locad_boxes, units_per_box,
        blended_sv, required_30d, stock_in_hand, shortfall, moq,
        amazon_coverage, noon_coverage, total_coverage,
        cogs,
        suggested_reorder_qty, already_ordered, pending_qty_to_reorder, total_reorder_cost,
        send_to_fba_units, send_to_fbn_units, fba_boxes, fbn_boxes,
        is_active, allocation_reason, priority_rank, send_to_minutes_units, minutes_boxes
    )

    WITH latest_date_per_node AS (
        SELECT node, MAX(snapshot_date) as max_date
        FROM public.inventory_snapshot
        WHERE node IN ('noon_fbn', 'Minutes')
          AND country = loc.country
          AND saddl_id = loc.saddl_account_id
        GROUP BY node
    ),

    latest_snapshot AS (
        SELECT sku, node, available, warehouse_name, snapshot_date,
               ROW_NUMBER() OVER (PARTITION BY sku, node, warehouse_name ORDER BY snapshot_date DESC) AS rn
        FROM public.inventory_snapshot
        WHERE node IN ('amazon_fba', 'locad_warehouse')
          AND country = loc.country
          AND saddl_id = loc.saddl_account_id

        UNION ALL

        SELECT i.sku, i.node, i.available, i.warehouse_name, i.snapshot_date, 1 AS rn
        FROM public.inventory_snapshot i
        JOIN latest_date_per_node l ON i.node = l.node AND i.snapshot_date = l.max_date
        WHERE i.country = loc.country
          AND i.saddl_id = loc.saddl_account_id
    ),

    inventory_data AS (
        SELECT ls.sku,
          SUM(CASE WHEN ls.node = 'amazon_fba' THEN ls.available ELSE 0 END) AS fba_units,
          SUM(CASE WHEN ls.node = 'noon_fbn' THEN ls.available ELSE 0 END) AS fbn_units,
          SUM(CASE WHEN ls.node = 'Minutes' THEN ls.available ELSE 0 END) AS minutes_units,
          SUM(CASE WHEN ls.node = 'locad_warehouse' THEN ls.available ELSE 0 END) AS locad_boxes
        FROM latest_snapshot ls
        WHERE rn = 1
        GROUP BY ls.sku
    ),

    sales_pivot AS (
        SELECT sku,
          SUM(CASE WHEN channel = 'amazon' THEN units_sold ELSE 0 END) AS amazon_units,
          SUM(CASE WHEN channel = 'noon' THEN units_sold ELSE 0 END) AS noon_units,
          SUM(CASE WHEN channel = 'noon_minutes' THEN units_sold ELSE 0 END) AS minutes_sales_units
        FROM sales_snapshot
        WHERE date >= CURRENT_DATE - INTERVAL '30 days'
          AND country = loc.country
          AND saddl_id = loc.saddl_account_id
        GROUP BY sku
    ),

    fact_purchase_agg AS (
        SELECT sku,
          SUM(COALESCE(units_ordered, 0) - COALESCE(units_received, 0)) AS pending_ordered
        FROM fact_purchase
        WHERE LOWER(TRIM(status)) IN ('ordered', 'shipped', 'in_transit')
          AND COALESCE(country, 'UAE') = loc.country
          AND saddl_id = loc.saddl_account_id
        GROUP BY sku
    ),

    base AS (
        SELECT sm.sku,
          COALESCE(i.fba_units, 0) AS fba_units,
          COALESCE(i.fbn_units, 0) AS fbn_units,
          COALESCE(i.minutes_units, 0) AS minutes_units,
          COALESCE(i.locad_boxes, 0) AS locad_boxes,
          sm.category, sm.sub_category, sm.product_category,
          sm.moq, sm.units_per_box, sm.cogs,
          COALESCE(sm.amazon_active, true) AS amazon_active,
          COALESCE(sm.noon_active, true) AS noon_active,
          (COALESCE(i.minutes_units, 0) > 0 OR COALESCE(sp.minutes_sales_units, 0) > 0) AS minutes_active,
          COALESCE(i.locad_boxes, 0) * COALESCE(NULLIF(sm.units_per_box, 0), 1) AS locad_units,
          COALESCE(sp.amazon_units, 0) / 30.0 AS amazon_sv,
          COALESCE(sp.noon_units, 0) / 30.0 AS noon_sv,
          COALESCE(sp.minutes_sales_units, 0) / 30.0 AS minutes_sv,
          (COALESCE(sp.amazon_units, 0) + COALESCE(sp.noon_units, 0) + COALESCE(sp.minutes_sales_units, 0)) / 30.0 AS blended_sv,
          COALESCE(sp.amazon_units, 0) AS amazon_required_30,
          COALESCE(sp.noon_units, 0) AS noon_required_30,
          COALESCE(sp.minutes_sales_units, 0) AS minutes_required_30,
          sm.is_active
        FROM sku_master sm
        LEFT JOIN inventory_data i ON sm.sku = i.sku
        LEFT JOIN sales_pivot sp ON sm.sku = sp.sku
        WHERE sm.country = loc.country
          AND sm.saddl_id = loc.saddl_account_id
    ),

    final_calc AS (
        SELECT *,
          (fba_units + fbn_units + minutes_units + locad_units) AS stock_in_hand,
          (blended_sv * CASE WHEN category = 'A' THEN 60 WHEN category = 'B' THEN 45 ELSE 30 END) AS dynamic_required,
          GREATEST(
            (blended_sv * CASE WHEN category = 'A' THEN 60 WHEN category = 'B' THEN 45 ELSE 30 END) -
            (fba_units + fbn_units + minutes_units + locad_units), 0
          ) AS shortfall,
          CASE WHEN amazon_sv > 0 THEN fba_units / amazon_sv ELSE 0 END AS amazon_coverage,
          CASE WHEN noon_sv > 0 THEN fbn_units / noon_sv ELSE 0 END AS noon_coverage,
          CASE WHEN blended_sv > 0 THEN (fba_units + fbn_units + minutes_units + locad_units) / blended_sv ELSE 0 END AS total_coverage,
          CASE
            WHEN GREATEST(
              (blended_sv * CASE WHEN category = 'A' THEN 60 WHEN category = 'B' THEN 45 ELSE 30 END) -
              (fba_units + fbn_units + minutes_units + locad_units), 0
            ) < NULLIF(units_per_box, 0) THEN 0
            WHEN is_active = FALSE THEN 0
            ELSE GREATEST(
              moq,
              CEIL(
                GREATEST(
                  (blended_sv * CASE WHEN category = 'A' THEN 60 WHEN category = 'B' THEN 45 ELSE 30 END) -
                  (fba_units + fbn_units + minutes_units + locad_units), 0
                ) / NULLIF(units_per_box, 0)
              ) * units_per_box
            )
          END AS suggested_reorder_qty
        FROM base
    ),

    allocation_step1 AS (
        SELECT *,
          CASE
            WHEN amazon_active = false THEN 0
            WHEN fba_units <= 0 AND amazon_sv <= 0 THEN 1
            WHEN fba_units < units_per_box AND amazon_sv > 0 THEN
              GREATEST(1, COALESCE(CEIL(GREATEST(0, amazon_required_30 - fba_units) / NULLIF(units_per_box, 0)), 0))
            ELSE COALESCE(CEIL(GREATEST(0, amazon_required_30 - fba_units) / NULLIF(units_per_box, 0)), 0)
          END AS fba_need_boxes,
          CASE
            WHEN noon_active = false THEN 0
            WHEN fbn_units <= 0 AND noon_sv <= 0 THEN 1
            WHEN fbn_units < units_per_box AND noon_sv > 0 THEN
              GREATEST(1, COALESCE(CEIL(GREATEST(0, noon_required_30 - fbn_units) / NULLIF(units_per_box, 0)), 0))
            ELSE COALESCE(CEIL(GREATEST(0, noon_required_30 - fbn_units) / NULLIF(units_per_box, 0)), 0)
          END AS fbn_need_boxes,
          CASE
            WHEN minutes_active = false THEN 0
            WHEN minutes_units <= 0 AND minutes_sv <= 0 THEN 1
            WHEN minutes_units < units_per_box AND minutes_sv > 0 THEN
              GREATEST(1, COALESCE(CEIL(GREATEST(0, minutes_required_30 - minutes_units) / NULLIF(units_per_box, 0)), 0))
            ELSE COALESCE(CEIL(GREATEST(0, minutes_required_30 - minutes_units) / NULLIF(units_per_box, 0)), 0)
          END AS minutes_need_boxes
        FROM final_calc
    ),

    allocation_step2 AS (
        SELECT a1.*, alloc.*
        FROM allocation_step1 a1,
        LATERAL (
            SELECT 
                names[1] AS r1_name, needs[1] AS r1_need,
                names[2] AS r2_name, needs[2] AS r2_need,
                names[3] AS r3_name, needs[3] AS r3_need,
                
                LEAST(needs[1], a1.locad_boxes) AS r1_alloc,
                LEAST(needs[2], GREATEST(0, a1.locad_boxes - LEAST(needs[1], a1.locad_boxes))) AS r2_alloc,
                LEAST(needs[3], GREATEST(0, a1.locad_boxes - LEAST(needs[1], a1.locad_boxes) - LEAST(needs[2], GREATEST(0, a1.locad_boxes - LEAST(needs[1], a1.locad_boxes))))) AS r3_alloc
            FROM (
                SELECT 
                    ARRAY_AGG(ch_name ORDER BY ch_sv DESC, ch_name ASC) as names,
                    ARRAY_AGG(ch_need ORDER BY ch_sv DESC, ch_name ASC) as needs
                FROM (
                    VALUES 
                        ('Amazon', COALESCE(a1.amazon_sv, 0), COALESCE(a1.fba_need_boxes, 0)),
                        ('Noon', COALESCE(a1.noon_sv, 0), COALESCE(a1.fbn_need_boxes, 0)),
                        ('Minutes', COALESCE(a1.minutes_sv, 0), COALESCE(a1.minutes_need_boxes, 0))
                ) AS v(ch_name, ch_sv, ch_need)
            ) agg
        ) ac,
        LATERAL (
            SELECT 
                CASE WHEN ac.r1_name = 'Amazon' THEN ac.r1_alloc 
                     WHEN ac.r2_name = 'Amazon' THEN ac.r2_alloc 
                     ELSE ac.r3_alloc END AS fba_boxes_alloc,
                CASE WHEN ac.r1_name = 'Noon' THEN ac.r1_alloc 
                     WHEN ac.r2_name = 'Noon' THEN ac.r2_alloc 
                     ELSE ac.r3_alloc END AS fbn_boxes_alloc,
                CASE WHEN ac.r1_name = 'Minutes' THEN ac.r1_alloc 
                     WHEN ac.r2_name = 'Minutes' THEN ac.r2_alloc 
                     ELSE ac.r3_alloc END AS minutes_boxes_alloc,
                
                ac.r1_name || ' > ' || ac.r2_name || ' > ' || ac.r3_name AS final_priority_rank,
                
                'Allocated ' || ac.r1_alloc || ' to ' || ac.r1_name || ' (Rank 1), ' ||
                ac.r2_alloc || ' to ' || ac.r2_name || ' (Rank 2), ' ||
                ac.r3_alloc || ' to ' || ac.r3_name || ' (Rank 3)' AS final_allocation_reason
        ) alloc
    )

    SELECT 
        a.sku, 
        loc.country,
        loc.saddl_account_id,
        a.category, 
        a.sub_category,
        a.product_category,
        CASE
            WHEN a.total_coverage < 14 AND a.blended_sv > 0 THEN 'CRITICAL_OOS_RISK'
            WHEN a.total_coverage < 30 AND a.blended_sv > 0 THEN 'OOS_RISK'
            WHEN a.suggested_reorder_qty > 0 THEN 'REORDER_NOW'
            WHEN a.total_coverage > 90 THEN 'OVERSTOCKED'
            ELSE 'OK'
        END AS action_flag,
        a.fba_units, a.amazon_sv,
        a.fbn_units, a.noon_sv,
        a.minutes_units, a.minutes_sv,
        a.locad_units, a.locad_boxes, COALESCE(NULLIF(a.units_per_box, 0), 1),
        a.blended_sv, a.dynamic_required, a.stock_in_hand, a.shortfall, a.moq,
        a.amazon_coverage, a.noon_coverage, a.total_coverage,
        a.cogs,
        a.suggested_reorder_qty,
        COALESCE(p.pending_ordered, 0) AS already_ordered,
        GREATEST(a.suggested_reorder_qty - COALESCE(p.pending_ordered, 0), 0) AS pending_qty_to_reorder,
        GREATEST(a.suggested_reorder_qty - COALESCE(p.pending_ordered, 0), 0) * a.cogs AS total_reorder_cost,
        a.fba_boxes_alloc * COALESCE(NULLIF(a.units_per_box, 0), 1) AS send_to_fba_units,
        a.fbn_boxes_alloc * COALESCE(NULLIF(a.units_per_box, 0), 1) AS send_to_fbn_units,
        a.fba_boxes_alloc AS fba_boxes,
        a.fbn_boxes_alloc AS fbn_boxes,
        a.is_active,
        a.final_allocation_reason AS allocation_reason,
        a.final_priority_rank AS priority_rank,
        a.minutes_boxes_alloc * COALESCE(NULLIF(a.units_per_box, 0), 1) AS send_to_minutes_units,
        a.minutes_boxes_alloc AS minutes_boxes
    FROM allocation_step2 a
    LEFT JOIN fact_purchase_agg p ON a.sku = p.sku;

  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 3. Execute the refresh function
SELECT refresh_fact_inventory_planning();
