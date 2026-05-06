-- 011_create_fact_purchase.sql
-- Flattened purchase details table

CREATE TABLE IF NOT EXISTS fact_purchase (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_number TEXT NOT NULL,
    po_name TEXT,
    supplier TEXT NOT NULL,
    order_date DATE NOT NULL,
    eta DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'ordered',
    tracking_number TEXT,
    sku TEXT NOT NULL REFERENCES sku_master(sku),
    units_ordered INTEGER NOT NULL CHECK (units_ordered > 0),
    units_received INTEGER DEFAULT 0,
    units_per_box INTEGER,
    box_count NUMERIC(10,2),
    dimensions TEXT,
    cogs_per_unit NUMERIC(10,2),
    shipping_cost_per_unit NUMERIC(10,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for performance
CREATE INDEX idx_fact_purchase_po_number ON fact_purchase(po_number);
CREATE INDEX idx_fact_purchase_sku ON fact_purchase(sku);
CREATE INDEX idx_fact_purchase_status ON fact_purchase(status);

-- Migration of existing data
INSERT INTO fact_purchase (
    id,
    po_number,
    supplier,
    order_date,
    eta,
    status,
    sku,
    units_ordered,
    units_received,
    notes,
    created_at,
    updated_at
)
SELECT 
    li.id,
    r.po_number,
    r.supplier,
    r.order_date,
    r.eta,
    r.status::text,
    li.sku,
    li.units_ordered,
    li.units_received,
    r.notes,
    li.created_at,
    r.updated_at
FROM po_line_items li
JOIN po_register r ON li.po_id = r.id;
