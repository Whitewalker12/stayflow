/**
 * GET /api/cron/daily-departures
 *
 * Vercel cron: 30 3 * * *  (3:30 AM UTC = 9:00 AM IST)
 *
 * Fetches all active bookings checking out today in IST, groups by owner,
 * and sends the daily_departures WhatsApp template to each owner.
 * Includes pending payment amount where applicable.
 *
 * Also called manually from /(dashboard)/settings/notifications.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendDailyDepartures } from '@/lib/whatsapp/send'
import { todayIST, verifyCronOrSession, pendingAmountPaise } from '@/lib/whatsapp/cron-helpers'

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
  const supabase = createServiceClient()

  // ── Fetch today's departures ────────────────────────────────────────────
  let query = supabase
    .from('bookings')
    .select(`
      id, check_out_date, total_amount_paise, payment_status,
      rooms ( name ),
      properties ( id, owner_id, owner_phone, name ),
      booking_guests (
        is_primary,
        guests ( full_name )
      )
    `)
    .eq('check_out_date', today)
    .eq('status', 'checked_in')        // only guests currently in-house
    .is('deleted_at', null)

  if (mode === 'session' && sessionOwnerId) {
    const { data: ownedPropertyIds } = await supabase
      .from('properties')
      .select('id')
      .eq('owner_id', sessionOwnerId)
      .is('deleted_at', null)

    const ids = (ownedPropertyIds ?? []).map((p) => p.id)
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, today })
    }
    query = query.in('property_id', ids)
  }

  const { data: bookings, error } = await query

  if (error) {
    console.error('[Cron/DailyDepartures] DB error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, today, note: 'No departures today' })
  }

  // ── Group by owner ──────────────────────────────────────────────────────
  type DepartureRow = {
    guestName: string
    roomName: string
    pendingAmountPaise: number
  }

  const byOwner = new Map<string, { phone: string; ownerId: string; departures: DepartureRow[] }>()

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

    const existing = byOwner.get(property.owner_id) ?? {
      phone: property.owner_phone,
      ownerId: property.owner_id,
      departures: [],
    }

    existing.departures.push({
      guestName: primaryGuest?.full_name ?? 'Guest',
      roomName: room?.name ?? '—',
      pendingAmountPaise: pendingAmountPaise(b.payment_status, b.total_amount_paise),
    })

    byOwner.set(property.owner_id, existing)
  }

  // ── Send to each owner ──────────────────────────────────────────────────
  let sent = 0
  const errors: string[] = []

  for (const [, ownerData] of byOwner) {
    try {
      await sendDailyDepartures({
        ownerPhone: ownerData.phone,
        ownerId: ownerData.ownerId,
        date: new Date(),
        departures: ownerData.departures,
      })
      sent++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Cron/DailyDepartures] Failed for owner ${ownerData.ownerId}:`, msg)
      errors.push(msg)
    }
  }

  return NextResponse.json({
    ok: true,
    today,
    totalDepartures: bookings.length,
    ownersNotified: sent,
    ...(errors.length > 0 ? { errors } : {}),
  })
}
