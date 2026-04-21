/**
 * WhatsApp Quick Action command handlers.
 *
 * Supported commands (case-insensitive):
 *   TODAY         — today's arrivals + departures
 *   A1, A2...     — detail for arrival #N from today's list
 *   D1, D2...     — detail for departure #N from today's list
 *   0987654321    — guest lookup by 10-digit phone number
 *   HELP          — command reference
 */

import { createServiceClient } from '@/lib/supabase/service'
import { todayIST } from './cron-helpers'
import { formatRupees } from './templates'
import { parseOTAConfirmation, formatBookingReply } from './booking-parser'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GuestRef {
  name: string
  phone: string | null
  email: string | null
}

interface BookingGuestRow {
  is_primary: boolean
  guests: { full_name: string; phone: string | null; email: string | null } | null
}

interface BookingRoomRow {
  name: string
}

// ---------------------------------------------------------------------------
// Command parser
// ---------------------------------------------------------------------------

export interface ParsedCommand {
  cmd: 'TODAY' | 'ARRIVAL' | 'DEPARTURE' | 'PHONE' | 'HELP'
  index?: number   // for A1/D1 — 0-based
  phone?: string   // for PHONE lookup
}

export function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim()
  const upper = trimmed.toUpperCase()

  // A1, A2... → arrival detail
  const arrivalMatch = upper.match(/^A(\d+)$/)
  if (arrivalMatch) return { cmd: 'ARRIVAL', index: parseInt(arrivalMatch[1]) - 1 }

  // D1, D2... → departure detail
  const depMatch = upper.match(/^D(\d+)$/)
  if (depMatch) return { cmd: 'DEPARTURE', index: parseInt(depMatch[1]) - 1 }

  // 10-digit phone number → guest lookup
  if (/^[6-9]\d{9}$/.test(trimmed)) return { cmd: 'PHONE', phone: trimmed }

  if (upper === 'TODAY') return { cmd: 'TODAY' }
  if (upper === 'HELP') return { cmd: 'HELP' }

  // Unknown — default to HELP
  return { cmd: 'HELP' }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPrimaryGuest(bookingGuests: BookingGuestRow[]): GuestRef {
  const primary =
    bookingGuests?.find((bg) => bg.is_primary) ?? bookingGuests?.[0]
  return {
    name: primary?.guests?.full_name ?? 'Guest',
    phone: primary?.guests?.phone ?? null,
    email: primary?.guests?.email ?? null,
  }
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  })
}

async function getOwnerPropertyIds(ownerId: string): Promise<string[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('properties')
    .select('id')
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
  return (data ?? []).map((p) => p.id)
}

// ---------------------------------------------------------------------------
// Command: TODAY
// ---------------------------------------------------------------------------

async function handleToday(ownerId: string): Promise<string> {
  const supabase = createServiceClient()
  const today = todayIST()
  const propertyIds = await getOwnerPropertyIds(ownerId)

  if (!propertyIds.length) return '❌ No properties found. Set up your property at homestaypms.com'

  const [{ data: arrivals }, { data: departures }, { data: inhouse }] =
    await Promise.all([
      supabase
        .from('bookings')
        .select(
          'id, check_in_date, check_out_date, rooms(name), booking_guests(is_primary, guests(full_name, phone, email))'
        )
        .in('property_id', propertyIds)
        .eq('check_in_date', today)
        .in('status', ['confirmed', 'pending'])
        .is('deleted_at', null)
        .order('created_at'),

      supabase
        .from('bookings')
        .select(
          'id, check_in_date, check_out_date, total_amount_paise, payment_status, rooms(name), booking_guests(is_primary, guests(full_name, phone, email))'
        )
        .in('property_id', propertyIds)
        .eq('check_out_date', today)
        .eq('status', 'checked_in')
        .is('deleted_at', null)
        .order('created_at'),

      supabase
        .from('bookings')
        .select('id')
        .in('property_id', propertyIds)
        .eq('status', 'checked_in')
        .is('deleted_at', null),
    ])

  let reply = `📅 *${fmtDate(today)}*\n\n`

  // Arrivals
  if (arrivals?.length) {
    reply += `🟢 *Arrivals (${arrivals.length})*\n`
    arrivals.forEach((b, i) => {
      const guest = getPrimaryGuest(b.booking_guests as unknown as BookingGuestRow[])
      const room = (b.rooms as unknown as BookingRoomRow | null)?.name ?? 'Room'
      reply += `A${i + 1}. ${guest.name} → ${room}\n`
    })
  } else {
    reply += `🟢 *Arrivals:* None today\n`
  }

  reply += '\n'

  // Departures
  if (departures?.length) {
    reply += `🔴 *Departures (${departures.length})*\n`
    departures.forEach((b, i) => {
      const guest = getPrimaryGuest(b.booking_guests as unknown as BookingGuestRow[])
      const room = (b.rooms as unknown as BookingRoomRow | null)?.name ?? 'Room'
      const paid = b.payment_status === 'paid' ? '✓ Paid' : '⚠️ Pending'
      reply += `D${i + 1}. ${guest.name} → ${room} | ${paid}\n`
    })
  } else {
    reply += `🔴 *Departures:* None today\n`
  }

  reply += `\n🏠 In-house: ${inhouse?.length ?? 0} guest(s)\n`
  reply += `\nReply *A1*, *D1* etc. for details.`

  return reply
}

