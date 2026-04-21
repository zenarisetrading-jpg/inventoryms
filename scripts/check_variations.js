const URL = "https://eiezhzlpirdiqsotvogx.supabase.co/rest/v1/sku_master?sku=ilike.*GREYNEW*&select=sku,is_active,created_at"
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
// Wait, I suspect RLS is blocking. I'll use the check_dashboard_oos logic instead which uses /dashboard
// Or I'll use the /skus? endpoint if it exists
// Let's check /rest/v1/demand_metrics which has no RLS on read? No, it has.
async function check() {
    const dashboards = await fetch('https://eiezhzlpirdiqsotvogx.supabase.co/functions/v1/dashboard', {
        headers: { 'Authorization': `Bearer ${ANON_KEY}` }
    }).then(res => res.json())

    const allOos = [...dashboards.oos_skus_amazon, ...dashboards.oos_skus_noon]
    const variations = allOos.filter(a => a.sku.includes('GREYNEW'))
    console.log('Variations Found:', variations)
}
check()
