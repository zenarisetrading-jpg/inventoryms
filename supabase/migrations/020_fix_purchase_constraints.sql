-- 018_fix_purchase_constraints.sql
-- Allow 0 units during editing process

ALTER TABLE fact_purchase 
DROP CONSTRAINT IF EXISTS fact_purchase_units_ordered_check;

ALTER TABLE fact_purchase 
ADD CONSTRAINT fact_purchase_units_ordered_check CHECK (units_ordered >= 0);
