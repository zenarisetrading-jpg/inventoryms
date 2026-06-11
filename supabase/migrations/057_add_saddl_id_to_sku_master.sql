-- Add saddl_id column
ALTER TABLE sku_master ADD COLUMN IF NOT EXISTS saddl_id TEXT;

-- Update existing records based on country
UPDATE sku_master
SET saddl_id = CASE
    WHEN country = 'UAE' THEN 's2c_uae_test'
    WHEN country = 'KSA' THEN 's2c_test'
    ELSE saddl_id
END;
