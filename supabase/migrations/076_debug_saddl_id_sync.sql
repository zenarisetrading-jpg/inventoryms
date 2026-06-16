-- 076_debug_saddl_id_sync.sql
CREATE OR REPLACE FUNCTION debug_saddl_id_sync()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    r_uae_sku INT;
    r_ksa_sku INT;
    r_aurio_sku INT;
    r_null_sku INT;
    r_uae_sales INT;
    r_ksa_sales INT;
    r_aurio_sales INT;
BEGIN
    SELECT count(*) INTO r_uae_sku FROM sku_master WHERE saddl_id = 's2c_uae_test';
    SELECT count(*) INTO r_ksa_sku FROM sku_master WHERE saddl_id = 's2c_test';
    SELECT count(*) INTO r_aurio_sku FROM sku_master WHERE saddl_id = 'aurio_uae';
    SELECT count(*) INTO r_null_sku FROM sku_master WHERE saddl_id IS NULL OR saddl_id = 'none';

    SELECT count(*) INTO r_uae_sales FROM sales_snapshot WHERE saddl_id = 's2c_uae_test';
    SELECT count(*) INTO r_ksa_sales FROM sales_snapshot WHERE saddl_id = 's2c_test';
    SELECT count(*) INTO r_aurio_sales FROM sales_snapshot WHERE saddl_id = 'aurio_uae';

    RETURN json_build_object(
        'sku_master', json_build_object(
            's2c_uae_test', r_uae_sku,
            's2c_test', r_ksa_sku,
            'aurio_uae', r_aurio_sku,
            'null_or_none', r_null_sku
        ),
        'sales_snapshot', json_build_object(
            's2c_uae_test', r_uae_sales,
            's2c_test', r_ksa_sales,
            'aurio_uae', r_aurio_sales
        )
    );
END;
$$;
