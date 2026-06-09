-- =========================================================
-- 056_add_country_to_valuation.sql
-- Add p_country filter to get_final_valuation
-- =========================================================

DROP FUNCTION IF EXISTS public.get_final_valuation();
DROP FUNCTION IF EXISTS public.get_final_valuation(text);

CREATE OR REPLACE FUNCTION get_final_valuation(p_country TEXT DEFAULT 'UAE')
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'fba', COALESCE(SUM(fba_units * cogs), 0),
        'fbn', COALESCE(SUM(fbn_units * cogs), 0),
        'min', COALESCE(SUM(minutes_units * cogs), 0),
        'loc', COALESCE(SUM(locad_units * cogs), 0)
    ) INTO result
    FROM fact_inventory_planning
    WHERE COALESCE(country, 'UAE') = p_country
    AND is_active = true;
    
    RETURN COALESCE(result, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_final_valuation(text) TO authenticated, anon, service_role;
