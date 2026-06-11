-- 050_fact_purchase_country.sql

ALTER TABLE public.fact_purchase ADD COLUMN IF NOT EXISTS country VARCHAR(10) DEFAULT 'UAE';

-- Note: No need to drop constraints or anything since id is the primary key.
