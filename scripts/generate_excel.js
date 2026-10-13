const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('frontend/.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function buildExcel() {
  console.log('Fetching live SKU intelligence data from Supabase...');
  const { data, error } = await supabase.rpc('get_sku_intelligence', {
    p_country: 'UAE',
    p_saddl_id: 's2c_uae_test'
  });

  if (error) {
    console.error('Error fetching data:', error);
    return;
  }

  const wb = XLSX.utils.book_new();

  // 1. Summary Sheet
  const totalCatalog = data.length;
  const activeListings = data.filter(d => d.listing_status === 'Active').length;
  const inactiveListings = data.filter(d => d.listing_status === 'Inactive').length;
  const totalOOS = data.filter(d => d.total_available === 0).length;
  const activeOOS120d = data.filter(d => d.sku_classification === 'Active + OOS + Sold in Last 120 Days').length;
  const activeOOSNoSales = data.filter(d => d.sku_classification === 'Active + OOS + No Sales in Last 120 Days').length;
  const activeNoSales = data.filter(d => d.sku_classification === 'Active + No Sales History').length;
  const activeLowStock = data.filter(d => d.sku_classification === 'Active + Low Stock').length;
  const activeInStock = data.filter(d => d.sku_classification === 'Active + In Stock').length;
  const inactiveOOS = data.filter(d => d.sku_classification === 'Inactive + OOS').length;
  const totalAvailableStock = data.reduce((acc, c) => acc + (c.total_available || 0), 0);
  const totalNetReorder = data.reduce((acc, c) => acc + (c.pending_qty_to_reorder || 0), 0);

  const summaryData = [
    ['SADDL INVENTORY OS — SKU AVAILABILITY & REORDER INTELLIGENCE REPORT'],
    ['Marketplace / Region', 'UAE (United Arab Emirates)'],
    ['Account ID', 's2c_uae_test'],
    ['Generated At', new Date().toISOString()],
    [],
    ['METRIC', 'COUNT / VALUE', 'NOTES & INTELLIGENCE CONTEXT'],
    ['Total Unique Catalog SKUs', totalCatalog, 'All distinct SKUs in sku_master & fact_inventory_planning'],
    ['Active Marketplace Listings', activeListings, 'Active and eligible to sell on Amazon UAE or Noon'],
    ['Inactive Marketplace Listings', inactiveListings, 'Closed, deleted, or suppressed listings'],
    [],
    ['--- OUT OF STOCK & REORDER CLASSIFICATION ---'],
    ['Total Out of Stock SKUs', totalOOS, 'All SKUs with 0 total sellable units across all channels'],
    ['Active OOS · Sold in Last 120 Days', activeOOS120d, 'PRIORITY 1 REPLENISHMENT: Active listings losing sales due to stockouts'],
    ['Active OOS · No Sales in Last 120 Days', activeOOSNoSales, 'INVESTIGATE: Sold historically (>120d ago), verify seasonal/lifecycle demand'],
    ['Active · No Sales History', activeNoSales, 'AUDIT: New or unproven product with zero lifetime orders'],
    ['Inactive · Out of Stock', inactiveOOS, 'NO PURCHASE: Inactive listings with zero inventory'],
    [],
    ['--- IN STOCK HEALTH ---'],
    ['Active · Low Stock (<21d Coverage)', activeLowStock, 'At high risk of stockout within supplier lead time'],
    ['Active · In Stock (Healthy)', activeInStock, 'Active listings with balanced coverage (>21 days)'],
    ['Total Available Sellable Units', totalAvailableStock, 'Sum of FBA, FBN, Minutes, and Locad warehouse stock'],
    ['Total Net Replenishment Required', totalNetReorder, 'Total units recommended after deducting existing purchase orders']
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 40 }, { wch: 22 }, { wch: 65 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary Dashboard');

  // Helper function to map rows
  const mapGroup1 = (d) => ({
    'SKU': d.sku,
    'Product Name': d.name,
    'ASIN': d.asin || '',
    'FNSKU': d.fnsku || '',
    'Category': d.category || d.product_category || '',
    '120d Units Sold': d.sales_120d,
    '120d Revenue (AED)': Math.round(d.revenue_120d),
    '30d Units Sold': d.sales_30d,
    '7d Units Sold': d.sales_7d,
    'Last Sale Date': d.last_sale_date || 'N/A',
    'Days Since Last Sale': d.days_since_last_sale !== null ? d.days_since_last_sale : 'N/A',
    'Average Daily Sales (30d)': d.ads_30d,
    'Average Daily Sales (120d)': d.ads_120d,
    'Supplier Lead Time (Days)': d.lead_time_days,
    'MOQ': d.moq,
    'Already Ordered (Incoming PO)': d.already_ordered,
    'Suggested Reorder Qty': d.suggested_reorder_qty,
    'Pending Qty to Reorder': d.pending_qty_to_reorder,
    'Recommended Action': d.recommended_action,
    'Justification Reason': d.recommendation_reason
  });

  // 2. Sheet 2: Active OOS Sold in Last 120 Days (Priority 1)
  const g1 = data.filter(d => d.sku_classification === 'Active + OOS + Sold in Last 120 Days')
    .sort((a,b) => b.sales_120d - a.sales_120d);
  const ws1 = XLSX.utils.json_to_sheet(g1.map(mapGroup1));
  ws1['!cols'] = [
    { wch: 22 }, { wch: 45 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
    { wch: 15 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 10 },
    { wch: 26 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 55 }
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Active OOS (120d Sellers)');

  // 3. Sheet 3: Active OOS No Sales in Last 120 Days (Investigate)
  const g2 = data.filter(d => d.sku_classification === 'Active + OOS + No Sales in Last 120 Days');
  const ws2 = XLSX.utils.json_to_sheet(g2.map(d => ({
    'SKU': d.sku,
    'Product Name': d.name,
    'ASIN': d.asin || '',
    'Category': d.category || d.product_category || '',
    'Lifetime Units Sold': d.sales_all_time,
    'Last Recorded Sale': d.last_sale_date || 'N/A',
    'Days Since Last Sale': d.days_since_last_sale !== null ? d.days_since_last_sale : 'N/A',
    'Supplier Lead Time (Days)': d.lead_time_days,
    'MOQ': d.moq,
    'Recommended Action': d.recommended_action,
    'Justification Reason': d.recommendation_reason
  })));
  ws2['!cols'] = [
    { wch: 22 }, { wch: 45 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
    { wch: 18 }, { wch: 20 }, { wch: 22 }, { wch: 10 }, { wch: 25 }, { wch: 55 }
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Active OOS (No 120d Sales)');

  // 4. Sheet 4: Active No Sales History
  const g3 = data.filter(d => d.sku_classification === 'Active + No Sales History');
  const ws3 = XLSX.utils.json_to_sheet(g3.map(d => ({
    'SKU': d.sku,
    'Product Name': d.name,
    'ASIN': d.asin || '',
    'Category': d.category || d.product_category || '',
    'Listing Status': d.listing_status,
    'Amazon Active': d.amazon_active ? 'Yes' : 'No',
    'Noon Active': d.noon_active ? 'Yes' : 'No',
    'Recommended Action': d.recommended_action,
    'Justification Reason': d.recommendation_reason
  })));
  ws3['!cols'] = [
    { wch: 22 }, { wch: 45 }, { wch: 14 }, { wch: 18 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 55 }
  ];
  XLSX.utils.book_append_sheet(wb, ws3, 'Active (No Sales History)');

  // 5. Sheet 5: Inactive Listings (46 SKUs)
  const g4 = data.filter(d => d.listing_status === 'Inactive');
  const ws4 = XLSX.utils.json_to_sheet(g4.map(d => ({
    'SKU': d.sku,
    'Product Name': d.name,
    'ASIN': d.asin || '',
    'Category': d.category || d.product_category || '',
    'Listing Status': d.listing_status,
    'Available Inventory': d.total_available,
    'Lifetime Units Sold': d.sales_all_time,
    'Last Sale Date': d.last_sale_date || 'N/A',
    'Recommended Action': d.recommended_action,
    'Justification Reason': d.recommendation_reason
  })));
  ws4['!cols'] = [
    { wch: 22 }, { wch: 45 }, { wch: 14 }, { wch: 18 }, { wch: 14 },
    { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 50 }
  ];
  XLSX.utils.book_append_sheet(wb, ws4, 'Inactive Listings (46 SKUs)');

  // 6. Sheet 6: Full 174 Catalog Master
  const wsFull = XLSX.utils.json_to_sheet(data.map(d => ({
    'SKU': d.sku,
    'Product Name': d.name,
    'ASIN': d.asin || '',
    'FNSKU': d.fnsku || '',
    'Category': d.category || '',
    'Product Category': d.product_category || '',
    'Listing Status': d.listing_status,
    'Amazon Active': d.amazon_active ? 'Yes' : 'No',
    'Noon Active': d.noon_active ? 'Yes' : 'No',
    'Inventory Status': d.inventory_status,
    'SKU Classification': d.sku_classification,
    'Total Available': d.total_available,
    'FBA Available': d.fba_available,
    'FBA Reserved': d.fba_reserved,
    'FBA Inbound': d.fba_inbound,
    'FBN Available': d.fbn_available,
    'Minutes Available': d.minutes_available,
    'Locad Available': d.locad_available,
    'Total Reserved': d.total_reserved,
    'Total Inbound': d.total_inbound,
    'Units Sold 30d': d.sales_30d,
    'Units Sold 60d': d.sales_60d,
    'Units Sold 90d': d.sales_90d,
    'Units Sold 120d': d.sales_120d,
    'Revenue 120d (AED)': Math.round(d.revenue_120d),
    'Lifetime Sales': d.sales_all_time,
    'Last Sale Date': d.last_sale_date || 'None',
    'Days Since Last Sale': d.days_since_last_sale !== null ? d.days_since_last_sale : 'N/A',
    'ADS 30d': d.ads_30d,
    'ADS 120d': d.ads_120d,
    'Days of Cover': d.days_of_cover !== null ? d.days_of_cover : 'N/A',
    'Stockout Risk': d.stockout_risk,
    'Velocity Trend': d.velocity_trend,
    'Supplier Lead Time (Days)': d.lead_time_days,
    'MOQ': d.moq,
    'Already Ordered (PO Pipeline)': d.already_ordered,
    'Earliest PO ETA': d.earliest_eta || 'N/A',
    'Suggested Reorder Qty': d.suggested_reorder_qty,
    'Pending Qty to Reorder': d.pending_qty_to_reorder,
    'Recommended Action': d.recommended_action,
    'Decision Justification': d.recommendation_reason,
    'Last Sync Timestamp': d.last_inventory_sync || ''
  })));
  XLSX.utils.book_append_sheet(wb, wsFull, 'Full Catalog (174 SKUs)');

  // Output paths: in project root, public directory for web download, and brain artifact
  const fileName = 'SADDL_UAE_SKU_Intelligence_OOS_Breakdown.xlsx';
  const outPathRoot = path.join(process.cwd(), fileName);
  const outPathPublic = path.join(process.cwd(), 'frontend', 'public', fileName);

  XLSX.writeFile(wb, outPathRoot);
  XLSX.writeFile(wb, outPathPublic);

  console.log(`Excel file generated successfully:\n1. Root: ${outPathRoot}\n2. Frontend Public: ${outPathPublic}`);
}

buildExcel();
