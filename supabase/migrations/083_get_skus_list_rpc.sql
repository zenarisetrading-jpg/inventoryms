-- Migration 083: Create get_skus_list RPC

CREATE OR REPLACE FUNCTION get_skus_list(
    p_country text,
    p_account_id text DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_category text DEFAULT NULL,
    p_flag text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
    cutoff60 date := CURRENT_DATE - INTERVAL '60 days';
BEGIN
    WITH live_skus AS (
        SELECT DISTINCT sku
        FROM sales_snapshot
        WHERE country = p_country
          AND date >= cutoff60
          AND units_sold > 0
          AND (p_account_id IS NULL OR saddl_id = p_account_id)
    ),
    filtered_skus AS (
        SELECT 
            sm.sku,
            sm.name,
            sm.asin,
            sm.fnsku,
            sm.category,
            sm.product_category,
            sm.sub_category,
            sm.units_per_box,
            sm.moq,
            sm.lead_time_days,
            sm.cogs,
            COALESCE(sm.dimensions, sm.dimension) AS dimensions,
            sm.weight_kg,
            sm.cbm,
            COALESCE(sm.amazon_active, true) AS amazon_active,
            COALESCE(sm.noon_active, true) AS noon_active,
            COALESCE(sm.minutes_active, true) AS minutes_active,
            sm.is_active,
            CASE WHEN ls.sku IS NOT NULL THEN true ELSE false END AS is_live,
            dm.blended_sv,
            dm.total_coverage,
            dm.projected_coverage,
            dm.should_reorder,
            dm.suggested_reorder_units,
            dm.action_flag
        FROM sku_master sm
        LEFT JOIN live_skus ls ON sm.sku = ls.sku
        LEFT JOIN demand_metrics dm ON sm.sku = dm.sku AND dm.country = p_country AND (p_account_id IS NULL OR dm.saddl_id = p_account_id)
        WHERE sm.country = p_country
          AND (p_account_id IS NULL OR sm.saddl_id = p_account_id OR sm.saddl_id IS NULL)
          AND (p_category IS NULL OR sm.category = p_category)
          AND (p_search IS NULL OR sm.sku ILIKE '%' || p_search || '%' OR sm.name ILIKE '%' || p_search || '%')
          AND (p_flag IS NULL OR dm.action_flag = p_flag)
        ORDER BY sm.sku ASC
    )
    SELECT COALESCE(json_agg(
        json_build_object(
            'sku', sku,
            'name', name,
            'asin', asin,
            'fnsku', fnsku,
            'category', category,
            'product_category', product_category,
            'sub_category', sub_category,
            'units_per_box', units_per_box,
            'moq', moq,
            'lead_time_days', lead_time_days,
            'cogs', cogs,
            'dimensions', dimensions,
            'weight_kg', weight_kg,
            'cbm', cbm,
            'amazon_active', amazon_active,
            'noon_active', noon_active,
            'minutes_active', minutes_active,
            'is_active', is_active,
            'is_live', is_live,
            'action_flag', action_flag,
            'demand', CASE WHEN action_flag IS NOT NULL THEN json_build_object(
                'blended_sv', COALESCE(blended_sv, 0),
                'total_coverage', COALESCE(total_coverage, 0),
                'projected_coverage', COALESCE(projected_coverage, 0),
                'should_reorder', COALESCE(should_reorder, false),
                'suggested_reorder_units', COALESCE(suggested_reorder_units, 0)
            ) ELSE NULL END
        )
    ), '[]'::json) INTO result
    FROM filtered_skus;

    RETURN json_build_object(
        'skus', result,
        'count', json_array_length(result)
    );
END;
$$;
