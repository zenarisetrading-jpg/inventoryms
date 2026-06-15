-- Fix RLS for amazon_locations for INSERT
DROP POLICY IF EXISTS "auth_all" ON amazon_locations;
CREATE POLICY "auth_all" ON amazon_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);
