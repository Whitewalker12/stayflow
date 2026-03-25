/**
 * POST /api/bookings/notify
 *
 * Server-side notification trigger called after booking mutations.
 * The client calls this after a successful Supabase write — keeping all
 * WhatsApp logic on the server so credentials never touch the browser.
 *
 * Body:
 *   { booking_id: string, event: 'created' | 'status_changed', new_status?: string }
 *
 * Notifications sent:
 *   created         → booking_confirmation → owner
 *   status_changed  → (no-op for now except checked_out → checkout_thankyou → guest)
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { sendBookingConfirmation, sendGuestCheckinLink } from '@/lib/whatsapp/send'
import { generateCheckinToken } from '@/lib/checkin/generate-token'

const bodySchema = z.object({
  booking_id: z.string().uuid(),
  event: z.enum(['created', 'status_changed']),
  new_status: z.string().optional(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth ────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let raw: unknown
  try { raw = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const { booking_id, event, new_status } = parsed.data

  // ── Fetch booking with all related data ─────────────────────────────────
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select(`
      id, property_id, status, source,
      check_in_date, check_out_date, total_amount_paise,
      rooms ( name ),
      properties ( id, owner_id, owner_phone, name ),
      booking_guests (
        is_primary,
        guests ( full_name, phone )
      )
    `)
    .eq('id', booking_id)
    .is('deleted_at', null)
    .single()

  if (bErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  // ── Ownership check ─────────────────────────────────────────────────────
  const property = booking.properties as unknown as {
    id: string; owner_id: string; owner_phone: string | null; name: string
  } | null

  if (!property || property.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const room = booking.rooms as unknown as { name: string } | null

  const bookingGuests = (booking.booking_guests ?? []) as unknown as {
    is_primary: boolean
    guests: { full_name: string; phone: string | null } | null
  }[]
  const primaryGuest = bookingGuests.find((bg) => bg.is_primary)?.guests
    ?? bookingGuests[0]?.guests

  // ── Skip if owner has no phone configured ───────────────────────────────
  // (silently succeed — don't fail the booking flow)
  if (!property.owner_phone) {
    console.info(`[Notify] Owner has no WhatsApp number set — booking ${booking_id}`)
    return NextResponse.json({ ok: true, skipped: 'no_owner_phone' })
  }

  // ── Dispatch notification ───────────────────────────────────────────────
  if (event === 'created') {
    // Notify owner of new booking
    await sendBookingConfirmation({
      ownerPhone: property.owner_phone,
      ownerId: user.id,
      guestName: primaryGuest?.full_name ?? 'Guest',
      roomName: room?.name ?? '—',
      checkInDate: booking.check_in_date,
      checkOutDate: booking.check_out_date,
      totalAmountPaise: booking.total_amount_paise,
      source: booking.source,
    })

    // Send self-check-in link to guest (if they have a phone)
    const guestPhone = primaryGuest?.phone
    if (guestPhone) {
      try {
        const checkinToken = await generateCheckinToken(booking.id)
        await sendGuestCheckinLink({
          guestPhone,
          propertyName: property.name,
          checkinToken,
          ownerName: property.name,  // use property name as sender identity
        })
      } catch (err) {
        // Non-fatal — checkin link failure must never block booking flow
        console.error('[Notify] Failed to send guest checkin link:', err)
      }
    }
  }

  return NextResponse.json({ ok: true })
}
