-- 010_add_node_sv.sql
-- Add amazon_sv and noon_sv to demand_metrics to allow node-specific coverage calculations

ALTER TABLE demand_metrics
ADD COLUMN IF NOT EXISTS amazon_sv NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS noon_sv NUMERIC DEFAULT 0;
