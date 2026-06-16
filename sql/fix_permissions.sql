DROP POLICY IF EXISTS "auth_all" ON public.amazon_locations;
CREATE POLICY "auth_all" ON public.amazon_locations FOR ALL USING (true) WITH CHECK (true);
