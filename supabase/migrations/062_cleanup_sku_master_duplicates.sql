

-- To fix duplicates in sku_master (keeping the most recently updated row)
DELETE FROM public.sku_master
WHERE id NOT IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY sku, country
                   ORDER BY created_at DESC, id
               ) as rn
        FROM public.sku_master
    ) sub
    WHERE rn = 1
);

-- Re-apply the proper unique constraint on sku_master
ALTER TABLE public.sku_master DROP CONSTRAINT IF EXISTS sku_master_sku_country_key;
ALTER TABLE public.sku_master ADD CONSTRAINT sku_master_sku_country_key UNIQUE (sku, country);

-- Refresh the dashboard view to drop the duplicates
SELECT refresh_fact_inventory_planning();
