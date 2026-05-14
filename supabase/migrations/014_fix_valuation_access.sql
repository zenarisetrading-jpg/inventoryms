-- Ensure RLS is configured correctly for the valuation dashboard
ALTER TABLE public.fact_inventory_planning ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all inventory data
DROP POLICY IF EXISTS "Allow authenticated selection" ON public.fact_inventory_planning;
CREATE POLICY "Allow authenticated selection" 
ON public.fact_inventory_planning FOR SELECT 
TO authenticated 
USING (true);

-- Ensure the refresh function is accessible
GRANT EXECUTE ON FUNCTION refresh_fact_inventory_planning() TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_fact_inventory_planning() TO anon;
