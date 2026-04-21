-- Add in_transit_allocation_units to demand_metrics
-- Tracks units from approved/shipped allocation plans (Locad → FBA/Noon)
-- that are no longer in Locad's available quantity but not yet fulfillable
-- at the destination node. Included in projected_coverage to prevent
-- false SHIP_NOW / REORDER triggers during the transit window.

ALTER TABLE demand_metrics
  ADD COLUMN IF NOT EXISTS in_transit_allocation_units NUMERIC DEFAULT 0;
