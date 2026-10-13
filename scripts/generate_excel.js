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

  // Metrics
  const totalCatalog = data.length;
  const activeSKUs = data.filter(d => d.listing_status === 'Active');
  const inactiveSKUs = data.filter(d => d.listing_status === 'Inactive');
  const activeAmazonListings = data.filter(d => d.is_active && d.amazon_listing_status === 'Active').length;
  const activeNoonListings = data.filter(d => d.is_active && d.noon_listing_status === 'Active').length;
  const amzOOS = data.filter(d => d.is_active && d.fba_available === 0).length;
  const noonOOS = data.filter(d => d.is_active && d.noon_available === 0).length;
  const bothOOS = data.filter(d => d.is_active && d.fba_available === 0 && d.noon_available === 0).length;
  const noSales120d = data.filter(d => d.is_active && d.sales_120d === 0).length;
  const discontReview = data.filter(d => d.recommended_action === 'REVIEW FOR DISCONTINUATION').length;
  const restockCandidates = data.filter(d => d.recommended_action === 'REORDER NOW' || d.recommended_action === 'REORDER SOON').length;
  const inactiveWithStock = data.filter(d => !d.is_active && d.total_available > 0).length;
  const totalAvailableStock = data.reduce((acc, c) => acc + (c.total_available || 0), 0);
  const totalNetReorder = data.reduce((acc, c) => acc + (c.pending_qty_to_reorder || 0), 0);

  // 1. Summary Sheet
  const summaryData = [
    ['SADDL INVENTORY OS — SKU INTELLIGENCE & OOS DECISION SYSTEM'],
    ['Marketplace / Region', 'UAE (United Arab Emirates)'],
    ['Account ID', 's2c_uae_test'],
    ['Generated At', new Date().toISOString()],
    [],
    ['METRIC', 'COUNT / VALUE', 'SCOPE & BUSINESS MEANING'],
    ['Total Unique Catalog SKUs', totalCatalog, 'All catalog items in sku_master'],
    ['Active Catalog SKUs', activeSKUs.length, 'Master active status (is_active = true)'],
    ['Inactive Catalog SKUs', inactiveSKUs.length, 'Master inactive status (is_active = false)'],
    ['Active Amazon FBA Listings', activeAmazonListings, 'Active and listed on Amazon UAE'],
    ['Active Noon Listings', activeNoonListings, 'Active and listed on Noon UAE'],
    [],
    ['--- MARKETPLACE OOS & INVENTORY BREAKDOWN ---'],
    ['Amazon FBA Out of Stock', amzOOS, 'Active SKUs with 0 available FBA units'],
    ['Noon Out of Stock', noonOOS, 'Active SKUs with 0 available units across FBN & Minutes'],
    ['Out of Stock on Both Marketplaces', bothOOS, 'Active SKUs with 0 stock on Amazon AND 0 stock on Noon'],
    ['No Sales in Last 120 Days', noSales120d, 'Active SKUs with 0 verified units sold across all channels'],
    ['Review for Discontinuation', discontReview, 'CRITICAL: OOS with 0 sales in 120d and reorder suggested; review before spending money'],
    ['Replenishment Candidates', restockCandidates, 'URGENT: Stockout or low stock with proven recent demand in 120d'],
    ['Inactive Listings with Inventory', inactiveWithStock, 'Stranded stock on inactive listings needing investigation'],
    [],
    ['--- TOTAL INVENTORY & CAPITAL ALLOCATION ---'],
    ['Total Available Sellable Units', totalAvailableStock, 'Sum of FBA, FBN, Minutes, and Locad warehouse stock'],
    ['Total Net Quantity to Reorder', totalNetReorder, 'Total units recommended after deducting confirmed pipeline POs']
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 42 }, { wch: 18 }, { wch: 75 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

  // Format helper
  const mapRow = (d) => ({
    'SKU': d.sku,
    'Product Name': d.name,
    'ASIN': d.asin || '',
    'FNSKU': d.fnsku || '',
    'Category': d.category || d.product_category || '',
    'Global Listing Status': d.listing_status,
    'Recommended Action': d.recommended_action,
    'Recommendation Reason': d.recommendation_reason,
    'Review Status': d.review_decision || 'Pending Review',
    'Reviewer': d.reviewer_email || '',
    'Review Notes': d.review_notes || '',
    'Amazon Listing Status': d.amazon_listing_status,
    'Amazon FBA Available': d.fba_available,
    'Amazon 30d Sales': d.amz_sales_30d,
    'Amazon 120d Sales': d.amz_sales_120d,
    'Amazon Last Sale Date': d.amz_last_sale_date || 'None',
    'Amazon Action': d.amazon_recommended_action,
    'Noon Listing Status': d.noon_listing_status,
    'Noon Available': d.noon_available,
    'Noon 30d Sales': d.noon_sales_30d,
    'Noon 120d Sales': d.noon_sales_120d,
    'Noon Last Sale Date': d.noon_last_sale_date || 'None',
    'Noon Action': d.noon_recommended_action,
    'Combined Available Stock': d.total_available,
    'Combined 30d Sales': d.sales_30d,
    'Combined 120d Sales': d.sales_120d,
    'Combined 120d Revenue (AED)': Math.round(d.revenue_120d || 0),
    'Combined Last Sale Date': d.last_sale_date || 'None',
    'Days Since Last Sale': d.days_since_last_sale !== null ? d.days_since_last_sale : 'N/A',
    'Supplier Lead Time (Days)': d.lead_time_days,
    'MOQ': d.moq,
    'Already Ordered (Incoming PO)': d.already_ordered,
    'Suggested Reorder Qty': d.suggested_reorder_qty,
    'Pending Qty to Reorder': d.pending_qty_to_reorder
  });

  // 2. Discontinuation Review Sheet
  const discontItems = data.filter(d => d.recommended_action === 'REVIEW FOR DISCONTINUATION')
    .sort((a,b) => (b.moq || 0) - (a.moq || 0));
  const wsDiscont = XLSX.utils.json_to_sheet(discontItems.map(mapRow));
  XLSX.utils.book_append_sheet(wb, wsDiscont, 'Discontinuation Review');

  // 3. Replenishment Candidates Sheet
  const restockItems = data.filter(d => d.recommended_action === 'REORDER NOW' || d.recommended_action === 'REORDER SOON')
    .sort((a,b) => b.sales_120d - a.sales_120d);
  const wsRestock = XLSX.utils.json_to_sheet(restockItems.map(mapRow));
  XLSX.utils.book_append_sheet(wb, wsRestock, 'Restock Candidates');

  // 4. Amazon OOS Analysis Sheet
  const amzOosItems = data.filter(d => d.is_active && d.fba_available === 0)
    .sort((a,b) => b.sales_120d - a.sales_120d);
  const wsAmz = XLSX.utils.json_to_sheet(amzOosItems.map(mapRow));
  XLSX.utils.book_append_sheet(wb, wsAmz, 'Amazon FBA OOS');

  // 5. Full Catalog Sheet (174 SKUs)
  const fullItems = [...data].sort((a,b) => b.sales_120d - a.sales_120d);
  const wsFull = XLSX.utils.json_to_sheet(fullItems.map(mapRow));
  XLSX.utils.book_append_sheet(wb, wsFull, 'Full Catalog (174 SKUs)');

  // Output paths: public directory for web download, and brain artifact
  const fileName = 'SADDL_UAE_SKU_Intelligence_OOS_Breakdown.xlsx';
  const outPathPublic = path.join(process.cwd(), 'frontend', 'public', fileName);

  XLSX.writeFile(wb, outPathPublic);
  console.log(`Excel file generated successfully:\nFrontend Public: ${outPathPublic}`);
}

buildExcel();
