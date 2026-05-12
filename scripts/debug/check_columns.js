
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://eiezhzlpirdiqsotvogx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'sku_master' })
  if (error) {
    // If RPC doesn't exist, try another way
    const { data: cols, error: err2 } = await supabase.from('sku_master').select('*').limit(0)
    if (err2) {
        console.error('Error:', err2)
    } else {
        console.log('Columns:', Object.keys(cols?.[0] || {}))
    }
  } else {
    console.log('Columns:', data)
  }
}

check()
