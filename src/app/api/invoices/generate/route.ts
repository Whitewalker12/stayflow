import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateInvoiceSchema } from '@/lib/validations/invoice'
import { computeInvoiceGST } from '@/lib/utils/gst'
import type { InvoiceLineItemsData } from '@/types'

/**
 * POST /api/invoices/generate
 *
 * Body: { booking_id, invoice_date, notes? }
 *
 * 1. Fetches booking + property + room + primary guest
 * 2. Computes GST (12% or 18%, intra/inter-state)
 * 3. Generates sequential invoice number: INV-{FY}-{NNNN}
 * 4. Inserts invoice row with all snapshot data
 *
 * Returns: { invoice_id, invoice_number }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse + validate body ─────────────────────────────────────────────────
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = generateInvoiceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation failed' },
      { status: 400 }
    )
  }

  const { booking_id, invoice_date, notes } = parsed.data

  // ── Fetch booking with all related data ───────────────────────────────────
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select(`
      id, property_id, room_id, check_in_date, check_out_date,
      rate_per_night_paise, total_amount_paise, num_nights, status,
      rooms ( id, name, room_type ),
      properties ( id, name, address_line1, address_line2, city, state, pincode, gstin, owner_id ),
      booking_guests (
        is_primary,
        guests ( id, full_name, address, city, state, pincode, email, phone )
      )
    `)
    .eq('id', booking_id)
    .is('deleted_at', null)
    .single()

  if (bErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  // ── Ownership check ───────────────────────────────────────────────────────
  const property = booking.properties as unknown as {
    id: string; name: string; address_line1: string; address_line2: string | null
    city: string; state: string; pincode: string; gstin: string | null; owner_id: string
  } | null

  if (!property || property.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── No duplicate invoice for this booking ─────────────────────────────────
  const { data: existing } = await supabase
    .from('invoices')
    .select('id')
    .eq('booking_id', booking_id)
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .limit(1)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'Invoice already exists for this booking', invoice_id: existing.id },
      { status: 409 }
    )
  }

  // ── Extract snapshot data ─────────────────────────────────────────────────
  const room = booking.rooms as unknown as { id: string; name: string; room_type: string } | null

  const bookingGuests = (booking.booking_guests ?? []) as unknown as {
    is_primary: boolean
    guests: {
      id: string; full_name: string; address: string | null; city: string | null
      state: string | null; pincode: string | null; email: string | null; phone: string | null
    } | null
  }[]

  const primaryGuestEntry =
    bookingGuests.find((bg) => bg.is_primary) ?? bookingGuests[0]
  const guest = primaryGuestEntry?.guests

  if (!room || !guest) {
    return NextResponse.json(
      { error: 'Booking is missing room or guest data' },
      { status: 422 }
    )
  }

  // ── GST calculation ───────────────────────────────────────────────────────
  const gst = computeInvoiceGST(
    booking.rate_per_night_paise,
    booking.num_nights,
    property.state,
    guest.state,
  )

  // ── Invoice number: INV-{FY}-{NNNN} ──────────────────────────────────────
  // Financial year starts April (month index 3). If today is Jan–Mar, FY started last year.
  const invDate = new Date(invoice_date)
  const fyStartYear =
    invDate.getMonth() >= 3 ? invDate.getFullYear() : invDate.getFullYear() - 1
  const fyLabel = `${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`

  // Count non-cancelled invoices in this FY for this property to get seq number
  const fyStart = `${fyStartYear}-04-01`
  const fyEnd   = `${fyStartYear + 1}-03-31`

  const { count: existingCount } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', booking.property_id)
    .neq('status', 'cancelled')
    .gte('invoice_date', fyStart)
    .lte('invoice_date', fyEnd)

  const seq = String((existingCount ?? 0) + 1).padStart(4, '0')
  const invoiceNumber = `INV-${fyLabel}-${seq}`

  // ── Build property address ────────────────────────────────────────────────
  const propertyAddress = [
    property.address_line1,
    property.address_line2,
  ].filter(Boolean).join(', ')

  // ── Build line_items JSONB ────────────────────────────────────────────────
  const lineItemsData: InvoiceLineItemsData = {
    items: [
      {
        description: `Accommodation — ${room.name}`,
        sac_code: '9963',
        qty: booking.num_nights,
        rate_paise: booking.rate_per_night_paise,
        amount_paise: gst.subtotalPaise,
      },
    ],
    room_name: room.name,
    num_nights: booking.num_nights,
    rate_per_night_paise: booking.rate_per_night_paise,
    guest_state: guest.state,
    property_state: property.state,
  }

  // ── Insert invoice ────────────────────────────────────────────────────────
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      booking_id,
      property_id: booking.property_id,
      invoice_number: invoiceNumber,
      invoice_date,
      status: 'draft',
      // Amounts
      subtotal_paise: gst.subtotalPaise,
      cgst_amount_paise: gst.cgstAmountPaise,
      sgst_amount_paise: gst.sgstAmountPaise,
      igst_amount_paise: gst.igstAmountPaise,
      total_paise: gst.totalPaise,
      // Rates
      cgst_rate: gst.cgstRate,
      sgst_rate: gst.sgstRate,
      igst_rate: gst.igstRate,
      // Guest snapshot
      guest_name: guest.full_name,
      guest_address: [guest.address, guest.city].filter(Boolean).join(', ') || null,
      guest_gstin: null,
      // Property snapshot
      property_name: property.name,
      property_address: [propertyAddress, property.city].filter(Boolean).join(', '),
      property_gstin: property.gstin,
      // Line items + extra snapshot
      line_items: lineItemsData,
      notes: notes || null,
    })
    .select('id')
    .single()

  if (invErr || !invoice) {
    console.error('Invoice insert error:', invErr)
    return NextResponse.json(
      { error: invErr?.message ?? 'Failed to create invoice' },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { invoice_id: invoice.id, invoice_number: invoiceNumber },
    { status: 201 }
  )
}
