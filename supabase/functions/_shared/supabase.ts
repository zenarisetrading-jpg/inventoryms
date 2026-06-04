import { createClient } from 'npm:@supabase/supabase-js@2'

export const getSupabaseAdmin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

export const getUserEmail = async (req: Request): Promise<string | null> => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email ?? null
}
