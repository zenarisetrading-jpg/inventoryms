-- 082_auto_activate_sku_on_stock.sql
-- Automatically mark a SKU as Active if it has available stock in any sales channel.
-- The SKU status (is_active) is set to true whenever the stock quantity in at least one channel is greater than zero.

CREATE OR REPLACE FUNCTION public.auto_activate_sku_on_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- If available stock is greater than 0, activate the SKU
    IF NEW.available > 0 THEN
        UPDATE public.sku_master 
        SET is_active = true 
        WHERE sku = NEW.sku 
          AND country = NEW.country 
          AND is_active = false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_activate_sku ON public.inventory_snapshot;

CREATE TRIGGER trg_auto_activate_sku
AFTER INSERT OR UPDATE ON public.inventory_snapshot
FOR EACH ROW
EXECUTE FUNCTION public.auto_activate_sku_on_stock();

-- Backfill: Activate any SKUs that currently have stock in any channel
UPDATE public.sku_master sm
SET is_active = true
WHERE is_active = false
  AND EXISTS (
    SELECT 1 
    FROM public.inventory_snapshot i 
    WHERE i.sku = sm.sku 
      AND i.country = sm.country 
      AND i.available > 0
  );
