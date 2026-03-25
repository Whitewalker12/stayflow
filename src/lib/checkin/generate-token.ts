import { createServiceClient } from '@/lib/supabase/service'

/**
 * Generate a 12-character URL-safe token and store it in checkin_tokens.
 *
 * Uses the service client (bypasses RLS) — call only from server-side code.
 * Token expires 48 hours after creation (DB default).
 *
 * @returns The 12-char token string (the path segment for /checkin/[token])
 */
export async function generateCheckinToken(bookingId: string): Promise<string> {
  // randomBytes(9) → 12 base64url chars (3 bytes encodes to 4 chars)
  const { randomBytes } = await import('node:crypto')
  const token = randomBytes(9).toString('base64url')

  const supabase = createServiceClient()
  const { error } = await supabase.from('checkin_tokens').insert({
    token,
    booking_id: bookingId,
    // expires_at defaults to now() + INTERVAL '48 hours' via DB
  })

  if (error) {
    throw new Error(`generateCheckinToken: ${error.message}`)
  }

  return token
}
