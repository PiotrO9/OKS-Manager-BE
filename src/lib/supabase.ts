import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL as string
  const key = process.env.SUPABASE_ANON_KEY as string

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY')
  }

  return createClient(url, key)
}

export { getSupabaseClient }
