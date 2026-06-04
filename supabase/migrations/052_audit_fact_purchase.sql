-- 052_audit_fact_purchase.sql
-- Add an audit log to fact_purchase to track who changes what.

ALTER TABLE public.fact_purchase ADD COLUMN IF NOT EXISTS updated_by TEXT;

CREATE TABLE IF NOT EXISTS public.audit_fact_purchase (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID NOT NULL,
    po_number TEXT,
    operation TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    old_data JSONB,
    new_data JSONB,
    changed_by TEXT,
    changed_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying audit logs quickly
CREATE INDEX IF NOT EXISTS idx_audit_fact_purchase_record_id ON public.audit_fact_purchase(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_fact_purchase_po_number ON public.audit_fact_purchase(po_number);

-- Trigger function
CREATE OR REPLACE FUNCTION public.trg_audit_fact_purchase_func()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_fact_purchase (record_id, po_number, operation, old_data, changed_by)
        VALUES (OLD.id, OLD.po_number, 'DELETE', to_jsonb(OLD), COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'email', OLD.updated_by));
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.audit_fact_purchase (record_id, po_number, operation, old_data, new_data, changed_by)
        VALUES (NEW.id, NEW.po_number, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), NEW.updated_by);
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_fact_purchase (record_id, po_number, operation, new_data, changed_by)
        VALUES (NEW.id, NEW.po_number, 'INSERT', to_jsonb(NEW), NEW.updated_by);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_audit_fact_purchase ON public.fact_purchase;
CREATE TRIGGER trg_audit_fact_purchase
AFTER INSERT OR UPDATE OR DELETE ON public.fact_purchase
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_fact_purchase_func();
