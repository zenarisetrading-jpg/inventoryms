-- Migration 093: SADDL SKU Intelligence - Marketplace Separation & Human Review Decisions
-- =======================================================================================

-- 1. Create table for persisting human review decisions
CREATE TABLE IF NOT EXISTS public.sku_review_decision (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'UAE',
    saddl_id TEXT NOT NULL DEFAULT 's2c_uae_test',
    marketplace TEXT NOT NULL DEFAULT 'global', -- 'global', 'amazon', 'noon'
    decision TEXT NOT NULL, -- 'Approve for Replenishment', 'Mark for Discontinuation Review', 'Keep Active', 'Investigate Listing', 'Defer Decision'
    notes TEXT,
    reviewer_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sku_review_decision_unique UNIQUE(sku, country, saddl_id, marketplace)
);

ALTER TABLE public.sku_review_decision ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_sku_review_decision" ON public.sku_review_decision;
CREATE POLICY "allow_all_sku_review_decision" ON public.sku_review_decision FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.sku_review_decision TO anon, authenticated, service_role;

-- 2. Helper RPC to save or update human review decisions
CREATE OR REPLACE FUNCTION public.save_sku_review_decision(
    p_sku TEXT,
    p_decision TEXT,
    p_notes TEXT DEFAULT NULL,
    p_reviewer_email TEXT DEFAULT NULL,
    p_marketplace TEXT DEFAULT 'global',
    p_country TEXT DEFAULT 'UAE',
    p_saddl_id TEXT DEFAULT 's2c_uae_test'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_record RECORD;
BEGIN
    INSERT INTO public.sku_review_decision (
        sku, country, saddl_id, marketplace, decision, notes, reviewer_email, updated_at
    )
    VALUES (
        p_sku,
        COALESCE(NULLIF(p_country, ''), 'UAE'),
        COALESCE(NULLIF(p_saddl_id, ''), 's2c_uae_test'),
        COALESCE(NULLIF(p_marketplace, ''), 'global'),
        p_decision,
        p_notes,
        p_reviewer_email,
        NOW()
    )
    ON CONFLICT (sku, country, saddl_id, marketplace)
    DO UPDATE SET
        decision = EXCLUDED.decision,
        notes = EXCLUDED.notes,
        reviewer_email = EXCLUDED.reviewer_email,
        updated_at = NOW()
    RETURNING * INTO v_record;

    RETURN row_to_json(v_record);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_sku_review_decision(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- 3. Replace get_sku_intelligence with complete marketplace separation and discontinuation logic
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
    -- 1. Historical sales aggregated by marketplace channel
    sales_channel_agg AS (
        SELECT 
            sku,
            -- Combined sales
            SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '30 days' THEN units_sold ELSE 0 END) AS sales_30d,
            SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '60 days' THEN units_sold ELSE 0 END) AS sales_60d,
            SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '120 days' THEN units_sold ELSE 0 END) AS sales_120d,
            SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '120 days' THEN COALESCE(revenue, 0) ELSE 0 END) AS revenue_120d,
            SUM(units_sold) AS sales_all_time,
            MAX(CASE WHEN units_sold > 0 THEN date ELSE NULL END) AS last_sale_date,
            BOOL_OR(date < CURRENT_DATE - INTERVAL '120 days' AND units_sold > 0) AS has_sales_before_120d,

            -- Amazon specific sales
            SUM(CASE WHEN channel = 'amazon' AND date >= CURRENT_DATE - INTERVAL '30 days' THEN units_sold ELSE 0 END) AS amz_sales_30d,
            SUM(CASE WHEN channel = 'amazon' AND date >= CURRENT_DATE - INTERVAL '120 days' THEN units_sold ELSE 0 END) AS amz_sales_120d,
            MAX(CASE WHEN channel = 'amazon' AND units_sold > 0 THEN date ELSE NULL END) AS amz_last_sale_date,

            -- Noon specific sales (including Noon Minutes)
            SUM(CASE WHEN channel IN ('noon', 'noon_minutes') AND date >= CURRENT_DATE - INTERVAL '30 days' THEN units_sold ELSE 0 END) AS noon_sales_30d,
            SUM(CASE WHEN channel IN ('noon', 'noon_minutes') AND date >= CURRENT_DATE - INTERVAL '120 days' THEN units_sold ELSE 0 END) AS noon_sales_120d,
            MAX(CASE WHEN channel IN ('noon', 'noon_minutes') AND units_sold > 0 THEN date ELSE NULL END) AS noon_last_sale_date
        FROM public.sales_snapshot
        WHERE country = v_target_country AND saddl_id = v_target_saddl_id
        GROUP BY sku
    ),

    -- 2. Pending purchase orders
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

    -- 3. Latest inventory snapshot for reserved, inbound, and sync timestamp
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

    -- 4. Review decisions
    rev_agg AS (
        SELECT 
            sku,
            decision as review_decision,
            reviewer_email,
            updated_at as reviewed_at,
            notes as review_notes
        FROM public.sku_review_decision
        WHERE country = v_target_country AND saddl_id = v_target_saddl_id AND marketplace = 'global'
    ),

    -- 5. Base join of sku_master and fact_inventory_planning
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

            -- Marketplace inventory
            COALESCE(fip.fba_units, 0)::numeric AS fba_available,
            COALESCE(fip.fbn_units, 0)::numeric AS fbn_available,
            COALESCE(fip.minutes_units, 0)::numeric AS minutes_available,
            (COALESCE(fip.fbn_units, 0) + COALESCE(fip.minutes_units, 0))::numeric AS noon_available,
            COALESCE(fip.locad_units, 0)::numeric AS locad_available,
            COALESCE(fip.locad_boxes, 0)::numeric AS locad_boxes,
            COALESCE(fip.stock_in_hand, 0)::numeric AS total_available,

            -- Inbound & Reserved
            COALESCE(sna.fba_reserved, 0)::numeric AS fba_reserved,
            COALESCE(sna.fba_inbound, 0)::numeric AS fba_inbound,
            COALESCE(sna.total_reserved, 0)::numeric AS total_reserved,
            COALESCE(sna.total_inbound, 0)::numeric AS total_inbound,
            sna.last_inventory_sync,

            -- Velocities & coverages
            COALESCE(fip.amazon_sv, 0)::numeric AS amazon_sv,
            COALESCE(fip.noon_sv, 0)::numeric AS noon_sv,
            COALESCE(fip.minutes_sv, 0)::numeric AS minutes_sv,
            COALESCE(fip.blended_sv, 0)::numeric AS blended_sv,
            COALESCE(fip.amazon_coverage, 0)::numeric AS amazon_coverage,
            COALESCE(fip.noon_coverage, 0)::numeric AS noon_coverage,
            COALESCE(fip.total_coverage, 0)::numeric AS total_coverage,

            -- Reorder engine quantities
            COALESCE(fip.suggested_reorder_qty, 0)::numeric AS fip_suggested_reorder_qty,
            COALESCE(po.pending_ordered_units, fip.already_ordered, 0)::numeric AS already_ordered,
            po.earliest_eta,

            -- Multi-channel sales
            COALESCE(sa.sales_30d, 0)::numeric AS sales_30d,
            COALESCE(sa.sales_60d, 0)::numeric AS sales_60d,
            COALESCE(sa.sales_120d, 0)::numeric AS sales_120d,
            COALESCE(sa.revenue_120d, 0)::numeric AS revenue_120d,
            COALESCE(sa.sales_all_time, 0)::numeric AS sales_all_time,
            sa.last_sale_date,
            COALESCE(sa.has_sales_before_120d, false) AS has_sales_before_120d,

            -- Amazon specific
            COALESCE(sa.amz_sales_30d, 0)::numeric AS amz_sales_30d,
            COALESCE(sa.amz_sales_120d, 0)::numeric AS amz_sales_120d,
            sa.amz_last_sale_date,

            -- Noon specific
            COALESCE(sa.noon_sales_30d, 0)::numeric AS noon_sales_30d,
            COALESCE(sa.noon_sales_120d, 0)::numeric AS noon_sales_120d,
            sa.noon_last_sale_date,

            -- Review info
            rev.review_decision,
            rev.reviewer_email,
            rev.reviewed_at,
            rev.review_notes
        FROM public.sku_master sm
        LEFT JOIN public.fact_inventory_planning fip 
            ON sm.sku = fip.sku AND fip.country = sm.country AND fip.saddl_id = sm.saddl_id
        LEFT JOIN sales_channel_agg sa ON sm.sku = sa.sku
        LEFT JOIN snap_agg sna ON sm.sku = sna.sku
        LEFT JOIN po_agg po ON sm.sku = po.sku
        LEFT JOIN rev_agg rev ON sm.sku = rev.sku
        WHERE sm.country = v_target_country AND sm.saddl_id = v_target_saddl_id
    ),

    -- 6. Computed derived metrics, days since sale, effective demand, and marketplace-level indicators
    computed AS (
        SELECT 
            b.*,
            -- Days since sales
            CASE WHEN b.last_sale_date IS NOT NULL THEN (CURRENT_DATE - b.last_sale_date) ELSE NULL END AS days_since_last_sale,
            CASE WHEN b.amz_last_sale_date IS NOT NULL THEN (CURRENT_DATE - b.amz_last_sale_date) ELSE NULL END AS amz_days_since_last_sale,
            CASE WHEN b.noon_last_sale_date IS NOT NULL THEN (CURRENT_DATE - b.noon_last_sale_date) ELSE NULL END AS noon_days_since_last_sale,

            -- Average Daily Sales
            ROUND((b.sales_30d / 30.0)::numeric, 3) AS ads_30d,
            ROUND((b.sales_120d / 120.0)::numeric, 3) AS ads_120d,
            ROUND((b.amz_sales_30d / 30.0)::numeric, 3) AS amz_ads_30d,
            ROUND((b.amz_sales_120d / 120.0)::numeric, 3) AS amz_ads_120d,
            ROUND((b.noon_sales_30d / 30.0)::numeric, 3) AS noon_ads_30d,
            ROUND((b.noon_sales_120d / 120.0)::numeric, 3) AS noon_ads_120d,

            -- Effective demand rate
            GREATEST(b.blended_sv, ROUND((b.sales_30d / 30.0)::numeric, 3), ROUND((b.sales_120d / 120.0)::numeric, 3)) AS effective_demand,

            -- Listing statuses
            CASE WHEN b.is_active = true THEN 'Active' ELSE 'Inactive' END AS listing_status,
            CASE WHEN b.amazon_active = true THEN 'Active' ELSE 'Inactive' END AS amazon_listing_status,
            CASE WHEN b.noon_active = true THEN 'Active' ELSE 'Inactive' END AS noon_listing_status,

            -- Suggested reorder quantity
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

            -- Pending net reorder quantity after pipeline POs
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
            ) - b.already_ordered) AS pending_qty_to_reorder,

            -- Velocity Trend
            CASE
                WHEN b.sales_120d = 0 THEN 'No Sales'
                WHEN (b.sales_30d / 30.0) > 1.25 * GREATEST(0.001, (b.sales_120d - b.sales_30d) / 90.0) THEN 'Increasing'
                WHEN (b.sales_30d / 30.0) < 0.75 * GREATEST(0.001, (b.sales_120d - b.sales_30d) / 90.0) THEN 'Declining'
                ELSE 'Stable'
            END AS velocity_trend
        FROM base b
    ),

    -- 7. Marketplace-Specific Classifications & Global Product Action Decision
    classified AS (
        SELECT 
            c.*,
            -- Days of cover
            CASE WHEN c.effective_demand > 0 THEN ROUND((c.total_available / c.effective_demand)::numeric, 1) ELSE NULL END AS days_of_cover,

            -- Stockout Risk Level
            CASE 
                WHEN c.total_available = 0 THEN 'Immediate (OOS)'
                WHEN c.effective_demand > 0 AND (c.total_available / c.effective_demand) <= 14 THEN 'Critical (<14d)'
                WHEN c.effective_demand > 0 AND (c.total_available / c.effective_demand) <= 30 THEN 'High (<30d)'
                WHEN c.effective_demand > 0 AND (c.total_available / c.effective_demand) <= 60 THEN 'Moderate (<60d)'
                WHEN c.effective_demand > 0 THEN 'Healthy (60d+)'
                ELSE 'No Sales Demand'
            END AS stockout_risk,

            -- -------------------------------------------------------------
            -- AMAZON FBA SPECIFIC ACTION & REASON
            -- -------------------------------------------------------------
            CASE 
                WHEN c.amazon_listing_status = 'Inactive' AND c.fba_available > 0 THEN 'FIX LISTING'
                WHEN c.amazon_listing_status = 'Inactive' THEN 'DO NOT REORDER YET'
                WHEN c.amazon_listing_status = 'Active' AND c.fba_available = 0 AND c.amz_sales_120d = 0 THEN 'REVIEW FOR DISCONTINUATION'
                WHEN c.amazon_listing_status = 'Active' AND c.fba_available = 0 AND c.amz_sales_120d > 0 THEN 'REORDER NOW'
                WHEN c.amazon_listing_status = 'Active' AND c.fba_available > 0 AND (c.amazon_coverage < 21 OR (c.amazon_sv > 0 AND (c.fba_available / c.amazon_sv) < 21)) THEN 'REORDER SOON'
                WHEN c.amazon_listing_status = 'Active' AND c.fba_available > 0 THEN 'DO NOT REORDER YET'
                ELSE 'REVIEW PRODUCT PERFORMANCE'
            END AS amazon_recommended_action,

            CASE 
                WHEN c.amazon_listing_status = 'Inactive' AND c.fba_available > 0 THEN 
                    'Listing inactive on Amazon UAE with ' || c.fba_available || ' units stranded at FBA.'
                WHEN c.amazon_listing_status = 'Inactive' THEN 
                    'Amazon listing is inactive. No FBA inventory.'
                WHEN c.amazon_listing_status = 'Active' AND c.fba_available = 0 AND c.amz_sales_120d = 0 THEN 
                    'Amazon FBA stock is 0. No verified Amazon sales in the last 120 days. Review Amazon discontinuation.'
                WHEN c.amazon_listing_status = 'Active' AND c.fba_available = 0 AND c.amz_sales_120d > 0 THEN 
                    'Amazon FBA is Out of Stock with ' || c.amz_sales_120d || ' units sold in 120d. Replenishment candidate.'
                WHEN c.amazon_listing_status = 'Active' AND c.fba_available > 0 AND (c.amazon_coverage < 21 OR (c.amazon_sv > 0 AND (c.fba_available / c.amazon_sv) < 21)) THEN 
                    'FBA stock is low (' || c.fba_available || ' units, ' || ROUND(c.amazon_coverage::numeric, 1) || 'd cover). Prepare replenishment.'
                WHEN c.amazon_listing_status = 'Active' AND c.fba_available > 0 THEN 
                    'Healthy Amazon stock (' || c.fba_available || ' units, ' || ROUND(c.amazon_coverage::numeric, 1) || 'd cover).'
                ELSE 'Amazon data requires review.'
            END AS amazon_recommendation_reason,

            -- -------------------------------------------------------------
            -- NOON SPECIFIC ACTION & REASON
            -- -------------------------------------------------------------
            CASE 
                WHEN c.noon_listing_status = 'Inactive' AND c.noon_available > 0 THEN 'FIX LISTING'
                WHEN c.noon_listing_status = 'Inactive' THEN 'DO NOT REORDER YET'
                WHEN c.noon_listing_status = 'Active' AND c.noon_available = 0 AND c.noon_sales_120d = 0 THEN 'REVIEW FOR DISCONTINUATION'
                WHEN c.noon_listing_status = 'Active' AND c.noon_available = 0 AND c.noon_sales_120d > 0 THEN 'REORDER NOW'
                WHEN c.noon_listing_status = 'Active' AND c.noon_available > 0 AND (c.noon_coverage < 21 OR (c.noon_sv > 0 AND (c.noon_available / c.noon_sv) < 21)) THEN 'REORDER SOON'
                WHEN c.noon_listing_status = 'Active' AND c.noon_available > 0 THEN 'DO NOT REORDER YET'
                ELSE 'REVIEW PRODUCT PERFORMANCE'
            END AS noon_recommended_action,

            CASE 
                WHEN c.noon_listing_status = 'Inactive' AND c.noon_available > 0 THEN 
                    'Listing inactive on Noon with ' || c.noon_available || ' units available in fulfillment centers.'
                WHEN c.noon_listing_status = 'Inactive' THEN 
                    'Noon listing is inactive. No inventory.'
                WHEN c.noon_listing_status = 'Active' AND c.noon_available = 0 AND c.noon_sales_120d = 0 THEN 
                    'Noon stock is 0. No verified Noon sales in the last 120 days. Review Noon discontinuation.'
                WHEN c.noon_listing_status = 'Active' AND c.noon_available = 0 AND c.noon_sales_120d > 0 THEN 
                    'Noon is Out of Stock with ' || c.noon_sales_120d || ' units sold in 120d. Replenishment candidate.'
                WHEN c.noon_listing_status = 'Active' AND c.noon_available > 0 AND (c.noon_coverage < 21 OR (c.noon_sv > 0 AND (c.noon_available / c.noon_sv) < 21)) THEN 
                    'Noon stock is low (' || c.noon_available || ' units, ' || ROUND(c.noon_coverage::numeric, 1) || 'd cover).'
                WHEN c.noon_listing_status = 'Active' AND c.noon_available > 0 THEN 
                    'Healthy Noon stock (' || c.noon_available || ' units, ' || ROUND(c.noon_coverage::numeric, 1) || 'd cover).'
                ELSE 'Noon data requires review.'
            END AS noon_recommendation_reason,

            -- -------------------------------------------------------------
            -- GLOBAL / PRODUCT-LEVEL ACTION (Plain-Language Business Labels)
            -- -------------------------------------------------------------
            CASE 
                -- 1. Listing issue with stranded stock
                WHEN c.listing_status = 'Inactive' AND c.total_available > 0 THEN 'FIX LISTING'

                -- 2. Inactive product with zero inventory
                WHEN c.listing_status = 'Inactive' THEN 'DO NOT REORDER YET'

                -- 3. Category A — REVIEW FOR DISCONTINUATION (Primary Business Rule):
                -- Active, OOS across evaluated channels, 0 sales in 120 days, and reorder engine recommends reorder OR OOS across both channels
                WHEN c.listing_status = 'Active' AND c.total_available = 0 AND c.sales_120d = 0 THEN 'REVIEW FOR DISCONTINUATION'

                -- 4. OOS on Amazon with 0 sales in 120d, but active & viable on Noon
                WHEN c.listing_status = 'Active' AND c.fba_available = 0 AND c.amz_sales_120d = 0 AND (c.noon_available > 0 OR c.noon_sales_120d > 0) THEN 
                    CASE 
                        WHEN c.noon_available = 0 AND c.noon_sales_120d > 0 THEN 'REORDER NOW'
                        WHEN c.noon_available > 0 AND (c.noon_coverage < 21) THEN 'REORDER SOON'
                        ELSE 'DO NOT REORDER YET'
                    END

                -- 5. Category B — REPLENISHMENT CANDIDATE (Active, OOS or Low Stock with proven 120d demand)
                WHEN c.listing_status = 'Active' AND (c.fba_available = 0 OR c.noon_available = 0 OR c.total_available = 0) AND c.sales_120d > 0 THEN
                    CASE 
                        WHEN c.already_ordered >= GREATEST(c.moq, c.suggested_reorder_qty) AND c.already_ordered > 0 THEN 'DO NOT REORDER YET'
                        ELSE 'REORDER NOW'
                    END

                -- 6. Active + Low Stock (Coverage approaching safety threshold)
                WHEN c.listing_status = 'Active' AND c.effective_demand > 0 AND (c.total_available / c.effective_demand) <= (c.lead_time_days + 15) THEN
                    CASE 
                        WHEN c.already_ordered >= GREATEST(c.moq, c.suggested_reorder_qty) AND c.already_ordered > 0 THEN 'DO NOT REORDER YET'
                        ELSE 'REORDER SOON'
                    END

                -- 7. Category C — NO RECENT SALES, NO REORDER REQUIRED
                WHEN c.listing_status = 'Active' AND c.sales_120d = 0 AND c.suggested_reorder_qty = 0 THEN 'REVIEW PRODUCT PERFORMANCE'

                -- 8. Category D — ACTIVE WITH AVAILABLE STOCK (Healthy or Overstocked)
                WHEN c.listing_status = 'Active' AND c.total_available > 0 THEN 'DO NOT REORDER YET'

                ELSE 'DATA NEEDS CHECKING'
            END AS recommended_action,

            -- -------------------------------------------------------------
            -- DETAILED HUMAN-READABLE JUSTIFICATION (Cross-Marketplace)
            -- -------------------------------------------------------------
            CASE 
                -- Inactive with stranded stock
                WHEN c.listing_status = 'Inactive' AND c.total_available > 0 THEN 
                    'Product is inactive but has ' || c.total_available || ' units stranded in warehouse/FBA. Investigate listing before liquidating.'

                -- Inactive
                WHEN c.listing_status = 'Inactive' THEN 
                    'Product listing is inactive with zero inventory. Do not purchase additional stock.'

                -- Global Discontinuation Review: OOS on both channels and zero sales in 120d
                WHEN c.listing_status = 'Active' AND c.fba_available = 0 AND c.noon_available = 0 AND c.sales_120d = 0 THEN 
                    'Out of stock across BOTH Amazon and Noon with 0 verified sales in the last 120 days. Reorder engine suggests ' || c.suggested_reorder_qty || ' units (MOQ: ' || c.moq || '). Flagged for discontinuation review before spending money.'

                -- Viable on Noon: OOS on Amazon with 0 sales in 120d, but viable on Noon
                WHEN c.listing_status = 'Active' AND c.fba_available = 0 AND c.amz_sales_120d = 0 AND (c.noon_available > 0 OR c.noon_sales_120d > 0) THEN 
                    'Amazon FBA stock is 0 with 0 sales in 120d, but active on Noon (' || c.noon_available || ' units available, ' || c.noon_sales_120d || ' units sold in 120d). Available on Noon — DO NOT discontinue the product globally.'

                -- Active OOS with recent verified demand
                WHEN c.listing_status = 'Active' AND c.total_available = 0 AND c.sales_120d > 0 THEN 
                    CASE 
                        WHEN c.already_ordered >= GREATEST(c.moq, c.suggested_reorder_qty) AND c.already_ordered > 0 THEN 
                            'Out of stock with verified recent demand (' || c.sales_120d || ' units sold in 120d), but ' || c.already_ordered || ' units are already covered on incoming PO.'
                        ELSE 
                            'Critical: Out of Stock with ' || c.sales_120d || ' units verified sold in the last 120 days. Demand justifies immediate replenishment (' || c.suggested_reorder_qty || ' units suggested).'
                    END

                -- One channel OOS with recent sales
                WHEN c.listing_status = 'Active' AND (c.fba_available = 0 OR c.noon_available = 0) AND c.sales_120d > 0 THEN 
                    CASE 
                        WHEN c.already_ordered > 0 THEN 
                            'Channel stockout (FBA: ' || c.fba_available || ', Noon: ' || c.noon_available || '), with ' || c.sales_120d || ' units sold in 120d. Incoming PO has ' || c.already_ordered || ' units.'
                        ELSE 
                            'Channel stockout (FBA: ' || c.fba_available || ', Noon: ' || c.noon_available || '). Verified demand (' || c.sales_120d || ' units in 120d). Replenish out-of-stock channels.'
                    END

                -- Low stock nearing safety buffer
                WHEN c.listing_status = 'Active' AND c.effective_demand > 0 AND (c.total_available / c.effective_demand) <= (c.lead_time_days + 15) THEN 
                    'Stock coverage (' || ROUND((c.total_available / c.effective_demand)::numeric, 1) || 'd) is approaching supplier lead time (' || c.lead_time_days || 'd + buffer). Reorder soon to prevent stockout.'

                -- No recent sales, no reorder needed
                WHEN c.listing_status = 'Active' AND c.sales_120d = 0 THEN 
                    'No sales recorded in the last 120 days. Reorder not currently justified. Review product performance, seasonality, and pricing.'

                -- In stock
                WHEN c.listing_status = 'Active' AND c.total_available > 0 THEN 
                    'Sufficient inventory available (' || c.total_available || ' units, ' || COALESCE(ROUND(c.total_coverage::numeric, 1), 0) || ' days of cover). No reorder required.'

                ELSE 'Missing required sales or inventory data. Sync required.'
            END AS recommendation_reason
        FROM computed c
    )
    SELECT json_agg(fc ORDER BY 
        CASE fc.recommended_action 
            WHEN 'REORDER NOW' THEN 1 
            WHEN 'REORDER SOON' THEN 2 
            WHEN 'REVIEW FOR DISCONTINUATION' THEN 3 
            WHEN 'FIX LISTING' THEN 4 
            WHEN 'REVIEW PRODUCT PERFORMANCE' THEN 5 
            WHEN 'DO NOT REORDER YET' THEN 6 
            ELSE 7 
        END,
        fc.sales_120d DESC,
        fc.total_available ASC
    ) INTO v_result
    FROM classified fc;

    RETURN COALESCE(v_result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sku_intelligence(TEXT, TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
