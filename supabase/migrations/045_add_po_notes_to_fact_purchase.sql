-- 045_add_po_notes_to_fact_purchase.sql
-- Add a separate column po_notes TEXT to fact_purchase to store general PO notes separately from SKU notes

ALTER TABLE fact_purchase ADD COLUMN IF NOT EXISTS po_notes TEXT;
