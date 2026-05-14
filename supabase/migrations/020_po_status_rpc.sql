-- RPC to get PO status distribution for Performance dashboard
CREATE OR REPLACE FUNCTION get_po_status_distribution()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_agg(sub) INTO result
    FROM (
        SELECT 
            UPPER(status) AS status,
            COUNT(DISTINCT po_number) AS po_count,
            SUM(units_ordered) AS total_units
        FROM fact_purchase
        WHERE UPPER(status) IN ('ORDERED', 'SHIPPED')
        GROUP BY UPPER(status)
        ORDER BY po_count DESC
    ) sub;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_po_status_distribution() TO anon;
GRANT EXECUTE ON FUNCTION get_po_status_distribution() TO authenticated;
