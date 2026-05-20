-- =========================================================
-- 044_alter_invoices_table_max_items.sql
-- Alter public.invoices table to support page layout splits
-- =========================================================

ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS max_items_page1 INTEGER NOT NULL DEFAULT 5;