// ---------------------------------------------------------------------------
// Command: A<n> — arrival detail
// ---------------------------------------------------------------------------

async function handleArrival(ownerId: string, index: number): Promise<string> {
  const supabase = createServiceClient()
  const today = todayIST()
  const propertyIds = await getOwnerPropertyIds(ownerId)

  const { data: arrivals } = await supabase
    .from('bookings')
    .select(
      'id, check_in_date, check_out_date, total_amount_paise, payment_status, num_adults, num_children, special_requests, rooms(name), booking_guests(is_primary, guests(full_name, phone, email))'
    )
    .in('property_id', propertyIds)
    .eq('check_in_date', today)
    .in('status', ['confirmed', 'pending'])
    .is('deleted_at', null)
    .order('created_at')

  const booking = arrivals?.[index]
  if (!booking) {
    return `❌ Arrival A${index + 1} not found.\nReply *TODAY* to see today's list.`
  }

  const guest = getPrimaryGuest(booking.booking_guests as unknown as BookingGuestRow[])
  const room = (booking.rooms as unknown as BookingRoomRow | null)?.name ?? 'Room'

  let reply = `*A${index + 1} — ${guest.name}*\n\n`
  reply += `🏠 ${room}\n`
  reply += `📅 ${fmtDate(booking.check_in_date)} → ${fmtDate(booking.check_out_date)}\n`
  reply += `👥 ${booking.num_adults} adult${booking.num_adults !== 1 ? 's' : ''}`
  if (booking.num_children) reply += `, ${booking.num_children} child`
  reply += '\n'
  if (guest.phone) reply += `📱 ${guest.phone}\n`
  if (guest.email) reply += `📧 ${guest.email}\n`
  reply += `💰 ₹${formatRupees(booking.total_amount_paise)} — ${booking.payment_status}\n`
  if (booking.special_requests) reply += `📝 ${booking.special_requests}\n`

  return reply
}

// ---------------------------------------------------------------------------
// Command: D<n> — departure detail
// ---------------------------------------------------------------------------

