-- Migration: 030_update_noon_minutes_schemas.sql
-- Drop and recreate tables with new schemas provided by user

DROP TABLE IF EXISTS public.minutes_sales;
CREATE TABLE public.minutes_sales (
    country_code   VARCHAR(10),
    order_nr       VARCHAR(255),
    item_nr        VARCHAR(255),
    order_date     DATE,
    sku            VARCHAR(255),
    title_en       VARCHAR(1000),
    title_ar       VARCHAR(2000),
    brand_en       VARCHAR(255),
    brand_ar       VARCHAR(255),
    currency_code  VARCHAR(10),
    price          DECIMAL(10,2),
    partner_sku    VARCHAR(255),
    item_status    VARCHAR(100),
    return_date    DATE,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DROP TABLE IF EXISTS public.noon_sales;
CREATE TABLE public.noon_sales (
    id_partner           BIGINT,
    src_country          VARCHAR(10),
    country_code         VARCHAR(10),
    dest_country         VARCHAR(10),
    bayan_nr             VARCHAR(255),
    item_nr              VARCHAR(255),
    partner_sku          VARCHAR(255),
    sku                  VARCHAR(255),
    status               VARCHAR(100),
    offer_price          DECIMAL(10,2),
    gmv_lcy              DECIMAL(10,2),
    currency_code        VARCHAR(10),
    brand_code           VARCHAR(100),
    family               VARCHAR(255),
    fulfillment_model    VARCHAR(255),
    order_timestamp      TIMESTAMP,
    shipment_timestamp   TIMESTAMP,
    delivered_timestamp  TIMESTAMP,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_noon_sales_sku ON public.noon_sales(sku);
CREATE INDEX IF NOT EXISTS idx_minutes_sales_sku ON public.minutes_sales(sku);
CREATE INDEX IF NOT EXISTS idx_minutes_sales_order_date ON public.minutes_sales(order_date);
