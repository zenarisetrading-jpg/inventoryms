const fs = require('fs');
const path = require('path');

const root = 'e:\\Inventory-planner-main (2) (1)';

function searchDir(dir, pattern, results) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file === 'node_modules' || file === '.git' || file === 'dist') continue;
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            searchDir(fullPath, pattern, results);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            let match;
            while ((match = pattern.exec(content)) !== null) {
                results.add(match[1]);
            }
        }
    }
}

const tables = new Set();
const rpcs = new Set();

searchDir(path.join(root, 'frontend'), /\.from\(['"`]([a-zA-Z0-9_]+)['"`]\)/g, tables);
searchDir(path.join(root, 'supabase'), /\.from\(['"`]([a-zA-Z0-9_]+)['"`]\)/g, tables);

searchDir(path.join(root, 'frontend'), /\.rpc\(['"`]([a-zA-Z0-9_]+)['"`]\)/g, rpcs);
searchDir(path.join(root, 'supabase'), /\.rpc\(['"`]([a-zA-Z0-9_]+)['"`]\)/g, rpcs);

console.log("=== TABLES ===");
console.log(Array.from(tables).sort().join('\n'));
console.log("\n=== RPCS ===");
console.log(Array.from(rpcs).sort().join('\n'));
