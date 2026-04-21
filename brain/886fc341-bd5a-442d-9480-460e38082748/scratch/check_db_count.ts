
import { createClient } from 'https://esm.sh/@supabase/supabase-client@2.39.3'

const supabase = createClient(
  '${import.meta.env.VITE_SUPABASE_URL}',
  '${import.meta.env.VITE_SUPABASE_ANON_KEY}'
)

async function check() {
  const { count, error } = await supabase
    .from('fact_inventory_planning')
    .select('*', { count: 'exact', head: true })

  if (error) {
    console.error('Error fetching count:', error)
  } else {
    console.log('Row count in fact_inventory_planning:', count)
  }
}

check()
