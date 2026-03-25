/**
 * GET /api/cron/daily-arrivals
 *
 * Vercel cron: 30 2 * * *  (2:30 AM UTC = 8:00 AM IST)
 *
 * Fetches all confirmed check-ins for today in IST, groups them by owner,
 * and sends the daily_arrivals WhatsApp template to each owner.
 *
 * Also called manually from /(dashboard)/settings/notifications
 * with a valid user session (sends only to the logged-in owner).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendDailyArrivals } from '@/lib/whatsapp/send'
import { todayIST, verifyCronOrSession } from '@/lib/whatsapp/cron-helpers'

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

  // ── Fetch today's arrivals ──────────────────────────────────────────────
  let query = supabase
    .from('bookings')
    .select(`
      id, check_in_date,
      rooms ( name ),
      properties ( id, owner_id, owner_phone, name, default_checkin_time ),
      booking_guests (
        is_primary,
        guests ( full_name )
      )
    `)
    .eq('check_in_date', today)
    .eq('status', 'confirmed')
    .is('deleted_at', null)

  // Manual trigger: filter to just this owner's properties
  if (mode === 'session' && sessionOwnerId) {
    // Filter via property owner_id using a subquery approach
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
    console.error('[Cron/DailyArrivals] DB error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, today, note: 'No arrivals today' })
  }

  // ── Group by owner ──────────────────────────────────────────────────────
  type ArrivalRow = {
    guestName: string
    roomName: string
    checkInTime: string
  }

  const byOwner = new Map<string, { phone: string; ownerId: string; arrivals: ArrivalRow[] }>()

  for (const b of bookings) {
    const property = b.properties as unknown as {
      id: string; owner_id: string; owner_phone: string | null; default_checkin_time: string
    } | null

    if (!property?.owner_phone) continue  // skip owners with no phone

    const room = b.rooms as unknown as { name: string } | null
    const guests = (b.booking_guests ?? []) as unknown as {
      is_primary: boolean; guests: { full_name: string } | null
    }[]
    const primaryGuest = guests.find((g) => g.is_primary)?.guests ?? guests[0]?.guests

    const existing = byOwner.get(property.owner_id) ?? {
      phone: property.owner_phone,
      ownerId: property.owner_id,
      arrivals: [],
    }

    // Format check-in time: "14:00" → "2:00 PM"
    let checkInTime = ''
    if (property.default_checkin_time) {
      const [h, m] = property.default_checkin_time.split(':').map(Number)
      const suffix = h >= 12 ? 'PM' : 'AM'
      const displayH = h % 12 || 12
      checkInTime = `${displayH}:${String(m).padStart(2, '0')} ${suffix}`
    }

    existing.arrivals.push({
      guestName: primaryGuest?.full_name ?? 'Guest',
      roomName: room?.name ?? '—',
      checkInTime,
    })

    byOwner.set(property.owner_id, existing)
  }

  // ── Send to each owner ──────────────────────────────────────────────────
  let sent = 0
  const errors: string[] = []

  for (const [, ownerData] of byOwner) {
    try {
      await sendDailyArrivals({
        ownerPhone: ownerData.phone,
        ownerId: ownerData.ownerId,
        date: new Date(),
        arrivals: ownerData.arrivals,
      })
      sent++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Cron/DailyArrivals] Failed for owner ${ownerData.ownerId}:`, msg)
      errors.push(msg)
    }
  }

  return NextResponse.json({
    ok: true,
    today,
    totalArrivals: bookings.length,
    ownersNotified: sent,
    ...(errors.length > 0 ? { errors } : {}),
  })
}
