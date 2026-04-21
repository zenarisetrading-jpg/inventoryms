-- 005_noon_minutes_channel.sql
-- Expand sales_snapshot channel CHECK constraint to include 'noon_minutes'.
-- Noon Minutes orders come through a separate fulfilment model (dark-store / express)
-- and have different velocity patterns than regular FBN, so they must be tracked separately.

ALTER TABLE sales_snapshot
  DROP CONSTRAINT IF EXISTS sales_snapshot_channel_check;

ALTER TABLE sales_snapshot
  ADD CONSTRAINT sales_snapshot_channel_check
  CHECK (channel IN ('amazon', 'noon', 'noon_minutes'));