async function handleDeparture(ownerId: string, index: number): Promise<string> {
  const supabase = createServiceClient()
  const today = todayIST()
  const propertyIds = await getOwnerPropertyIds(ownerId)

  const { data: departures } = await supabase
    .from('bookings')
    .select(
      'id, check_in_date, check_out_date, total_amount_paise, payment_status, num_adults, num_children, rooms(name), booking_guests(is_primary, guests(full_name, phone, email))'
    )
    .in('property_id', propertyIds)
    .eq('check_out_date', today)
    .eq('status', 'checked_in')
    .is('deleted_at', null)
    .order('created_at')

  const booking = departures?.[index]
  if (!booking) {
    return `❌ Departure D${index + 1} not found.\nReply *TODAY* to see today's list.`
  }

  const guest = getPrimaryGuest(booking.booking_guests as unknown as BookingGuestRow[])
  const room = (booking.rooms as unknown as BookingRoomRow | null)?.name ?? 'Room'
  const isPaid = booking.payment_status === 'paid'

  let reply = `*D${index + 1} — ${guest.name}*\n\n`
  reply += `🏠 ${room}\n`
  reply += `📅 Stayed: ${fmtDate(booking.check_in_date)} → ${fmtDate(booking.check_out_date)}\n`
  reply += `👥 ${booking.num_adults} adult${booking.num_adults !== 1 ? 's' : ''}`
  if (booking.num_children) reply += `, ${booking.num_children} child`
  reply += '\n'
  if (guest.phone) reply += `📱 ${guest.phone}\n`
  reply += `💰 ₹${formatRupees(booking.total_amount_paise)} — ${isPaid ? '✅ Paid' : '⚠️ ' + booking.payment_status}\n`
  reply += `\n📤 Checkout by 11:00 AM`

  return reply
}

// ---------------------------------------------------------------------------
// Command: <phone> — guest lookup
// ---------------------------------------------------------------------------

async function handlePhoneLookup(phone: string): Promise<string> {
  const supabase = createServiceClient()

  const { data: guests } = await supabase
    .from('guests')
    .select(
      'id, full_name, phone, email, booking_guests(is_primary, bookings(check_in_date, check_out_date, status, rooms(name)))'
    )
    .eq('phone', phone)
    .is('deleted_at', null)
    .limit(1)

  const guest = guests?.[0]
  if (!guest) {
    return `❌ No guest found with phone ${phone}.\n\nDouble-check the number and try again.`
  }

  type BookingGuestBooking = {
    is_primary: boolean
    bookings: {
      check_in_date: string
      check_out_date: string
      status: string
      rooms: { name: string } | null
    } | null
  }

  const bookingGuests = (guest.booking_guests as unknown as BookingGuestBooking[]) ?? []
  const recentBookings = bookingGuests
    .filter((bg) => bg.bookings)
    .slice(-5)
    .reverse()

  let reply = `👤 *${guest.full_name}*\n`
  reply += `📱 ${guest.phone}\n`
  if (guest.email) reply += `📧 ${guest.email}\n`

  if (recentBookings.length) {
    reply += `\n*Recent stays:*\n`
    recentBookings.forEach((bg) => {
      const b = bg.bookings!
      reply += `• ${b.rooms?.name ?? 'Room'}: ${fmtDate(b.check_in_date)} → ${fmtDate(b.check_out_date)} _(${b.status})_\n`
    })
  } else {
    reply += `\nNo previous stays on record.`
  }

  return reply
}

// ---------------------------------------------------------------------------
// HELP
// ---------------------------------------------------------------------------

function handleHelp(): string {
  return (
    `*HomeStayPMS Commands* 🏠\n\n` +
    `*TODAY* — Arrivals & departures\n` +
    `*A1*, *A2*... — Arrival details\n` +
    `*D1*, *D2*... — Departure details\n` +
    `*9876543210* — Guest lookup by phone\n\n` +
    `_Tip: Send TODAY every morning to see the day's schedule._\n\n` +
    `Manage bookings at homestaypms.com`
  )
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export async function handleCommand(
  text: string,
  ownerId: string
): Promise<string> {
  const parsed = parseCommand(text)

  try {
    switch (parsed.cmd) {
      case 'TODAY':
        return await handleToday(ownerId)
      case 'ARRIVAL':
        return await handleArrival(ownerId, parsed.index ?? 0)
      case 'DEPARTURE':
        return await handleDeparture(ownerId, parsed.index ?? 0)
      case 'PHONE':
        return await handlePhoneLookup(parsed.phone!)
      case 'HELP':
      default: {
        // Before showing help, check if this looks like an OTA booking confirmation
        const otaParsed = parseOTAConfirmation(text)
        if (otaParsed) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://homestaypms.com'
          return formatBookingReply(otaParsed, appUrl)
        }
        return handleHelp()
      }
    }
  } catch (err) {
    console.error('[WhatsApp Commands] Error handling command:', parsed.cmd, err)
    return `⚠️ Something went wrong. Try again or visit homestaypms.com`
  }
}
