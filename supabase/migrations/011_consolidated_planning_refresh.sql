-- 011_consolidated_planning_refresh.sql

DROP TABLE IF EXISTS fact_inventory_planning CASCADE;

CREATE TABLE public.fact_inventory_planning (
    sku text NOT NULL,
    category text NULL,
    sub_category text NULL,
    action_flag text NULL,
    fba_units numeric NULL,
    amazon_sv numeric NULL,
    fbn_units numeric NULL,
    noon_sv numeric NULL,
    minutes_units numeric NULL,
    minutes_sv numeric NULL,
    locad_units numeric NULL,
    locad_boxes numeric NULL,
    units_per_box numeric NULL,
    blended_sv numeric NULL,
    required_30d numeric NULL,
    stock_in_hand numeric NULL,
    shortfall numeric NULL,
    moq numeric NULL,
    amazon_coverage numeric NULL,
    noon_coverage numeric NULL,
    total_coverage numeric NULL,
    cogs numeric NULL,
    suggested_reorder_qty numeric NULL,
    already_ordered numeric NULL,
    pending_qty_to_reorder numeric NULL,
    total_reorder_cost numeric NULL,
    send_to_fba_units numeric NULL,
    send_to_fbn_units numeric NULL,
    fba_boxes numeric NULL,
    fbn_boxes numeric NULL,
    is_active boolean NULL DEFAULT true,
    loaded_at timestamp
    with
        time zone NULL DEFAULT now(),
        CONSTRAINT fact_inventory_planning_pkey PRIMARY KEY (sku)
);

GRANT ALL ON fact_inventory_planning TO authenticated;

GRANT ALL ON fact_inventory_planning TO service_role;

