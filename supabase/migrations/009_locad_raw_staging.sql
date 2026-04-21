-- 009_locad_raw_staging.sql
-- Stores every row returned by the Locad API before FNSKU matching.
-- Purpose: audit tool for diagnosing stale/missing SKU maps.
-- Each API sync run is identified by sync_run_id (UUID generated at sync start).

CREATE TABLE locad_raw_staging (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id   UUID NOT NULL,          -- groups all rows from one sync call
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  locad_sku     TEXT NOT NULL,           -- raw SKU from Locad API (product.sku)
  locad_upc     TEXT,                    -- raw UPC from Locad API (= FNSKU when present)
  available     INTEGER NOT NULL DEFAULT 0,

  -- Resolution result (filled during the same sync run)
  matched_sku   TEXT REFERENCES sku_master(sku) ON DELETE SET NULL,
  match_method  TEXT CHECK (match_method IN ('fnsku', 'unmatched')),

  UNIQUE (sync_run_id, locad_sku)
);

-- Index for fast "show me all unmatched rows from latest run" queries
CREATE INDEX locad_raw_staging_sync_run_id   ON locad_raw_staging (sync_run_id);
CREATE INDEX locad_raw_staging_unmatched     ON locad_raw_staging (sync_run_id) WHERE match_method = 'unmatched';
CREATE INDEX locad_raw_staging_locad_upc     ON locad_raw_staging (locad_upc);

-- RLS
ALTER TABLE locad_raw_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all"          ON locad_raw_staging FOR ALL TO authenticated   USING (true);
CREATE POLICY "service_role_all"  ON locad_raw_staging FOR ALL TO service_role    USING (true);
