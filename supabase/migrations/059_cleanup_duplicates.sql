-- 059_cleanup_duplicates.sql
-- This script cleans up duplicate records in sales_snapshot and inventory_snapshot 
-- that cause the dashboard numbers to double.

-- 1. Clean up inventory_snapshot duplicates (e.g. where warehouse_name changed from NULL to a string)
-- We keep the most recently synced record for each sku + node + snapshot_date.
DELETE FROM public.inventory_snapshot
WHERE id NOT IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY sku, node, snapshot_date 
                   ORDER BY synced_at DESC, id
               ) as rn
        FROM public.inventory_snapshot
    ) sub
    WHERE rn = 1
);

-- 2. Clean up sales_snapshot duplicates
-- Keep only the most recently synced record for each sku + date + channel
DELETE FROM public.sales_snapshot
WHERE id NOT IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY sku, date, channel 
                   ORDER BY synced_at DESC, id
               ) as rn
        FROM public.sales_snapshot
    ) sub
    WHERE rn = 1
);

-- 3. Refresh the planning table to apply the corrected numbers
SELECT refresh_fact_inventory_planning();
