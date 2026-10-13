-- Migration 092: SADDL SKU Availability, OOS & Reorder Intelligence Engine
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_sku_intelligence(
    p_country TEXT DEFAULT 'UAE',
    p_saddl_id TEXT DEFAULT 's2c_uae_test'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result json;
    v_target_country TEXT := COALESCE(NULLIF(p_country, ''), 'UAE');
    v_target_saddl_id TEXT := COALESCE(NULLIF(p_saddl_id, ''), 's2c_uae_test');
BEGIN
    WITH 
    -- 1. Aggregate historical sales across multi-period windows for all SKUs
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
            BOOL_OR(date < CURRENT_DATE - INTERVAL '120 days' AND units_sold > 0) AS has_sales_before_120d
        FROM public.sales_snapshot
        WHERE country = v_target_country AND saddl_id = v_target_saddl_id
        GROUP BY sku
    ),

    -- 2. Aggregate confirmed pending purchase orders from fact_purchase
    po_agg AS (
        SELECT 
            sku,
            SUM(GREATEST(0, COALESCE(units_ordered, 0) - COALESCE(units_received, 0))) AS pending_ordered_units,
            MIN(CASE WHEN LOWER(TRIM(status)) IN ('ordered', 'shipped', 'in_transit') AND eta >= CURRENT_DATE THEN eta ELSE NULL END) AS earliest_eta
        FROM public.fact_purchase
        WHERE LOWER(TRIM(status)) IN ('ordered', 'shipped', 'in_transit', 'placed')
          AND COALESCE(country, 'UAE') = v_target_country
          AND saddl_id = v_target_saddl_id
        GROUP BY sku
    ),

    -- 3. Get latest inventory snapshots for reserved, inbound, and freshness
    latest_snap_date AS (
        SELECT MAX(snapshot_date) as max_date
        FROM public.inventory_snapshot
        WHERE country = v_target_country AND saddl_id = v_target_saddl_id
    ),
    snap_agg AS (
        SELECT 
            i.sku,
            SUM(CASE WHEN i.node = 'amazon_fba' THEN COALESCE(i.reserved, 0) ELSE 0 END) AS fba_reserved,
            SUM(CASE WHEN i.node = 'amazon_fba' THEN COALESCE(i.inbound, 0) ELSE 0 END) AS fba_inbound,
            SUM(COALESCE(i.reserved, 0)) AS total_reserved,
            SUM(COALESCE(i.inbound, 0)) AS total_inbound,
            MAX(i.synced_at) AS last_inventory_sync
        FROM public.inventory_snapshot i
        JOIN latest_snap_date lsd ON i.snapshot_date = lsd.max_date
        WHERE i.country = v_target_country AND i.saddl_id = v_target_saddl_id
        GROUP BY i.sku
    ),

    -- 4. Combine with sku_master and fact_inventory_planning
    base AS (
        SELECT 
            sm.sku,
            sm.name,
            sm.asin,
            sm.fnsku,
            COALESCE(sm.category, fip.category, 'C') AS category,
            COALESCE(sm.product_category, fip.product_category, 'General') AS product_category,
            COALESCE(sm.sub_category, fip.sub_category, '') AS sub_category,
            sm.country,
            sm.saddl_id,
            COALESCE(sm.is_active, true) AS is_active,
            COALESCE(sm.amazon_active, true) AS amazon_active,
            COALESCE(sm.noon_active, false) AS noon_active,
            COALESCE(sm.minutes_active, false) AS minutes_active,
            COALESCE(sm.moq, fip.moq, 0) AS moq,
            COALESCE(sm.lead_time_days, 45) AS lead_time_days,
            COALESCE(sm.cogs, fip.cogs, 0) AS cogs,
            COALESCE(sm.units_per_box, fip.units_per_box, 1) AS units_per_box,

            -- Quantities from verified fact_inventory_planning
            COALESCE(fip.fba_units, 0)::numeric AS fba_available,
            COALESCE(fip.fbn_units, 0)::numeric AS fbn_available,
            COALESCE(fip.minutes_units, 0)::numeric AS minutes_available,
            COALESCE(fip.locad_units, 0)::numeric AS locad_available,
            COALESCE(fip.locad_boxes, 0)::numeric AS locad_boxes,
            COALESCE(fip.stock_in_hand, 0)::numeric AS total_available,

            -- Reserved & Inbound
            COALESCE(sna.fba_reserved, 0)::numeric AS fba_reserved,
            COALESCE(sna.fba_inbound, 0)::numeric AS fba_inbound,
            COALESCE(sna.total_reserved, 0)::numeric AS total_reserved,
            COALESCE(sna.total_inbound, 0)::numeric AS total_inbound,
            sna.last_inventory_sync,

            -- Planning velocities & coverage
            COALESCE(fip.amazon_sv, 0)::numeric AS amazon_sv,
            COALESCE(fip.noon_sv, 0)::numeric AS noon_sv,
            COALESCE(fip.minutes_sv, 0)::numeric AS minutes_sv,
            COALESCE(fip.blended_sv, 0)::numeric AS blended_sv,
            COALESCE(fip.amazon_coverage, 0)::numeric AS amazon_coverage,
            COALESCE(fip.noon_coverage, 0)::numeric AS noon_coverage,
            COALESCE(fip.total_coverage, 0)::numeric AS total_coverage,
            COALESCE(fip.suggested_reorder_qty, 0)::numeric AS fip_suggested_reorder_qty,
            COALESCE(po.pending_ordered_units, fip.already_ordered, 0)::numeric AS already_ordered,
            po.earliest_eta,

            -- Multi-window historical sales
            COALESCE(sa.sales_7d, 0)::numeric AS sales_7d,
            COALESCE(sa.sales_30d, 0)::numeric AS sales_30d,
            COALESCE(sa.sales_60d, 0)::numeric AS sales_60d,
            COALESCE(sa.sales_90d, 0)::numeric AS sales_90d,
            COALESCE(sa.sales_120d, 0)::numeric AS sales_120d,
            COALESCE(sa.revenue_120d, 0)::numeric AS revenue_120d,
            COALESCE(sa.sales_all_time, 0)::numeric AS sales_all_time,
            sa.last_sale_date,
            COALESCE(sa.has_sales_before_120d, false) AS has_sales_before_120d
        FROM public.sku_master sm
        LEFT JOIN public.fact_inventory_planning fip 
            ON sm.sku = fip.sku AND fip.country = sm.country AND fip.saddl_id = sm.saddl_id
        LEFT JOIN sales_agg sa ON sm.sku = sa.sku
        LEFT JOIN snap_agg sna ON sm.sku = sna.sku
        LEFT JOIN po_agg po ON sm.sku = po.sku
        WHERE sm.country = v_target_country AND sm.saddl_id = v_target_saddl_id
    ),

    -- 5. Calculate derived intelligence, classifications, and actionable rules
    computed AS (
        SELECT 
            b.*,
            -- Days since last sale
            CASE 
                WHEN b.last_sale_date IS NOT NULL THEN (CURRENT_DATE - b.last_sale_date)
                ELSE NULL 
            END AS days_since_last_sale,

            -- Average daily sales over windows
            ROUND((b.sales_30d / 30.0)::numeric, 3) AS ads_30d,
            ROUND((b.sales_60d / 60.0)::numeric, 3) AS ads_60d,
            ROUND((b.sales_120d / 120.0)::numeric, 3) AS ads_120d,

            -- Effective demand rate: prioritize blended_sv, fallback to ads_30d, fallback to ads_120d
            GREATEST(b.blended_sv, ROUND((b.sales_30d / 30.0)::numeric, 3), ROUND((b.sales_120d / 120.0)::numeric, 3)) AS effective_demand,

            -- Suggested reorder quantity: use fip if positive, otherwise compute based on effective demand, lead time, safety stock (21d), and MOQ
            CASE 
                WHEN b.fip_suggested_reorder_qty > 0 THEN b.fip_suggested_reorder_qty
                WHEN b.is_active = true AND GREATEST(b.blended_sv, ROUND((b.sales_30d / 30.0)::numeric, 3), ROUND((b.sales_120d / 120.0)::numeric, 3)) > 0 
                     AND (b.total_available = 0 OR (b.total_available / GREATEST(b.blended_sv, ROUND((b.sales_30d / 30.0)::numeric, 3), ROUND((b.sales_120d / 120.0)::numeric, 3))) < (b.lead_time_days + 21))
                THEN 
                    GREATEST(
                        b.moq,
                        CEIL((GREATEST(b.blended_sv, ROUND((b.sales_30d / 30.0)::numeric, 3), ROUND((b.sales_120d / 120.0)::numeric, 3)) * (b.lead_time_days + 21) - b.total_available) / GREATEST(1, b.moq)) * b.moq
                    )
                ELSE 0
            END AS suggested_reorder_qty,

            -- Sales history status
            CASE 
                WHEN b.sales_120d > 0 THEN 'Sold in Last 120 Days'
                WHEN b.sales_120d = 0 AND b.has_sales_before_120d = true THEN 'Previously Sold (>120d ago)'
                WHEN b.sales_all_time = 0 THEN 'Never Sold'
                ELSE 'History Unavailable'
            END AS sales_history_status,

            -- Sales velocity trend: compare 30d ADS with preceding 90d ADS
            CASE
                WHEN b.sales_120d = 0 THEN 'No Sales'
                WHEN (b.sales_30d / 30.0) > 1.25 * GREATEST(0.001, (b.sales_120d - b.sales_30d) / 90.0) THEN 'Increasing'
                WHEN (b.sales_30d / 30.0) < 0.75 * GREATEST(0.001, (b.sales_120d - b.sales_30d) / 90.0) THEN 'Declining'
                ELSE 'Stable'
            END AS velocity_trend,

            -- Actual Listing Status dimension
            CASE 
                WHEN b.is_active = true THEN 'Active'
                ELSE 'Inactive'
            END AS listing_status,

            -- Inventory Status dimension (Threshold: 21 days for Low Stock)
            CASE 
                WHEN b.total_available = 0 THEN 'Out of Stock'
                WHEN b.total_available > 0 AND (b.total_coverage < 21 OR (b.blended_sv > 0 AND (b.total_available / b.blended_sv) < 21)) THEN 'Low Stock'
                WHEN b.total_available > 0 THEN 'In Stock'
                ELSE 'Unknown'
            END AS inventory_status,

            -- Pending quantity to reorder (accounting for already ordered incoming POs)
            GREATEST(0, (
                CASE 
                    WHEN b.fip_suggested_reorder_qty > 0 THEN b.fip_suggested_reorder_qty
                    WHEN b.is_active = true AND GREATEST(b.blended_sv, ROUND((b.sales_30d / 30.0)::numeric, 3), ROUND((b.sales_120d / 120.0)::numeric, 3)) > 0 
                         AND (b.total_available = 0 OR (b.total_available / GREATEST(b.blended_sv, ROUND((b.sales_30d / 30.0)::numeric, 3), ROUND((b.sales_120d / 120.0)::numeric, 3))) < (b.lead_time_days + 21))
                    THEN 
                        GREATEST(
                            b.moq,
                            CEIL((GREATEST(b.blended_sv, ROUND((b.sales_30d / 30.0)::numeric, 3), ROUND((b.sales_120d / 120.0)::numeric, 3)) * (b.lead_time_days + 21) - b.total_available) / GREATEST(1, b.moq)) * b.moq
                        )
                    ELSE 0
                END
            ) - b.already_ordered) AS pending_qty_to_reorder
        FROM base b
    ),

    -- 6. Canonical 8-Category Matrix & 7 Action Recommendations
    final_classified AS (
        SELECT 
            c.*,

            -- Days of cover: total_available / effective_demand (NULL if demand = 0)
            CASE 
                WHEN c.effective_demand > 0 THEN ROUND((c.total_available / c.effective_demand)::numeric, 1)
                ELSE NULL 
            END AS days_of_cover,

            -- Estimated stockout date
            CASE 
                WHEN c.total_available = 0 THEN 'Currently OOS'
                WHEN c.effective_demand > 0 THEN (CURRENT_DATE + LEAST(365, (c.total_available / c.effective_demand)::int))::text
                ELSE 'No Stockout Risk'
            END AS estimated_stockout_date,

            -- Stockout Risk Level
            CASE 
                WHEN c.total_available = 0 THEN 'Immediate (OOS)'
                WHEN c.effective_demand > 0 AND (c.total_available / c.effective_demand) <= 14 THEN 'Critical (<14d)'
                WHEN c.effective_demand > 0 AND (c.total_available / c.effective_demand) <= 30 THEN 'High (<30d)'
                WHEN c.effective_demand > 0 AND (c.total_available / c.effective_demand) <= 60 THEN 'Moderate (<60d)'
                WHEN c.effective_demand > 0 THEN 'Healthy (60d+)'
                ELSE 'No Sales Demand'
            END AS stockout_risk,

            -- Canonical 8 SKU Categories
            CASE 
                WHEN c.listing_status = 'Active' AND c.inventory_status = 'In Stock' THEN 'Active + In Stock'
                WHEN c.listing_status = 'Active' AND c.inventory_status = 'Low Stock' THEN 'Active + Low Stock'
                WHEN c.listing_status = 'Active' AND c.inventory_status = 'Out of Stock' AND c.sales_120d > 0 THEN 'Active + OOS + Sold in Last 120 Days'
                WHEN c.listing_status = 'Active' AND c.inventory_status = 'Out of Stock' AND c.sales_120d = 0 AND c.has_sales_before_120d = true THEN 'Active + OOS + No Sales in Last 120 Days'
                WHEN c.listing_status = 'Active' AND c.sales_all_time = 0 THEN 'Active + No Sales History'
                WHEN c.listing_status = 'Active' AND c.inventory_status = 'Out of Stock' THEN 'Active + OOS + No Sales in Last 120 Days'
                WHEN c.listing_status = 'Inactive' AND c.total_available > 0 THEN 'Inactive + In Stock'
                WHEN c.listing_status = 'Inactive' AND c.total_available = 0 THEN 'Inactive + OOS'
                ELSE 'Unknown Status / Stale Data'
            END AS sku_classification,

            -- Recommended Action (The 7 Actions)
            CASE 
                -- 1. Stranded stock on inactive listing
                WHEN c.listing_status = 'Inactive' AND c.total_available > 0 THEN 'INVESTIGATE LISTING'

                -- 2. Inactive and no stock
                WHEN c.listing_status = 'Inactive' THEN 'DO NOT REORDER YET'

                -- 3. Active + OOS with proven recent demand
                WHEN c.listing_status = 'Active' AND c.total_available = 0 AND c.sales_120d > 0 THEN
                    CASE 
                        WHEN c.already_ordered >= GREATEST(c.moq, c.suggested_reorder_qty) AND c.already_ordered > 0 THEN 'MONITOR'
                        ELSE 'REORDER NOW'
                    END

                -- 4. Active + OOS but no recent sales
                WHEN c.listing_status = 'Active' AND c.total_available = 0 THEN
                    CASE 
                        WHEN c.has_sales_before_120d = true THEN 'RESTOCK ONLY IF APPROVED'
                        ELSE 'INVESTIGATE LISTING'
                    END

                -- 5. Active + Low Stock (Coverage < Lead Time)
                WHEN c.listing_status = 'Active' AND c.effective_demand > 0 AND (c.total_available / c.effective_demand) <= c.lead_time_days THEN
                    CASE 
                        WHEN c.already_ordered >= GREATEST(c.moq, c.suggested_reorder_qty) AND c.already_ordered > 0 THEN 'MONITOR'
                        ELSE 'REORDER NOW'
                    END

                -- 6. Active + Low Stock (Coverage approaching Lead Time + 15d buffer)
                WHEN c.listing_status = 'Active' AND c.effective_demand > 0 AND (c.total_available / c.effective_demand) <= (c.lead_time_days + 15) THEN
                    CASE 
                        WHEN c.already_ordered > 0 THEN 'MONITOR'
                        ELSE 'REORDER SOON'
                    END

                -- 7. Excess Stock (>90 days) or Declining
                WHEN c.total_coverage > 90 OR (c.velocity_trend = 'Declining' AND c.total_coverage > 60) THEN 'DO NOT REORDER YET'

                -- 8. Healthy stock
                WHEN c.total_available > 0 THEN 'MONITOR'

                ELSE 'INSUFFICIENT DATA'
            END AS recommended_action,

            -- Detailed human-readable justification for the recommendation
            CASE 
                WHEN c.listing_status = 'Inactive' AND c.total_available > 0 THEN 
                    'Listing is inactive/suppressed on marketplace but has ' || c.total_available || ' units available. Investigate listing to unblock stranded stock.'
                WHEN c.listing_status = 'Inactive' THEN 
                    'Listing is inactive with zero inventory. Do not purchase.'
                WHEN c.listing_status = 'Active' AND c.total_available = 0 AND c.sales_120d > 0 THEN 
                    CASE 
                        WHEN c.already_ordered >= GREATEST(c.moq, c.suggested_reorder_qty) AND c.already_ordered > 0 THEN
                            'Out of stock with recent demand (' || c.sales_120d || ' units in 120d), but ' || c.already_ordered || ' units are already on incoming PO.'
                        ELSE 
                            'Critical: Active SKU is Out of Stock with ' || c.sales_120d || ' units sold in the last 120 days. Immediate replenishment needed.'
                    END
                WHEN c.listing_status = 'Active' AND c.total_available = 0 AND c.has_sales_before_120d = true THEN 
                    'Out of stock with zero sales in last 120 days, but sold previously. Verify seasonal demand or customer interest before approving reorder.'
                WHEN c.listing_status = 'Active' AND c.total_available = 0 THEN 
                    'Out of stock with no recorded historical sales. Review product viability before allocating capital.'
                WHEN c.listing_status = 'Active' AND c.effective_demand > 0 AND (c.total_available / c.effective_demand) <= c.lead_time_days THEN 
                    CASE 
                        WHEN c.already_ordered >= GREATEST(c.moq, c.suggested_reorder_qty) AND c.already_ordered > 0 THEN
                            'Coverage (' || ROUND((c.total_available / c.effective_demand)::numeric, 1) || 'd) is under lead time (' || c.lead_time_days || 'd), but incoming PO has ' || c.already_ordered || ' units.'
                        ELSE 
                            'Urgent: Current stock coverage (' || ROUND((c.total_available / c.effective_demand)::numeric, 1) || 'd) is below supplier lead time (' || c.lead_time_days || 'd). Stockout inevitable without immediate reorder.'
                    END
                WHEN c.listing_status = 'Active' AND c.effective_demand > 0 AND (c.total_available / c.effective_demand) <= (c.lead_time_days + 15) THEN 
                    'Stock coverage (' || ROUND((c.total_available / c.effective_demand)::numeric, 1) || 'd) is nearing safety threshold (' || (c.lead_time_days + 15) || 'd). Prepare purchase order.'
                WHEN c.total_coverage > 90 THEN 
                    'Excess stock: ' || ROUND(c.total_coverage::numeric, 1) || ' days of cover. Do not order additional units.'
                WHEN c.total_available > 0 THEN 
                    'Stock levels and velocity are in balance (' || COALESCE(ROUND(c.total_coverage::numeric, 1), 0) || ' days cover).'
                ELSE 
                    'Insufficient data to determine reorder urgency.'
            END AS recommendation_reason
        FROM computed c
    )
    SELECT json_agg(fc ORDER BY 
        -- Priority sorting: Urgent OOS first, then Low Stock, then healthy
        CASE fc.recommended_action 
            WHEN 'REORDER NOW' THEN 1 
            WHEN 'REORDER SOON' THEN 2 
            WHEN 'INVESTIGATE LISTING' THEN 3 
            WHEN 'RESTOCK ONLY IF APPROVED' THEN 4 
            WHEN 'MONITOR' THEN 5 
            WHEN 'DO NOT REORDER YET' THEN 6 
            ELSE 7 
        END,
        fc.sales_120d DESC,
        fc.total_available ASC
    ) INTO v_result
    FROM final_classified fc;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sku_intelligence(TEXT, TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
