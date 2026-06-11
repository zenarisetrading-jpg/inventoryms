-- Function to get inventory totals matching the user's requirement
CREATE OR REPLACE FUNCTION get_inventory_valuation_totals()
RETURNS TABLE (
    fba_total_cogs numeric,
    fbn_total_cogs numeric,
    minutes_total_cogs numeric,
    locad_total_cogs numeric
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(fba_units * cogs), 0) AS fba_total_cogs,
        COALESCE(SUM(fbn_units * cogs), 0) AS fbn_total_cogs,
        COALESCE(SUM(minutes_units * cogs), 0) AS minutes_total_cogs,
        COALESCE(SUM(locad_units * cogs), 0) AS locad_total_cogs
    FROM fact_inventory_planning;
END;
$$;
