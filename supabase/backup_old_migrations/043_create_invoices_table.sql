-- =========================================================
-- 043_create_invoices_table.sql
-- Create public.invoices table to save all input details, 
-- calculated output values, and up to 10 line items.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Document Headers & Settings
    invoice_title TEXT NOT NULL DEFAULT 'TAX INVOICE',
    title_font_size INTEGER NOT NULL DEFAULT 72,
    invoice_no TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    terms INTEGER NOT NULL DEFAULT 5,
    due_date TEXT NOT NULL,
    
    -- Seller Details
    seller_name TEXT,
    seller_address TEXT,
    seller_trn TEXT,
    
    -- Client Details
    buyer_name TEXT,
    buyer_address TEXT,
    buyer_trn TEXT,
    buyer_email TEXT,
    buyer_phone TEXT,
    
    -- Bank Account Details
    bank_name TEXT,
    bank_account TEXT,
    bank_iban TEXT,
    bank_swift TEXT,
    bank_type TEXT,
    beneficiary_name TEXT,
    
    -- Note & Remarks
    remarks TEXT,
    
    -- Calculated Output Values
    sub_total NUMERIC NOT NULL DEFAULT 0,
    vat NUMERIC NOT NULL DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0,
    amount_in_words TEXT NOT NULL,
    
    -- JSONB array containing exactly 10 line item records
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Enable Row Level Security
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid duplication
DROP POLICY IF EXISTS "public_all" ON public.invoices;
DROP POLICY IF EXISTS "service_role_all" ON public.invoices;

-- Create Policies to grant full CRUD permissions for development & production
CREATE POLICY "public_all" ON public.invoices FOR ALL TO public USING (true);
CREATE POLICY "service_role_all" ON public.invoices FOR ALL TO service_role USING (true);
