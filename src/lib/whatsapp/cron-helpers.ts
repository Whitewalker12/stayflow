/**
 * Shared utilities for cron job routes and manual notification triggers.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Today's date in IST as YYYY-MM-DD */
export function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/** Date string N days offset from today in IST */
export function offsetDateIST(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/**
 * Verify the request is authorized — accepts either:
 *   1. Vercel cron secret:  Authorization: Bearer {CRON_SECRET}
 *   2. Valid user session:  Supabase session cookie (for manual triggers from dashboard)
 *
 * Returns the owner_id if authenticated via session (for filtered manual runs),
 * or null if authenticated via cron secret (run all owners).
 *
 * Throws a Response if unauthorized.
 */
export async function verifyCronOrSession(
  request: NextRequest
): Promise<{ mode: 'cron'; ownerId: null } | { mode: 'session'; ownerId: string }> {
  // Check cron secret first (no DB round-trip)
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { mode: 'cron', ownerId: null }
  }

  // Fall back to session auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    return { mode: 'session', ownerId: user.id }
  }

  throw new Response(
    JSON.stringify({ error: 'Unauthorized' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  )
}

/** Derived pending amount label for payment reminder messages */
export function pendingLabel(paymentStatus: string, totalAmountPaise: number): {
  totalRupees: string
  paidRupees: string
  pendingRupees: string
} {
  const total = (totalAmountPaise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })

  switch (paymentStatus) {
    case 'paid':
    case 'refunded':
      return { totalRupees: total, paidRupees: total, pendingRupees: '0' }
    case 'partial':
      return { totalRupees: total, paidRupees: 'Partial', pendingRupees: 'Balance due' }
    case 'pending':
    default:
      return { totalRupees: total, paidRupees: '0', pendingRupees: total }
  }
}

/** Pending amount in paise — rough estimate from payment_status */
export function pendingAmountPaise(paymentStatus: string, totalAmountPaise: number): number {
  if (paymentStatus === 'paid' || paymentStatus === 'refunded') return 0
  return totalAmountPaise  // For 'pending' and 'partial' we show full total as worst-case
}
