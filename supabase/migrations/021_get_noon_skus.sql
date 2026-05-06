-- Create RPC to get unique SKUs associated with Noon marketplace
CREATE OR REPLACE FUNCTION get_noon_skus()
RETURNS TABLE (sku TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT s.sku
  FROM sales_snapshot s
  WHERE s.channel = 'noon'
  UNION
  SELECT DISTINCT i.sku
  FROM inventory_snapshot i
  WHERE i.node = 'noon_fbn';
END;
$$;
