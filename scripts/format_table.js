const fs = require('fs');
const { g1, g2, g3, g4 } = JSON.parse(fs.readFileSync('scripts/groups_data.json', 'utf8'));

console.log('### Group 1: Active + OOS + Sold in Last 120 Days (' + g1.length + ' SKUs)');
console.log('| # | SKU | Product Name | 120d Units | 120d Revenue | Last Sale Date | Suggested Reorder | Pending Reorder | Action |');
console.log('|---|---|---|---:|---:|:---:|---:|---:|:---|');
g1.forEach((d, i) => {
  const shortName = d.name.replace(/\|/g, '-');
  console.log(`| ${i+1} | \`${d.sku}\` | ${shortName} | ${d.sales_120d} | AED ${Math.round(d.revenue_120d).toLocaleString()} | ${d.last_sale_date || 'N/A'} | ${d.suggested_reorder_qty} | ${d.pending_qty_to_reorder} | ${d.recommended_action} |`);
});

console.log('\n### Group 2: Active + OOS + No Sales in Last 120 Days (' + g2.length + ' SKUs)');
console.log('| # | SKU | Product Name | All-Time Units | Last Sale Date | Action |');
console.log('|---|---|---|---:|:---:|:---|');
g2.forEach((d, i) => {
  const shortName = d.name.replace(/\|/g, '-');
  console.log(`| ${i+1} | \`${d.sku}\` | ${shortName} | ${d.sales_all_time} | ${d.last_sale_date || 'N/A'} | ${d.recommended_action} |`);
});

console.log('\n### Group 3: Active + No Sales History (' + g3.length + ' SKU)');
console.log('| # | SKU | Product Name | Action |');
console.log('|---|---|---|:---|');
g3.forEach((d, i) => {
  const shortName = d.name.replace(/\|/g, '-');
  console.log(`| ${i+1} | \`${d.sku}\` | ${shortName} | ${d.recommended_action} |`);
});

console.log('\n### Group 4: Inactive Listings (' + g4.length + ' SKUs)');
console.log('| # | SKU | Product Name | Total Stock | Action |');
console.log('|---|---|---|---:|:---|');
g4.forEach((d, i) => {
  const shortName = d.name.replace(/\|/g, '-');
  console.log(`| ${i+1} | \`${d.sku}\` | ${shortName} | ${d.total_available} | ${d.recommended_action} |`);
});
