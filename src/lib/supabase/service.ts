import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client using the service role key.
 *
 * USE ONLY in server-side code (API routes, cron jobs, webhooks).
 * This client bypasses RLS — never expose it to the browser or import it
 * from any file that is not a server-only module.
 *
 * Required env var: SUPABASE_SERVICE_ROLE_KEY
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'Check your .env.local file.'
    )
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      // Disable auto-refresh and session persistence — not needed server-side
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
