/**
 * POST /api/checkin/[token]
 *
 * Public endpoint — NO user authentication required.
 * Accepts FormData from the guest self-check-in page.
 *
 * Steps:
 *   1. Validate token (not expired, not already completed)
 *   2. Parse & validate form fields with Zod
 *   3. If id_photo provided: upload to Supabase Storage (checkin-documents bucket)
 *   4. Update guest record with new details
 *   5. Update booking (num_adults, num_children, special_requests)
 *   6. Mark checkin_token as completed
 *   7. Notify owner via WhatsApp
 *
 * ── Supabase Storage setup (run once in Supabase Dashboard) ─────────────────
 *   1. Go to Storage → Create bucket "checkin-documents"
 *   2. Set bucket to PRIVATE (not public)
 *   3. Add INSERT policy:
 *        Name: "Service role can upload checkin documents"
 *        Role: service_role
 *        Operation: INSERT
 *        (No row filter needed — service role bypasses RLS)
 *   4. Add SELECT policy for owner access (when needed):
 *        Name: "Owners can view their checkin documents"
 *        Role: authenticated
 *        Operation: SELECT
 *        USING: auth.uid() IN (
 *          SELECT p.owner_id FROM properties p
 *          JOIN bookings b ON b.property_id = p.id
 *          WHERE storage.foldername(name)[1] = b.id::text
 *        )
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { checkinSchema } from '@/lib/validations/checkin'
import { sendTextMessage } from '@/lib/whatsapp/client'
import { normalisePhone } from '@/lib/whatsapp/send'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params
  const supabase = createServiceClient()

  // ── 1. Validate token ──────────────────────────────────────────────────────

  const { data: tokenRow } = await supabase
    .from('checkin_tokens')
    .select(`
      id, expires_at, completed_at,
      bookings (
        id, property_id, num_adults, num_children, special_requests,
        booking_guests ( is_primary, guest_id ),
        properties ( owner_phone, name, owner_id )
      )
    `)
    .eq('token', token)
    .maybeSingle()

  if (!tokenRow) {
    return NextResponse.json({ error: 'Invalid check-in link' }, { status: 404 })
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Check-in link has expired' }, { status: 410 })
  }
  if (tokenRow.completed_at) {
    return NextResponse.json({ error: 'Check-in already completed' }, { status: 409 })
  }

  const booking = tokenRow.bookings as unknown as BookingWithRelations | null
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  // ── 2. Parse & validate form data ──────────────────────────────────────────

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const raw = {
    full_name:             formData.get('full_name'),
    phone:                 formData.get('phone'),
    email:                 formData.get('email') || undefined,
    id_type:               formData.get('id_type'),
    id_number:             formData.get('id_number'),
    address:               formData.get('address') || undefined,
    city:                  formData.get('city') || undefined,
    state:                 formData.get('state') || undefined,
    pincode:               formData.get('pincode') || undefined,
    num_adults:            formData.get('num_adults'),
    num_children:          formData.get('num_children') ?? '0',
    expected_arrival_time: formData.get('expected_arrival_time') || undefined,
    special_requests:      formData.get('special_requests') || undefined,
  }

  const parsed = checkinSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json(
      { error: first?.message ?? 'Validation failed' },
      { status: 422 },
    )
  }

  const data = parsed.data
  const photoFile = formData.get('id_photo')
  const guestIdFromForm = formData.get('guest_id') as string | null

  // ── 3. Upload photo if provided ────────────────────────────────────────────

  let photoUrl: string | null = null

  if (photoFile instanceof File && photoFile.size > 0) {
    try {
      const arrayBuffer = await photoFile.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const path = `${booking.id}/${Date.now()}.jpg`

      const { error: uploadErr } = await supabase.storage
        .from('checkin-documents')
        .upload(path, buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        })

      if (uploadErr) {
        // Non-fatal — log and continue without photo
        console.error('[Checkin] Photo upload failed:', uploadErr.message)
      } else {
        // Store storage path (not a public URL — use signed URL when viewing)
        photoUrl = path
      }
    } catch (err) {
      console.error('[Checkin] Photo processing error:', err)
    }
  }

  // ── 4. Resolve guest ID ────────────────────────────────────────────────────

  // Use guest_id from form (passed by server component) or fall back to
  // the primary guest from the booking
  const guestRows = (booking.booking_guests ?? []) as BookingGuestRow[]
  const primaryGuestRow = guestRows.find((bg) => bg.is_primary) ?? guestRows[0]
  const guestId = guestIdFromForm ?? primaryGuestRow?.guest_id ?? null

  // ── 5. Update guest record ─────────────────────────────────────────────────

  if (guestId) {
    const guestUpdate: Record<string, unknown> = {
      full_name:           data.full_name,
      phone:               data.phone,
      id_document_type:    data.id_type,
      id_document_number:  data.id_number,
    }
    if (data.email)   guestUpdate.email   = data.email
    if (data.address) guestUpdate.address = data.address
    if (data.city)    guestUpdate.city    = data.city
    if (data.state)   guestUpdate.state   = data.state
    if (data.pincode) guestUpdate.pincode = data.pincode
    if (photoUrl)     guestUpdate.id_document_photo_url = photoUrl

    const { error: guestErr } = await supabase
      .from('guests')
      .update(guestUpdate)
      .eq('id', guestId)

    if (guestErr) {
      console.error('[Checkin] Guest update failed:', guestErr.message)
    }
  }

  // ── 6. Update booking ──────────────────────────────────────────────────────

  const combinedNotes = [
    data.expected_arrival_time
      ? `Expected arrival: ${data.expected_arrival_time}`
      : null,
    data.special_requests || null,
  ]
    .filter(Boolean)
    .join('\n')

  const { error: bookingErr } = await supabase
    .from('bookings')
    .update({
      num_adults:       data.num_adults,
      num_children:     data.num_children,
      special_requests: combinedNotes || null,
    })
    .eq('id', booking.id)

  if (bookingErr) {
    console.error('[Checkin] Booking update failed:', bookingErr.message)
  }

  // ── 7. Mark token completed ────────────────────────────────────────────────

  await supabase
    .from('checkin_tokens')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', tokenRow.id)

  // ── 8. Notify owner via WhatsApp ───────────────────────────────────────────

  const property = booking.properties as PropertyWithOwner | null
  if (property?.owner_phone) {
    try {
      const ownerPhone = normalisePhone(property.owner_phone)
      const arrivalNote = data.expected_arrival_time
        ? ` (arriving ${data.expected_arrival_time})`
        : ''
      await sendTextMessage({
        to: ownerPhone,
        text:
          `✅ Check-in form submitted!\n\n` +
          `Guest: ${data.full_name}${arrivalNote}\n` +
          `Property: ${property.name}`,
        ownerId: property.owner_id,
      })
    } catch (err) {
      // Non-fatal — WhatsApp failure must never block check-in
      console.error('[Checkin] Owner notification failed:', err)
    }
  }

  return NextResponse.json({ ok: true })
}

// ── Local types ───────────────────────────────────────────────────────────────

interface BookingGuestRow {
  is_primary: boolean
  guest_id: string
}

interface PropertyWithOwner {
  owner_phone: string | null
  name: string
  owner_id: string
}

interface BookingWithRelations {
  id: string
  property_id: string
  num_adults: number
  num_children: number
  special_requests: string | null
  booking_guests: BookingGuestRow[]
  properties: PropertyWithOwner | null
}
