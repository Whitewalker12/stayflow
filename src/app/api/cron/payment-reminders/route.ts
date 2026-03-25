/**
 * GET /api/cron/payment-reminders
 *
 * Vercel cron: 0 4 * * *  (4:00 AM UTC = 9:30 AM IST)
 *
 * Sends payment reminder WhatsApp messages to owners for:
 *   - Advance due:  check-in is 2 days away, payment still pending/partial
 *   - Balance due:  check-in is today, payment still pending/partial
 *   - Overdue:      check-out was yesterday, guest checked out but payment unpaid
 *
 * Sends to OWNER only — she decides whether to follow up with the guest.
 *
 * Also called manually from /(dashboard)/settings/notifications.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendPaymentReminder } from '@/lib/whatsapp/send'
import { todayIST, offsetDateIST, verifyCronOrSession, pendingLabel } from '@/lib/whatsapp/cron-helpers'

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Auth ────────────────────────────────────────────────────────────────
  let mode: 'cron' | 'session'
  let sessionOwnerId: string | null = null

  try {
    const auth = await verifyCronOrSession(request)
    mode = auth.mode
    sessionOwnerId = auth.ownerId
  } catch (res) {
    return res as NextResponse
  }

  const today = todayIST()
  const inTwoDays = offsetDateIST(2)
  const yesterday = offsetDateIST(-1)

  const supabase = createServiceClient()

  // ── Build owner filter if running via session ───────────────────────────
  let ownerPropertyIds: string[] | null = null

  if (mode === 'session' && sessionOwnerId) {
    const { data: props } = await supabase
      .from('properties')
      .select('id')
      .eq('owner_id', sessionOwnerId)
      .is('deleted_at', null)

    ownerPropertyIds = (props ?? []).map((p) => p.id)
    if (ownerPropertyIds.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, today })
    }
  }

  // ── Shared query builder ────────────────────────────────────────────────
  async function fetchBookings(
    checkDateField: 'check_in_date' | 'check_out_date',
    dateValue: string,
    statuses: string[],
  ) {
    let q = supabase
      .from('bookings')
      .select(`
        id, check_in_date, check_out_date, total_amount_paise, payment_status, status,
        rooms ( name ),
        properties ( id, owner_id, owner_phone, name ),
        booking_guests (
          is_primary,
          guests ( full_name )
        )
      `)
      .eq(checkDateField, dateValue)
      .in('status', statuses)
      .in('payment_status', ['pending', 'partial'])  // skip already-paid bookings
      .is('deleted_at', null)

    if (ownerPropertyIds) {
      q = q.in('property_id', ownerPropertyIds)
    }

    return q
  }

  // ── Run three reminder scenarios ────────────────────────────────────────
  const [advanceRes, balanceRes, overdueRes] = await Promise.all([
    fetchBookings('check_in_date', inTwoDays, ['confirmed']),
    fetchBookings('check_in_date', today,     ['confirmed']),
    fetchBookings('check_out_date', yesterday, ['checked_in', 'checked_out']),
  ])

  type ReminderScenario = {
    bookings: typeof advanceRes.data
    dueLabel: (checkInDate: string) => string
  }

  const scenarios: ReminderScenario[] = [
    {
      bookings: advanceRes.data,
      dueLabel: (ci) => `${ci} — 2 days away`,
    },
    {
      bookings: balanceRes.data,
      dueLabel: () => 'Today (check-in day)',
    },
    {
      bookings: overdueRes.data,
      dueLabel: () => 'Overdue — guest has checked out',
    },
  ]

  let sent = 0
  const errors: string[] = []

  for (const { bookings, dueLabel } of scenarios) {
    if (!bookings) continue

    for (const b of bookings) {
      const property = b.properties as unknown as {
        id: string; owner_id: string; owner_phone: string | null
      } | null

      if (!property?.owner_phone) continue

      const room = b.rooms as unknown as { name: string } | null
      const guests = (b.booking_guests ?? []) as unknown as {
        is_primary: boolean; guests: { full_name: string } | null
      }[]
      const primaryGuest = guests.find((g) => g.is_primary)?.guests ?? guests[0]?.guests

      const amounts = pendingLabel(b.payment_status, b.total_amount_paise)

      try {
        await sendPaymentReminder({
          ownerPhone: property.owner_phone,
          ownerId: property.owner_id,
          guestName: primaryGuest?.full_name ?? 'Guest',
          roomName: room?.name ?? '—',
          totalAmountPaise: b.total_amount_paise,
          paidAmountPaise: b.payment_status === 'paid' ? b.total_amount_paise : 0,
          dueLabel: dueLabel(b.check_in_date),
        })
        sent++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[Cron/PaymentReminders] Failed for booking ${b.id}:`, msg)
        errors.push(`${b.id}: ${msg}`)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    today,
    advanceDue: advanceRes.data?.length ?? 0,
    balanceDue: balanceRes.data?.length ?? 0,
    overdue: overdueRes.data?.length ?? 0,
    remindersSent: sent,
    ...(errors.length > 0 ? { errors } : {}),
  })
}
