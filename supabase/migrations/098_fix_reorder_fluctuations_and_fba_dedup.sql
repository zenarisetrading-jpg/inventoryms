-- 098_fix_reorder_fluctuations_and_fba_dedup.sql
-- Fixes FBA duplicate counting, cross-account contamination, and reorder plan fluctuations

-- 1. Deduplicate existing inventory_snapshot rows
DELETE FROM public.inventory_snapshot i
WHERE i.id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY sku, node, COALESCE(warehouse_name, ''), snapshot_date, country, saddl_id 
            ORDER BY synced_at DESC, id DESC
        ) AS rn
        FROM public.inventory_snapshot
    ) sub
    WHERE sub.rn > 1
);

-- 2. Drop obsolete legacy constraints and create unique constraint supporting NULL warehouse_name
ALTER TABLE public.amazon_sales DROP CONSTRAINT IF EXISTS amazon_sales_report_date_child_asin_country_key;
ALTER TABLE public.inventory_snapshot DROP CONSTRAINT IF EXISTS inventory_snapshot_composite_key;
DROP INDEX IF EXISTS public.uq_inventory_snapshot_dedup;
ALTER TABLE public.inventory_snapshot ADD CONSTRAINT inventory_snapshot_composite_key 
UNIQUE NULLS NOT DISTINCT (sku, node, warehouse_name, snapshot_date, country, saddl_id);

-- 3. Clean up cross-account ghost recommendations from sku_reorder_recommendations
DELETE FROM public.sku_reorder_recommendations r
WHERE NOT EXISTS (
    SELECT 1 FROM public.sku_master sm 
    WHERE sm.sku = r.sku 
      AND sm.saddl_id = r.saddl_id
);

-- 4. Rebuild v_fact_inventory_with_age view to avoid broken global subqueries
CREATE OR REPLACE VIEW public.v_fact_inventory_with_age AS
SELECT 
    f.sku,
    f.country,
    f.saddl_id,
    f.category,
    f.sub_category,
    f.product_category,
    f.is_active,
    f.fba_units,
    f.fbn_units,
    f.minutes_units,
    f.locad_units,
    f.locad_boxes,
    f.units_per_box,
    f.amazon_sv,
    f.noon_sv,
    f.minutes_sv,
    f.blended_sv,
    f.amazon_coverage,
    f.noon_coverage,
    f.total_coverage,
    f.cogs,
    f.moq,
    f.required_30d,
    f.stock_in_hand,
    f.shortfall,
    f.suggested_reorder_qty,
    f.already_ordered,
    f.pending_qty_to_reorder,
    f.total_reorder_cost,
    f.send_to_fba_units,
    f.send_to_fbn_units,
    f.send_to_minutes_units,
    f.fba_boxes,
    f.fbn_boxes,
    f.minutes_boxes,
    f.priority_rank,
    f.allocation_reason,
    f.action_flag,
    f.loaded_at,
    f.sales_yesterday,
    COALESCE(f.fba_age_0_60_days, 0::bigint) AS fba_age_0_60_days,
    COALESCE(f.fba_age_61_90_days, 0::bigint) AS fba_age_61_90_days,
    COALESCE(f.fba_age_91_180_days, 0::bigint) AS fba_age_91_180_days,
    COALESCE(f.fba_age_181_plus_days, 0::bigint) AS fba_age_181_plus_days,
    COALESCE(f.fba_age_0_60_days, 0::bigint) AS age_0_60_days,
    COALESCE(f.fba_age_61_90_days, 0::bigint) AS age_61_90_days,
    COALESCE(f.fba_age_91_180_days, 0::bigint) AS age_91_180_days,
    COALESCE(f.fba_age_181_plus_days, 0::bigint) AS age_181_plus_days,
    f.fbm_units,
    f.fulfillment_mode
FROM public.fact_inventory_planning f;

-- 5. Updated refresh_fact_inventory_planning() function with deduplication and account-scoping
CREATE OR REPLACE FUNCTION public.refresh_fact_inventory_planning()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  loc RECORD;
  today_date DATE;
