const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg';

// Let's test the aggregation logic for SKU intelligence
async function testQuery() {
  const sql = `
  WITH sales_agg AS (
    SELECT 
      sku,
      SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN units_sold ELSE 0 END) AS sales_7d,
      SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '30 days' THEN units_sold ELSE 0 END) AS sales_30d,
      SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '60 days' THEN units_sold ELSE 0 END) AS sales_60d,
      SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '90 days' THEN units_sold ELSE 0 END) AS sales_90d,
      SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '120 days' THEN units_sold ELSE 0 END) AS sales_120d,
      SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '120 days' THEN COALESCE(revenue, 0) ELSE 0 END) AS revenue_120d,
      SUM(units_sold) AS sales_all_time,
      MAX(CASE WHEN units_sold > 0 THEN date ELSE NULL END) AS last_sale_date,
      BOOL_OR(date < CURRENT_DATE - INTERVAL '120 days' AND units_sold > 0) AS has_sales_before_120d
    FROM sales_snapshot
    WHERE country = 'UAE' AND saddl_id = 's2c_uae_test'
    GROUP BY sku
  )
  SELECT 
    sm.sku,
    sm.name,
    sm.is_active,
    sm.amazon_active,
    sm.noon_active,
    sm.moq,
    sm.lead_time_days,
    fip.fba_units,
    fip.fbn_units,
    fip.minutes_units,
    fip.locad_units,
    fip.stock_in_hand,
    fip.blended_sv,
    fip.total_coverage,
    fip.suggested_reorder_qty,
    fip.already_ordered,
    fip.pending_qty_to_reorder,
    COALESCE(sa.sales_7d, 0) AS sales_7d,
    COALESCE(sa.sales_30d, 0) AS sales_30d,
    COALESCE(sa.sales_60d, 0) AS sales_60d,
    COALESCE(sa.sales_90d, 0) AS sales_90d,
    COALESCE(sa.sales_120d, 0) AS sales_120d,
    COALESCE(sa.revenue_120d, 0) AS revenue_120d,
    COALESCE(sa.sales_all_time, 0) AS sales_all_time,
    sa.last_sale_date,
    sa.has_sales_before_120d
  FROM sku_master sm
  LEFT JOIN fact_inventory_planning fip 
    ON sm.sku = fip.sku AND fip.country = sm.country AND fip.saddl_id = sm.saddl_id
  LEFT JOIN sales_agg sa ON sm.sku = sa.sku
  WHERE sm.country = 'UAE' AND sm.saddl_id = 's2c_uae_test'
  LIMIT 5;
  `;

  // We can test this by checking against fact_inventory_planning and sales_snapshot directly
  console.log("SQL designed successfully.");
}

testQuery();
