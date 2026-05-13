-- Updated RPC to get Median Coverage Health using user-provided logic
CREATE OR REPLACE FUNCTION get_coverage_health()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'amazon', median_fba_coverage,
        'noon', median_noon_coverage,
        'minutes', median_minutes_coverage,
        'locad', median_locad_coverage
    ) INTO result
    FROM (
        SELECT 
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fba_units / NULLIF(amazon_sv, 0)) AS median_fba_coverage,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fbn_units / NULLIF(noon_sv, 0)) AS median_noon_coverage,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY minutes_units / NULLIF(minutes_sv, 0)) AS median_minutes_coverage,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY locad_units / NULLIF(blended_sv, 0)) AS median_locad_coverage
        FROM fact_inventory_planning
        WHERE is_active = true
          AND (
                (fba_units > 0 AND amazon_sv > 0)
             OR (fbn_units > 0 AND noon_sv > 0)
             OR (minutes_units > 0 AND minutes_sv > 0)
             OR (locad_units > 0 AND blended_sv > 0)
          )
    ) sub;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_coverage_health () TO anon;

GRANT EXECUTE ON FUNCTION get_coverage_health () TO authenticated;