BEGIN
  today_date := (now() AT TIME ZONE 'Asia/Dubai')::date;

  FOR loc IN SELECT country, saddl_account_id FROM amazon_locations WHERE is_active = true
  LOOP
    DELETE FROM fact_inventory_planning 
    WHERE country = loc.country 
      AND saddl_id = loc.saddl_account_id;

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
        is_active, allocation_reason, priority_rank, send_to_minutes_units, minutes_boxes,
        sales_yesterday,
        fba_age_0_60_days, fba_age_61_90_days, fba_age_91_180_days, fba_age_181_plus_days,
        fbm_units, fulfillment_mode
    )
    WITH latest_date_per_node AS (
        SELECT node, MAX(snapshot_date) as max_date
        FROM public.inventory_snapshot
        WHERE node IN ('amazon_fba', 'amazon_fbm', 'locad_warehouse', 'noon_fbn', 'Minutes')
          AND country = loc.country
          AND saddl_id = loc.saddl_account_id
        GROUP BY node
    ),

    latest_snapshot AS (
        SELECT DISTINCT ON (i.sku, i.node, COALESCE(i.warehouse_name, ''))
            i.sku, i.node, i.available, i.warehouse_name, i.snapshot_date, 1 AS rn
        FROM public.inventory_snapshot i
        JOIN latest_date_per_node l 
          ON i.node = l.node 
         AND i.snapshot_date = l.max_date
        WHERE i.country = loc.country
          AND i.saddl_id = loc.saddl_account_id
        ORDER BY i.sku, i.node, COALESCE(i.warehouse_name, ''), i.synced_at DESC
    ),

    inventory_age_pivot AS (
        SELECT 
            sku,
            SUM(CASE WHEN bucket = '0-60' THEN item_count ELSE 0 END)::bigint AS fba_age_0_60_days,
            SUM(CASE WHEN bucket = '61-90' THEN item_count ELSE 0 END)::bigint AS fba_age_61_90_days,
            SUM(CASE WHEN bucket = '91-180' THEN item_count ELSE 0 END)::bigint AS fba_age_91_180_days,
            SUM(CASE WHEN bucket = '181+' THEN item_count ELSE 0 END)::bigint AS fba_age_181_plus_days
        FROM public.inventory_age
        WHERE account_id = loc.saddl_account_id
          AND report_date = (SELECT MAX(report_date) FROM public.inventory_age WHERE account_id = loc.saddl_account_id)
        GROUP BY sku
    ),

    inventory_data AS (
        SELECT ls.sku,
          SUM(CASE WHEN ls.node = 'amazon_fba' THEN ls.available ELSE 0 END) AS fba_units,
          SUM(CASE WHEN ls.node = 'amazon_fbm' THEN ls.available ELSE 0 END) AS fbm_units,
          SUM(CASE WHEN ls.node = 'noon_fbn' THEN ls.available ELSE 0 END) AS fbn_units,
          SUM(CASE WHEN ls.node = 'Minutes' THEN ls.available ELSE 0 END) AS minutes_units,
          SUM(CASE WHEN ls.node = 'locad_warehouse' THEN ls.available ELSE 0 END) AS locad_boxes
        FROM latest_snapshot ls
        GROUP BY ls.sku
    ),

    sales_pivot AS (
        SELECT sku,
          SUM(CASE WHEN channel = 'amazon' THEN units_sold ELSE 0 END) AS amazon_units,
          SUM(CASE WHEN channel = 'noon' THEN units_sold ELSE 0 END) AS noon_units,
          SUM(CASE WHEN channel = 'noon_minutes' THEN units_sold ELSE 0 END) AS minutes_sales_units,
          SUM(CASE WHEN date = today_date - INTERVAL '1 day' THEN units_sold ELSE 0 END) AS sales_yesterday
        FROM sales_snapshot
        WHERE date >= today_date - INTERVAL '30 days'
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
          COALESCE(i.fbm_units, 0) AS fbm_units,
          COALESCE(sm.fulfillment_mode, 'FBA') AS fulfillment_mode,
          COALESCE(i.fbn_units, 0) AS fbn_units,
          COALESCE(i.minutes_units, 0) AS minutes_units,
          COALESCE(i.locad_boxes, 0) * COALESCE(NULLIF(sm.units_per_box, 0), 1) AS locad_units,
          COALESCE(i.locad_boxes, 0) AS locad_boxes,
          COALESCE(NULLIF(sm.units_per_box, 0), 1) AS units_per_box,
          COALESCE(sp.amazon_units, 0) / 30.0 AS amazon_sv,
          COALESCE(sp.noon_units, 0) / 30.0 AS noon_sv,
          COALESCE(sp.minutes_sales_units, 0) / 30.0 AS minutes_sv,
          (COALESCE(sp.amazon_units, 0) + COALESCE(sp.noon_units, 0) + COALESCE(sp.minutes_sales_units, 0)) / 30.0 AS blended_sv,
          COALESCE(sp.amazon_units, 0) AS amazon_required_30,
          COALESCE(sp.noon_units, 0) AS noon_required_30,
          COALESCE(sp.minutes_sales_units, 0) AS minutes_required_30,
          COALESCE(sp.sales_yesterday, 0) AS sales_yesterday,
          sm.is_active,
          COALESCE(iap.fba_age_0_60_days, 0)::bigint AS fba_age_0_60_days,
          COALESCE(iap.fba_age_61_90_days, 0)::bigint AS fba_age_61_90_days,
          COALESCE(iap.fba_age_91_180_days, 0)::bigint AS fba_age_91_180_days,
          COALESCE(iap.fba_age_181_plus_days, 0)::bigint AS fba_age_181_plus_days,
          sm.category,
          sm.sub_category,
          sm.product_category,
          COALESCE(sm.cogs, 0) AS cogs,
          COALESCE(sm.moq, 0) AS moq
        FROM sku_master sm
        LEFT JOIN inventory_data i ON sm.sku = i.sku
        LEFT JOIN sales_pivot sp ON sm.sku = sp.sku
        LEFT JOIN inventory_age_pivot iap ON sm.sku = iap.sku
        WHERE sm.country = loc.country
          AND sm.saddl_id = loc.saddl_account_id
    ),

    calculations AS (
        SELECT b.*,
          (b.fba_units + b.fbn_units + b.minutes_units + b.locad_units + CASE WHEN b.fulfillment_mode = 'FBM' THEN b.fbm_units ELSE 0 END) AS stock_in_hand,
          CASE 
            WHEN UPPER(TRIM(b.category)) = 'A' THEN b.blended_sv * 60.0
            WHEN UPPER(TRIM(b.category)) = 'B' THEN b.blended_sv * 45.0
            WHEN UPPER(TRIM(b.category)) = 'C' THEN b.blended_sv * 30.0
            ELSE b.blended_sv * 30.0
          END AS dynamic_required,
          CASE 
            WHEN UPPER(TRIM(b.category)) = 'A' THEN 60.0
            WHEN UPPER(TRIM(b.category)) = 'B' THEN 45.0
            WHEN UPPER(TRIM(b.category)) = 'C' THEN 30.0
            ELSE 30.0
          END AS target_days
        FROM base b
    ),

    shortfall_calc AS (
        SELECT c.*,
          GREATEST(c.dynamic_required - c.stock_in_hand, 0) AS shortfall,
          CASE WHEN c.amazon_sv > 0 THEN c.fba_units / c.amazon_sv ELSE 999.0 END AS amazon_coverage,
          CASE WHEN c.noon_sv > 0 THEN c.fbn_units / c.noon_sv ELSE 999.0 END AS noon_coverage,
          CASE WHEN c.blended_sv > 0 THEN c.stock_in_hand / c.blended_sv ELSE 999.0 END AS total_coverage
        FROM calculations c
    ),

    final_calc AS (
        SELECT s.*,
          CASE 
            WHEN s.shortfall <= 0 THEN 0
            WHEN s.moq > 0 AND s.shortfall < (0.5 * s.moq) THEN 0
            ELSE CEIL(GREATEST(s.shortfall, s.moq) / s.units_per_box) * s.units_per_box
          END AS suggested_reorder_qty
        FROM shortfall_calc s
    ),

    allocation_step1 AS (
        SELECT final_calc.*,
          CASE
            WHEN fba_units = 0 AND locad_units > 0 AND amazon_sv > 0 THEN 
                CEIL((amazon_sv * 30.0) / NULLIF(units_per_box, 0))
            ELSE 
                COALESCE(NULLIF(GREATEST(CEIL((amazon_sv * 30.0 - fba_units) / NULLIF(units_per_box, 0)), 0), 0),
                CASE WHEN amazon_coverage < 14 AND amazon_sv > 0 THEN 1 ELSE 0 END)
          END AS fba_need_boxes,
          
          CASE
            WHEN fbn_units = 0 AND locad_units > 0 AND noon_sv > 0 THEN 
                CEIL((noon_sv * 30.0) / NULLIF(units_per_box, 0))
            ELSE 
                COALESCE(NULLIF(GREATEST(CEIL((noon_sv * 30.0 - fbn_units) / NULLIF(units_per_box, 0)), 0), 0),
                CASE WHEN noon_coverage < 14 AND noon_sv > 0 THEN 1 ELSE 0 END)
          END AS fbn_need_boxes,

          CASE
            WHEN minutes_units = 0 AND locad_units > 0 AND minutes_sv > 0 THEN 
                CEIL((minutes_sv * 30.0) / NULLIF(units_per_box, 0))
            ELSE 
                COALESCE(GREATEST(CEIL((minutes_sv * 30.0 - minutes_units) / NULLIF(units_per_box, 0)), 0), 0)
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
        a.minutes_boxes_alloc AS minutes_boxes,
        a.sales_yesterday,
        a.fba_age_0_60_days, a.fba_age_61_90_days, a.fba_age_91_180_days, a.fba_age_181_plus_days,
        a.fbm_units, a.fulfillment_mode
    FROM allocation_step2 a
    LEFT JOIN fact_purchase_agg p ON a.sku = p.sku;

  END LOOP;
END;
$function$;

