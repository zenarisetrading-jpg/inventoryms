# Inventory Allocation Logic Bug Fix

## The Symptom
Users observed that certain SKUs were showing a suggested allocation of **1 box** to Amazon FBA, despite having extremely high coverage (e.g., 720 days). These SKUs typically had low sales velocity (e.g., 0.03 sales/day) and enough stock on hand (e.g., 24 units) to last for a long time. 

## The Root Cause
The issue originated in the SQL logic that generates the `fact_inventory_planning` view (specifically in `supabase/migrations/011_consolidated_planning_refresh.sql` and `apply_update.sql`).

There were two specific issues identified:

### 1. The "Less Than A Box" Forced Allocation
The allocation logic for FBA (and FBN/Minutes) included a hardcoded override:

```sql
WHEN fba_units < units_per_box AND amazon_sv > 0 THEN
  GREATEST(1, ...)
```

**What this did:** If a SKU had fewer units at FBA than a full box (e.g., 24 units vs a `units_per_box` of 25) AND it had any sales velocity (`amazon_sv > 0`), the system would **always** suggest sending at least 1 box. 

**Why it was a problem:** This rule completely ignored the actual sales velocity. For a slow-moving item selling 0.03 units a day, 24 units provides 720 days of coverage. However, because 24 is less than 25, the system was blindly forcing another box of 25 to be sent, leading to overstocking and potential long-term storage fees.

### 2. The `units_per_box` NULL Evaluation Bug
A secondary bug existed in the `suggested_reorder_qty` calculation:

```sql
CASE
  WHEN GREATEST( shortfall, 0 ) < NULLIF(units_per_box, 0) THEN 0
  ...
  ELSE GREATEST( moq, ... )
END
```

**What this did:** If a SKU had a missing or zero `units_per_box`, `NULLIF` returned `NULL`. In PostgreSQL, comparing a number against `NULL` (e.g., `0 < NULL`) results in `NULL`, which the `WHEN` clause evaluates as `FALSE`. 
Because it failed the `WHEN` clause, it fell back to the `ELSE` clause which returned `GREATEST(moq, NULL)`, evaluating to the item's MOQ (usually 1). This caused the system to recommend a reorder of 1 unit even when no shortfall existed.

---

## The Solution

We updated both `011_consolidated_planning_refresh.sql` and `apply_update.sql` to implement the following fixes:

### 1. Removed the Forced Box Allocation
We removed the `WHEN fba_units < units_per_box AND amazon_sv > 0 THEN GREATEST(1, ...)` override completely. 

The logic now relies purely on the mathematical shortfall. It calculates how many units you need for the next 30 days (`amazon_required_30`). If you have 24 units and only need 1, the shortfall is 0, resulting in `0` boxes being suggested.

*(Note: The logic that sends 1 box if a SKU is completely out of stock (`fba_units <= 0`) and has zero sales was intentionally preserved to allow for inventory "seeding" of dead/new items).*

### 2. Added Safe NULL Handling
We wrapped the `NULLIF` checks in a `COALESCE` function across the `suggested_reorder_qty` calculation:

```sql
COALESCE(NULLIF(units_per_box, 0), 1)
```

This guarantees that if `units_per_box` is missing or zero, the system treats it as `1` for the purpose of the calculation, ensuring that `0 < 1` correctly evaluates to `TRUE` and sets the reorder quantity to `0` when there is no shortfall.
