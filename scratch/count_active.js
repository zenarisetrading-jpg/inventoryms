
const fs = require('fs');
const content = fs.readFileSync('e:/Inventory-planner-main (2) (1)/Inventory-planner-main/supabase/migrations/014_dim_sku.sql', 'utf8');
const falseMatches = content.match(/false,/g) || [];
const trueMatches = content.match(/true,/g) || [];
console.log(`False: ${falseMatches.length}`);
console.log(`True: ${trueMatches.length}`);
console.log(`Total: ${falseMatches.length + trueMatches.length}`);
