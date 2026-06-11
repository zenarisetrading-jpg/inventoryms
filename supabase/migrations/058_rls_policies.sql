-- Enable RLS on core tables
ALTER TABLE public.sku_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fact_purchase ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fact_inventory_planning ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demand_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locad_upload_log ENABLE ROW LEVEL SECURITY;

-- 1. sku_master
-- Read: All authenticated users
CREATE POLICY "Allow read access for all authenticated users" ON public.sku_master
  FOR SELECT TO authenticated USING (true);

-- Write: Only Administrator or Operations Mgr
CREATE POLICY "Allow write access for admins and ops managers" ON public.sku_master
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  );

-- 2. fact_purchase
CREATE POLICY "Allow read access for all authenticated users" ON public.fact_purchase
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access for admins and ops managers" ON public.fact_purchase
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  );

-- 3. po_register
CREATE POLICY "Allow read access for all authenticated users" ON public.po_register
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access for admins and ops managers" ON public.po_register
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  );

-- 4. po_line_items
CREATE POLICY "Allow read access for all authenticated users" ON public.po_line_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access for admins and ops managers" ON public.po_line_items
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  );

-- 5. sales_snapshot
CREATE POLICY "Allow read access for all authenticated users" ON public.sales_snapshot
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access for admins and ops managers" ON public.sales_snapshot
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  );

-- 6. inventory_snapshot
CREATE POLICY "Allow read access for all authenticated users" ON public.inventory_snapshot
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access for admins and ops managers" ON public.inventory_snapshot
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  );

-- 7. fact_inventory_planning
CREATE POLICY "Allow read access for all authenticated users" ON public.fact_inventory_planning
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access for admins and ops managers" ON public.fact_inventory_planning
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  );

-- 8. demand_metrics
CREATE POLICY "Allow read access for all authenticated users" ON public.demand_metrics
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access for admins and ops managers" ON public.demand_metrics
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  );

-- 9. locad_upload_log
CREATE POLICY "Allow read access for all authenticated users" ON public.locad_upload_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access for admins and ops managers" ON public.locad_upload_log
  FOR ALL TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN ('Administrator', 'Operations Mgr')
  );
