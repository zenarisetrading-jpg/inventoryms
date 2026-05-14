-- Migration: 029_create_noon_minutes_raw_tables.sql
-- Create tables for raw detailed sales data from Noon and Minutes

CREATE TABLE IF NOT EXISTS public.noon_sales (
    id_partner          BIGINT,
    src_country         TEXT,
    country_code        TEXT,
    dest_country        TEXT,
    bayan_nr            TEXT,
    item_nr             TEXT,
    partner_sku         TEXT,
    sku                 TEXT,
    status              TEXT,
    offer_price         DECIMAL(10, 2),
    gmv_lcy             DECIMAL(10, 2),
    currency_code       TEXT,
    brand_code          TEXT,
    family              TEXT,
    fulfillment_model   TEXT,
    order_timestamp     TIMESTAMP,
    shipment_timestamp  TIMESTAMP,
    delivered_timestamp TIMESTAMP,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.minutes_sales (
    id_partner          BIGINT,
    src_country         TEXT,
    country_code        TEXT,
    dest_country        TEXT,
    bayan_nr            TEXT,
    item_nr             TEXT,
    partner_sku         TEXT,
    sku                 TEXT,
    status              TEXT,
    offer_price         DECIMAL(10, 2),
    gmv_lcy             DECIMAL(10, 2),
    currency_code       TEXT,
    brand_code          TEXT,
    family              TEXT,
    fulfillment_model   TEXT,
    order_timestamp     TIMESTAMP,
    shipment_timestamp  TIMESTAMP,
    delivered_timestamp TIMESTAMP,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_noon_sales_sku ON public.noon_sales(sku);
CREATE INDEX IF NOT EXISTS idx_noon_sales_order_time ON public.noon_sales(order_timestamp);

CREATE INDEX IF NOT EXISTS idx_minutes_sales_sku ON public.minutes_sales(sku);
CREATE INDEX IF NOT EXISTS idx_minutes_sales_order_time ON public.minutes_sales(order_timestamp);
