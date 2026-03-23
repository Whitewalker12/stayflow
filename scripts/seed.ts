/**
 * StayFlow — Seed Script
 *
 * Creates demo data for Nandini's 2-property, 6-room homestay setup:
 *   • 2 properties (4 rooms + 2 rooms)
 *   • 5 guests with Indian names / phone numbers
 *   • 8 bookings spread across the next 2 weeks (mixed statuses)
 *   • 2 invoices (one paid, one draft)
 *
 * Prerequisites — add to .env.local:
 *   SEED_EMAIL=your@email.com
 *   SEED_PASSWORD=yourpassword
 *
 * Usage:
 *   npm run seed
 *
 * Idempotent: existing seed data for this user is wiped and re-created fresh.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// ── 1. Load .env.local ────────────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (key && !(key in process.env)) process.env[key] = val
  }
}

loadEnvLocal()

// ── 2. Validate env ───────────────────────────────────────────────────────────

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SEED_EMAIL    = process.env.SEED_EMAIL
const SEED_PASSWORD = process.env.SEED_PASSWORD

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}
if (!SEED_EMAIL || !SEED_PASSWORD) {
  console.error('❌  Missing SEED_EMAIL or SEED_PASSWORD in .env.local')
  process.exit(1)
}

// ── 3. Supabase client ────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false },
})

// ── 4. GST helper ─────────────────────────────────────────────────────────────

function computeGST(
  ratePerNightPaise: number,
  numNights: number,
  propertyState: string,
  guestState: string | null,
) {
  const gstPct = ratePerNightPaise <= 750_000 ? 12 : 18
  const subtotal = ratePerNightPaise * numNights
  const isInterState =
    !!guestState &&
    guestState.trim().toLowerCase() !== propertyState.trim().toLowerCase()
  const totalGST = Math.round((subtotal * gstPct) / 100)
  const igst = isInterState ? totalGST : 0
  const sgst = isInterState ? 0 : Math.floor(totalGST / 2)
  const cgst = isInterState ? 0 : totalGST - sgst
  return {
    subtotalPaise: subtotal,
    cgstRate: isInterState ? 0 : gstPct / 2,
    sgstRate: isInterState ? 0 : gstPct / 2,
    igstRate: isInterState ? gstPct : 0,
    cgstAmountPaise: cgst,
    sgstAmountPaise: sgst,
    igstAmountPaise: igst,
    totalPaise: subtotal + cgst + sgst + igst,
  }
}

// ── 5. Date helpers ───────────────────────────────────────────────────────────

function dateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function fyLabel(): string {
  const now = new Date()
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${startYear}-${String(startYear + 1).slice(-2)}`
}

// ── 6. Static data ────────────────────────────────────────────────────────────

const PROPERTY_STATE = 'Himachal Pradesh'

const PROPERTIES = [
  {
    name: "Nandini's Hillside Homestay",
    address_line1: '12 Oak Ridge Road, Jakhu Hill',
    address_line2: null,
    city: 'Shimla',
    state: PROPERTY_STATE,
    pincode: '171001',
    phone: '9816001234',
    email: 'hillside@nandini.example.com',
    default_checkin_time: '14:00',
    default_checkout_time: '11:00',
    cancellation_policy: 'Free cancellation up to 48 hours before check-in.',
    gstin: '02AAAPN1234C1ZV',
  },
  {
    name: "Nandini's Garden Retreat",
    address_line1: '8 Sunset View, Kasauli Hills',
    address_line2: null,
    city: 'Kasauli',
    state: PROPERTY_STATE,
    pincode: '173204',
    phone: '9816005678',
    email: 'garden@nandini.example.com',
    default_checkin_time: '14:00',
    default_checkout_time: '11:00',
    cancellation_policy: 'Full refund if cancelled 72 hours in advance.',
    gstin: null,
  },
] as const

type RoomDef = {
  name: string
  room_type: 'standard' | 'deluxe' | 'suite' | 'dormitory'
  base_rate_paise: number
  max_occupancy: number
  amenities: string[]
  floor_number: number
  description: string
  seedStatus: 'available' | 'occupied'
}

const ROOMS_BY_PROPERTY: RoomDef[][] = [
  [
    {
      name: 'Forest View Room',
      room_type: 'standard',
      base_rate_paise: 350_000,
      max_occupancy: 2,
      amenities: ['Wi-Fi', 'Hot Water', 'Geyser', 'Attached Bathroom', 'Mountain View'],
      floor_number: 1,
      description: 'Cozy standard room with a peaceful view of the deodar forest.',
      seedStatus: 'available',
    },
    {
      name: 'Mountain Suite',
      room_type: 'deluxe',
      base_rate_paise: 550_000,
      max_occupancy: 2,
      amenities: ['Wi-Fi', 'Air Conditioning', 'Hot Water', 'Balcony', 'Mountain View', 'TV'],
      floor_number: 2,
      description: 'Spacious deluxe room with a private balcony overlooking the Shimla ranges.',
      seedStatus: 'available',
    },
    {
      name: 'Valley Deluxe',
      room_type: 'deluxe',
      base_rate_paise: 650_000,
      max_occupancy: 3,
      amenities: ['Wi-Fi', 'Air Conditioning', 'Hot Water', 'Balcony', 'Garden View', 'TV', 'Safe'],
      floor_number: 2,
      description: 'Bright deluxe room facing the valley; perfect for families.',
      seedStatus: 'occupied',
    },
    {
      name: 'Premium Suite',
      room_type: 'suite',
      base_rate_paise: 850_000,
      max_occupancy: 4,
      amenities: ['Wi-Fi', 'Air Conditioning', 'Hot Water', 'Balcony', 'Mountain View', 'TV', 'Safe', 'Minibar', 'Desk', 'King Bed'],
      floor_number: 3,
      description: 'Top-floor premium suite — panoramic views, king bed, minibar and ensuite.',
      seedStatus: 'occupied',
    },
  ],
  [
    {
      name: 'Garden Room',
      room_type: 'standard',
      base_rate_paise: 280_000,
      max_occupancy: 2,
      amenities: ['Wi-Fi', 'Hot Water', 'Attached Bathroom', 'Garden View', 'Kettle'],
      floor_number: 1,
      description: 'Quaint standard room opening onto the landscaped garden.',
      seedStatus: 'available',
    },
    {
      name: 'Orchard Suite',
      room_type: 'deluxe',
      base_rate_paise: 420_000,
      max_occupancy: 3,
      amenities: ['Wi-Fi', 'Hot Water', 'Balcony', 'Garden View', 'TV', 'Kettle', 'Refrigerator'],
      floor_number: 1,
      description: 'Charming suite with a private sit-out overlooking the apple orchard.',
      seedStatus: 'available',
    },
  ],
]

const GUESTS = [
  { full_name: 'Priya Sharma',   phone: '9876543210', email: 'priya.sharma@example.com',   address: '42 Vasant Vihar',              city: 'New Delhi',  state: 'Delhi',      pincode: '110057', nationality: 'Indian', is_foreign_national: false, id_document_type: 'aadhaar' as const,          id_document_number: '1234 5678 9012'     },
  { full_name: 'Arjun Mehta',    phone: '9988776655', email: 'arjun.mehta@example.com',    address: 'B-204 Powai Lake View',        city: 'Mumbai',     state: 'Maharashtra', pincode: '400076', nationality: 'Indian', is_foreign_national: false, id_document_type: 'passport' as const,         id_document_number: 'P1234567'           },
  { full_name: 'Sunita Patel',   phone: '9123456789', email: 'sunita.patel@example.com',   address: '7 Navrangpura Society',        city: 'Ahmedabad',  state: 'Gujarat',    pincode: '380009', nationality: 'Indian', is_foreign_national: false, id_document_type: 'voter_id' as const,         id_document_number: 'GJ/07/123/456789'  },
  { full_name: 'Rahul Kapoor',   phone: '9876501234', email: 'rahul.kapoor@example.com',   address: 'House 15 Sector 22-B',         city: 'Chandigarh', state: 'Punjab',     pincode: '160022', nationality: 'Indian', is_foreign_national: false, id_document_type: 'driving_license' as const, id_document_number: 'PB0620170012345'   },
  { full_name: 'Kavitha Nair',   phone: '9765432109', email: 'kavitha.nair@example.com',   address: '302 Indiranagar 12th Main',    city: 'Bengaluru',  state: 'Karnataka',  pincode: '560038', nationality: 'Indian', is_foreign_national: false, id_document_type: 'aadhaar' as const,          id_document_number: '9876 5432 1098'    },
]

// ── 7. Main ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\n🌱  StayFlow Seed Script')
  console.log('═══════════════════════════════════════')

  // ── Sign in ────────────────────────────────────────────────────────────────
  console.log(`\n🔐  Signing in as ${SEED_EMAIL}…`)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: SEED_EMAIL!,
    password: SEED_PASSWORD!,
  })
  if (authError || !authData.user) {
    console.error(`❌  Sign-in failed: ${authError?.message ?? 'unknown error'}`)
    process.exit(1)
  }
  const userId = authData.user.id
  console.log(`✅  Signed in (uid: ${userId.slice(0, 8)}…)`)

  // ── Cleanup: wipe any existing seed data for this user ─────────────────────
  console.log('\n🧹  Cleaning up existing data…')

  const { data: existingProps } = await supabase
    .from('properties')
    .select('id')
    .eq('owner_id', userId)

  if (existingProps && existingProps.length > 0) {
    const propIds = existingProps.map((p) => p.id)

    // Fetch booking IDs
    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('id')
      .in('property_id', propIds)

    if (existingBookings && existingBookings.length > 0) {
      const bookingIds = existingBookings.map((b) => b.id)
      await supabase.from('invoices').delete().in('booking_id', bookingIds)
      await supabase.from('booking_guests').delete().in('booking_id', bookingIds)
      await supabase.from('bookings').delete().in('id', bookingIds)
    }

    await supabase.from('rooms').delete().in('property_id', propIds)
    await supabase.from('properties').delete().in('id', propIds)
    console.log(`  ✓ Removed ${propIds.length} propert${propIds.length === 1 ? 'y' : 'ies'} and related data`)
  }

  // Delete guests owned by this user
  const { data: existingGuests } = await supabase
    .from('guests')
    .select('id')
    .eq('owner_id', userId)

  if (existingGuests && existingGuests.length > 0) {
    await supabase.from('guests').delete().eq('owner_id', userId)
    console.log(`  ✓ Removed ${existingGuests.length} guest${existingGuests.length === 1 ? '' : 's'}`)
  }

  if (!existingProps?.length && !existingGuests?.length) {
    console.log('  ✓ Nothing to clean up')
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Properties
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n📍  Creating properties…')
  const propertyIds: string[] = []

  for (const prop of PROPERTIES) {
    const { data, error } = await supabase
      .from('properties')
      .insert({ ...prop, owner_id: userId })
      .select('id')
      .single()
    if (error || !data) { console.error(`❌  Property "${prop.name}": ${error?.message}`); process.exit(1) }
    propertyIds.push(data.id)
    console.log(`  ✓ ${prop.name}  (${prop.city})`)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Rooms
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n🛏   Creating rooms…')
  const roomIds: string[][] = [[], []]

  for (let pi = 0; pi < ROOMS_BY_PROPERTY.length; pi++) {
    for (const room of ROOMS_BY_PROPERTY[pi]) {
      const { seedStatus, ...fields } = room
      const { data, error } = await supabase
        .from('rooms')
        .insert({ ...fields, property_id: propertyIds[pi], status: seedStatus })
        .select('id')
        .single()
      if (error || !data) { console.error(`❌  Room "${room.name}": ${error?.message}`); process.exit(1) }
      roomIds[pi].push(data.id)
      const rate = `₹${(room.base_rate_paise / 100).toLocaleString('en-IN')}`
      console.log(`  ✓ [${PROPERTIES[pi].city}] ${room.name}  (${rate}/night)`)
    }
  }

  const [r0, r1, r2, r3] = roomIds[0]
  const [r4, r5] = roomIds[1]

  // ══════════════════════════════════════════════════════════════════════════
  // Guests  (owner_id required by RLS policy)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n👥  Creating guests…')
  const guestIds: string[] = []

  for (const guest of GUESTS) {
    const { data, error } = await supabase
      .from('guests')
      .insert({ ...guest, owner_id: userId })   // ← required by RLS
      .select('id')
      .single()
    if (error || !data) { console.error(`❌  Guest "${guest.full_name}": ${error?.message}`); process.exit(1) }
    guestIds.push(data.id)
    console.log(`  ✓ ${guest.full_name}  (${guest.phone}, ${guest.city})`)
  }

  const [gPriya, gArjun, gSunita, gRahul, gKavitha] = guestIds

  // ══════════════════════════════════════════════════════════════════════════
  // Bookings
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n📅  Creating bookings…')

  type BookingRow = {
    property_id: string
    room_id: string
    check_in_date: string
    check_out_date: string
    rate_per_night_paise: number
    total_amount_paise: number
    status: 'pending' | 'confirmed' | 'checked_in' | 'checked_out'
    source: string
    payment_status: 'pending' | 'partial' | 'paid' | 'refunded'
    payment_method: string | null
    num_adults: number
    num_children: number
    special_requests: string | null
    guest_id: string   // extracted before insert; used for booking_guests + primary_guest_id
  }

  const bookings: BookingRow[] = [
    // B1 checked_out — Priya, Forest View, 4 nights → Invoice paid
    { property_id: propertyIds[0], room_id: r0, check_in_date: dateOffset(-5), check_out_date: dateOffset(-1), rate_per_night_paise: 350_000, total_amount_paise: 350_000 * 4, status: 'checked_out', source: 'direct',      payment_status: 'paid',    payment_method: 'upi',  num_adults: 2, num_children: 0, special_requests: 'Early check-in if possible', guest_id: gPriya   },
    // B2 checked_out — Arjun, Mountain Suite, 3 nights → Invoice draft
    { property_id: propertyIds[0], room_id: r1, check_in_date: dateOffset(-3), check_out_date: dateOffset(0),  rate_per_night_paise: 550_000, total_amount_paise: 550_000 * 3, status: 'checked_out', source: 'makemytrip', payment_status: 'paid',    payment_method: 'cash', num_adults: 2, num_children: 1, special_requests: null,                           guest_id: gArjun   },
    // B3 checked_in  — Sunita, Valley Deluxe (room occupied)
    { property_id: propertyIds[0], room_id: r2, check_in_date: dateOffset(-2), check_out_date: dateOffset(2),  rate_per_night_paise: 650_000, total_amount_paise: 650_000 * 4, status: 'checked_in',  source: 'airbnb',     payment_status: 'partial', payment_method: 'upi',  num_adults: 1, num_children: 0, special_requests: 'Vegetarian meals only',       guest_id: gSunita  },
    // B4 checked_in  — Rahul, Premium Suite (room occupied)
    { property_id: propertyIds[0], room_id: r3, check_in_date: dateOffset(-1), check_out_date: dateOffset(3),  rate_per_night_paise: 850_000, total_amount_paise: 850_000 * 4, status: 'checked_in',  source: 'phone',      payment_status: 'pending', payment_method: null,   num_adults: 2, num_children: 2, special_requests: 'Extra blankets for kids',     guest_id: gRahul   },
    // B5 confirmed   — Kavitha, Garden Room
    { property_id: propertyIds[1], room_id: r4, check_in_date: dateOffset(2),  check_out_date: dateOffset(6),  rate_per_night_paise: 280_000, total_amount_paise: 280_000 * 4, status: 'confirmed',   source: 'booking_com', payment_status: 'pending', payment_method: null,  num_adults: 2, num_children: 0, special_requests: null,                           guest_id: gKavitha },
    // B6 confirmed   — Priya, Orchard Suite
    { property_id: propertyIds[1], room_id: r5, check_in_date: dateOffset(3),  check_out_date: dateOffset(7),  rate_per_night_paise: 420_000, total_amount_paise: 420_000 * 4, status: 'confirmed',   source: 'direct',     payment_status: 'pending', payment_method: null,   num_adults: 3, num_children: 1, special_requests: 'Room near the orchard side',  guest_id: gPriya   },
    // B7 confirmed   — Arjun, Forest View
    { property_id: propertyIds[0], room_id: r0, check_in_date: dateOffset(5),  check_out_date: dateOffset(9),  rate_per_night_paise: 350_000, total_amount_paise: 350_000 * 4, status: 'confirmed',   source: 'referral',   payment_status: 'pending', payment_method: null,   num_adults: 2, num_children: 0, special_requests: null,                           guest_id: gArjun   },
    // B8 pending     — Sunita, Mountain Suite
    { property_id: propertyIds[0], room_id: r1, check_in_date: dateOffset(9),  check_out_date: dateOffset(13), rate_per_night_paise: 550_000, total_amount_paise: 550_000 * 4, status: 'pending',     source: 'goibibo',    payment_status: 'pending', payment_method: null,   num_adults: 2, num_children: 0, special_requests: 'High floor preferred',        guest_id: gSunita  },
  ]

  const bookingIds: string[] = []

  for (const b of bookings) {
    const { guest_id, ...fields } = b
    const { data, error } = await supabase
      .from('bookings')
      .insert({ ...fields, primary_guest_id: guest_id })
      .select('id')
      .single()
    if (error || !data) { console.error(`❌  Booking: ${error?.message}`); process.exit(1) }
    bookingIds.push(data.id)

    await supabase.from('booking_guests').insert({ booking_id: data.id, guest_id, is_primary: true })

    const guestName = GUESTS[guestIds.indexOf(guest_id)]?.full_name?.split(' ')[0].padEnd(8) ?? '?'
    const ci = b.check_in_date.slice(5)
    const co = b.check_out_date.slice(5)
    const rate = `₹${(b.rate_per_night_paise / 100).toLocaleString('en-IN')}`
    console.log(`  ✓ [${b.status.padEnd(11)}] ${guestName} ${ci}→${co}  ${rate}/n`)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Invoices (B1 → paid, B2 → draft)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n🧾  Creating invoices…')

  const fy = fyLabel()
  const today = dateOffset(0)

  const invoiceDefs = [
    { bookingIdx: 0, status: 'paid'  as const, invoiceNumber: `INV-${fy}-0001` },
    { bookingIdx: 1, status: 'draft' as const, invoiceNumber: `INV-${fy}-0002` },
  ]

  for (const inv of invoiceDefs) {
    const b = bookings[inv.bookingIdx]
    const bookingId = bookingIds[inv.bookingIdx]
    const guest = GUESTS[guestIds.indexOf(b.guest_id)]
    const propIdx = propertyIds.indexOf(b.property_id)
    const prop = PROPERTIES[propIdx]
    const roomRow = ROOMS_BY_PROPERTY[propIdx].find((_, ri) => roomIds[propIdx][ri] === b.room_id)

    const numNights = Math.round(
      (new Date(b.check_out_date).getTime() - new Date(b.check_in_date).getTime()) / 86_400_000
    )
    const gst = computeGST(b.rate_per_night_paise, numNights, prop.state, guest.state)

    const { error } = await supabase.from('invoices').insert({
      booking_id: bookingId,
      property_id: b.property_id,
      invoice_number: inv.invoiceNumber,
      invoice_date: today,
      status: inv.status,
      subtotal_paise:       gst.subtotalPaise,
      cgst_amount_paise:    gst.cgstAmountPaise,
      sgst_amount_paise:    gst.sgstAmountPaise,
      igst_amount_paise:    gst.igstAmountPaise,
      total_paise:          gst.totalPaise,
      cgst_rate:            gst.cgstRate,
      sgst_rate:            gst.sgstRate,
      igst_rate:            gst.igstRate,
      guest_name:           guest.full_name,
      guest_address:        [guest.address, guest.city].filter(Boolean).join(', ') || null,
      guest_gstin:          null,
      property_name:        prop.name,
      property_address:     [prop.address_line1, prop.city].filter(Boolean).join(', '),
      property_gstin:       prop.gstin ?? null,
      notes:                null,
      line_items: {
        items: [{
          description: `Accommodation — ${roomRow?.name ?? 'Room'}`,
          sac_code: '9963',
          qty: numNights,
          rate_paise: b.rate_per_night_paise,
          amount_paise: gst.subtotalPaise,
        }],
        room_name:            roomRow?.name ?? 'Room',
        num_nights:           numNights,
        rate_per_night_paise: b.rate_per_night_paise,
        guest_state:          guest.state,
        property_state:       prop.state,
      },
    })

    if (error) { console.error(`❌  Invoice ${inv.invoiceNumber}: ${error.message}`); process.exit(1) }

    const total = `₹${(gst.totalPaise / 100).toLocaleString('en-IN')}`
    console.log(`  ✓ ${inv.invoiceNumber}  [${inv.status.padEnd(5)}]  ${guest.full_name}  ${total}`)
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════')
  console.log('✅  Seed complete!\n')
  console.log('  Properties : 2  (Shimla · Kasauli)')
  console.log('  Rooms      : 6  (4 + 2)')
  console.log('  Guests     : 5')
  console.log('  Bookings   : 8  (2 checked_out · 2 checked_in · 3 confirmed · 1 pending)')
  console.log('  Invoices   : 2  (1 paid · 1 draft)')
  console.log('\n  Open http://localhost:3000/dashboard to see the data.')
  console.log('═══════════════════════════════════════\n')
}

seed().catch((err) => {
  console.error('\n❌  Unexpected error:', err)
  process.exit(1)
})