CREATE OR REPLACE FUNCTION refresh_fact_inventory_planning()
RETURNS void AS $$
BEGIN

    TRUNCATE TABLE fact_inventory_planning;

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
        fbn_boxes,
        is_active
    )

    WITH latest_date_per_node AS (
        SELECT node, MAX(snapshot_date) as max_date
        FROM public.inventory_snapshot
        WHERE node IN ('noon_fbn', 'Minutes')
        GROUP BY node
    ),

    latest_snapshot AS (
        SELECT
            sku,
            node,
            available,
            warehouse_name,
            snapshot_date,
            ROW_NUMBER() OVER (
                PARTITION BY sku, node, warehouse_name
                ORDER BY snapshot_date DESC
            ) AS rn
        FROM public.inventory_snapshot
        WHERE node IN ('amazon_fba', 'locad_warehouse')

        UNION ALL

        SELECT
            i.sku,
            i.node,
            i.available,
            i.warehouse_name,
            i.snapshot_date,
            1 AS rn
        FROM public.inventory_snapshot i
        JOIN latest_date_per_node l 
          ON i.node = l.node 
         AND i.snapshot_date = l.max_date
    ),

    inventory_data AS (

        SELECT
            ls.sku,

            SUM(
                CASE
                    WHEN ls.node = 'amazon_fba'
                    THEN ls.available
                    ELSE 0
                END
            ) AS fba_units,

            SUM(
                CASE
                    WHEN ls.node = 'noon_fbn'
                    THEN ls.available
                    ELSE 0
                END
            ) AS fbn_units,

            SUM(
                CASE
                    WHEN ls.node = 'Minutes'
                    THEN ls.available
                    ELSE 0
                END
            ) AS minutes_units,

            SUM(
                CASE
                    WHEN ls.node = 'locad_warehouse'
                    THEN ls.available
                    ELSE 0
                END
            ) AS locad_boxes

        FROM latest_snapshot ls
        WHERE rn = 1
        GROUP BY ls.sku
    ),

    sales_pivot AS (

        SELECT
            sku,

            SUM(
                CASE
                    WHEN channel = 'amazon'
                    THEN units_sold
                    ELSE 0
                END
            ) AS amazon_units,

            SUM(
                CASE
                    WHEN channel = 'noon'
                    THEN units_sold
                    ELSE 0
                END
            ) AS noon_units,

            SUM(
                CASE
                    WHEN channel = 'noon_minutes'
                    THEN units_sold
                    ELSE 0
                END
            ) AS minutes_sales_units

        FROM sales_snapshot
        WHERE date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY sku
    ),

    fact_purchase_agg AS (

        SELECT
            sku,

            SUM(
                COALESCE(units_ordered, 0) -
                COALESCE(units_received, 0)
            ) AS pending_ordered

        FROM fact_purchase
        WHERE LOWER(TRIM(status)) IN ('ordered', 'shipped', 'in_transit')
        GROUP BY sku
    ),

    base AS (

        SELECT
            i.sku,

            COALESCE(i.fba_units, 0) AS fba_units,
            COALESCE(i.fbn_units, 0) AS fbn_units,
            COALESCE(i.minutes_units, 0) AS minutes_units,
            COALESCE(i.locad_boxes, 0) AS locad_boxes,

            sm.category,
            sm.sub_category,
            sm.moq,
            sm.units_per_box,
            sm.cogs,
            COALESCE(sm.amazon_active, true) AS amazon_active,
            COALESCE(sm.noon_active, true) AS noon_active,

            COALESCE(i.locad_boxes, 0) * COALESCE(NULLIF(sm.units_per_box, 0), 1) AS locad_units,

            COALESCE(sp.amazon_units, 0) / 30.0 AS amazon_sv,
            COALESCE(sp.noon_units, 0) / 30.0 AS noon_sv,
            COALESCE(sp.minutes_sales_units, 0) / 30.0 AS minutes_sv,

            (
                COALESCE(sp.amazon_units, 0) +
                COALESCE(sp.noon_units, 0) +
                COALESCE(sp.minutes_sales_units, 0)
            ) / 30.0 AS blended_sv,

            COALESCE(sp.amazon_units, 0) AS amazon_required_30,
            COALESCE(sp.noon_units, 0) AS noon_required_30,
            COALESCE(sp.minutes_sales_units, 0) AS minutes_required_30,
            sm.is_active

        FROM sku_master sm
        LEFT JOIN inventory_data i ON sm.sku = i.sku
        LEFT JOIN sales_pivot sp ON sm.sku = sp.sku
    ),

    final_calc AS (

        SELECT *,

            (
                fba_units +
                fbn_units +
                minutes_units +
                locad_units
            ) AS stock_in_hand,

            (
                blended_sv *
                CASE
                    WHEN category = 'A' THEN 60
                    WHEN category = 'B' THEN 45
                    ELSE 30
                END
            ) AS dynamic_required,

            GREATEST(
                (
                    blended_sv *
                    CASE
                        WHEN category = 'A' THEN 60
                        WHEN category = 'B' THEN 45
                        ELSE 30
                    END
                ) -
                (
                    fba_units +
                    fbn_units +
                    minutes_units +
                    locad_units
                ),
                0
            ) AS shortfall,

            CASE
                WHEN amazon_sv > 0
                THEN fba_units / amazon_sv
                ELSE 0
            END AS amazon_coverage,

            CASE
                WHEN noon_sv > 0
                THEN fbn_units / noon_sv
                ELSE 0
            END AS noon_coverage,

            CASE
                WHEN blended_sv > 0
                THEN (
                    fba_units +
                    fbn_units +
                    minutes_units +
                    locad_units
                ) / blended_sv
                ELSE 0
            END AS total_coverage,

            CASE
                WHEN GREATEST(
                    (
                        blended_sv *
                        CASE
                            WHEN category = 'A' THEN 60
                            WHEN category = 'B' THEN 45
                            ELSE 30
                        END
                    ) -
                    (
                        fba_units +
                        fbn_units +
                        minutes_units +
                        locad_units
                    ),
                    0
                ) < NULLIF(units_per_box, 0)
                THEN 0
                
                -- Disable suggested reorder if SKU is inactive
                WHEN is_active = FALSE THEN 0

                ELSE GREATEST(
                    moq,

                    CEIL(
                        GREATEST(
                            (
                                blended_sv *
                                CASE
                                    WHEN category = 'A' THEN 60
                                    WHEN category = 'B' THEN 45
                                    ELSE 30
                                END
                            ) -
                            (
                                fba_units +
                                fbn_units +
                                minutes_units +
                                locad_units
                            ),
                            0
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
                WHEN fba_units <= 0
                     AND amazon_sv <= 0
                THEN 1

                WHEN fba_units < units_per_box
                     AND amazon_sv > 0
                THEN GREATEST(
                    1,
                    COALESCE(
                        CEIL(
                            GREATEST(
                                0,
                                amazon_required_30 - fba_units
                            ) / NULLIF(units_per_box, 0)
                        ),
                        0
                    )
                )

                ELSE COALESCE(
                    CEIL(
                        GREATEST(
                            0,
                            amazon_required_30 - fba_units
                        ) / NULLIF(units_per_box, 0)
                    ),
                    0
                )
            END AS fba_need_boxes,

            CASE
                WHEN noon_active = false THEN 0
                WHEN fbn_units <= 0
                     AND noon_sv <= 0
                THEN 1

                WHEN fbn_units < units_per_box
                     AND noon_sv > 0
                THEN GREATEST(
                    1,
                    COALESCE(
                        CEIL(
                            GREATEST(
                                0,
                                noon_required_30 - fbn_units
                            ) / NULLIF(units_per_box, 0)
                        ),
                        0
                    )
                )

                ELSE COALESCE(
                    CEIL(
                        GREATEST(
                            0,
                            noon_required_30 - fbn_units
                        ) / NULLIF(units_per_box, 0)
                    ),
                    0
                )
            END AS fbn_need_boxes

        FROM final_calc
    ),

    allocation AS (

        SELECT *,

            CASE 
                WHEN is_active = FALSE THEN 0 
                ELSE LEAST(locad_boxes, fba_need_boxes) * units_per_box 
            END AS send_to_fba,

            CASE 
                WHEN is_active = FALSE THEN 0 
                ELSE LEAST(GREATEST(0, locad_boxes - fba_need_boxes), fbn_need_boxes) * units_per_box 
            END AS send_to_fbn
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
        END AS action_flag,

        fba_units,
        ROUND(amazon_sv, 2),

        fbn_units,
        ROUND(noon_sv, 2),

        minutes_units,
        ROUND(minutes_sv, 2),

        locad_units,
        locad_boxes,
        units_per_box,

        ROUND(blended_sv, 2),

        ROUND(dynamic_required, 2),
        stock_in_hand,
        shortfall,
        moq,

        ROUND(amazon_coverage, 2),
        ROUND(noon_coverage, 2),
        ROUND(total_coverage, 2),

        cogs,

        suggested_reorder_qty,

        COALESCE(pa.pending_ordered, 0) AS already_ordered,

        GREATEST(
            0,
            suggested_reorder_qty - COALESCE(pa.pending_ordered, 0)
        ) AS pending_qty_to_reorder,

        GREATEST(
            0,
            suggested_reorder_qty - COALESCE(pa.pending_ordered, 0)
        ) * cogs AS total_reorder_cost,

        send_to_fba,
        send_to_fbn,

        send_to_fba / NULLIF(units_per_box, 0) AS fba_boxes,

        send_to_fbn / NULLIF(units_per_box, 0) AS fbn_boxes,
        
        is_active

    FROM allocation a
    LEFT JOIN fact_purchase_agg pa
        ON a.sku = pa.sku;

END;
$$ LANGUAGE plpgsql;

SELECT refresh_fact_inventory_planning ();

select * from fact_inventory_planning
