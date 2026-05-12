
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://eiezhzlpirdiqsotvogx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg'
const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data, count, error } = await supabase.from('sku_master').select('*', { count: 'exact', head: true })
  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Count:', count)
  }
}

check()
