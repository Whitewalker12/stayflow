/**
 * OTA Booking Confirmation Parser
 *
 * Detects and parses booking confirmation messages forwarded by the owner
 * to the HomeStayPMS WhatsApp number.
 *
 * Supported OTAs:
 *   - Airbnb
 *   - MakeMyTrip (MMT)
 *   - Booking.com
 *   - Goibibo
 *
 * Usage:
 *   const result = parseOTAConfirmation(text)
 *   if (result) { // it's an OTA booking }
 */

export type OTASource = 'airbnb' | 'makemytrip' | 'booking_com' | 'goibibo'

export interface ParsedOTABooking {
  source: OTASource
  guestName: string | null
  checkInDate: string | null   // YYYY-MM-DD or null
  checkOutDate: string | null  // YYYY-MM-DD or null
  nights: number | null
  amountRupees: number | null
  confirmationCode: string | null
}

// ---------------------------------------------------------------------------
// Date parsing — handles Indian OTA date formats
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

function toISO(dateStr: string): string | null {
  if (!dateStr) return null
  const s = dateStr.trim()

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // "15 Apr 2025" or "Apr 15, 2025" or "Apr 15 2025"
  const wordy = s.match(/(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/) ||
                s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/)
  if (wordy) {
    // Determine which group is day vs month
    let day: number, monthName: string, year: number
    if (/^\d/.test(wordy[1])) {
      // "15 Apr 2025"
      day = parseInt(wordy[1])
      monthName = wordy[2].toLowerCase()
      year = parseInt(wordy[3])
    } else {
      // "Apr 15, 2025"
      monthName = wordy[1].toLowerCase()
      day = parseInt(wordy[2])
      year = parseInt(wordy[3])
    }
    const month = MONTHS[monthName]
    if (month) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  return null
}

/** Extract two dates from a date range string like "Apr 15 – Apr 18, 2025" */
function extractDateRange(text: string): [string | null, string | null] {
  // Pattern: date SEPARATOR date — handles –, -, —, "to"
  // Covers: "Apr 15, 2025 – Apr 18, 2025", "15 Apr - 18 Apr 2025", etc.

  const rangePat = new RegExp(
    // First date
    '(\\d{1,2}\\s+[A-Za-z]{3,9},?\\s+\\d{4}|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{4})' +
    '\\s*[–\\-—](?:to)?\\s*' +
    // Second date
    '(\\d{1,2}\\s+[A-Za-z]{3,9},?\\s+\\d{4}|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{4})',
    'i'
  )

  const m = text.match(rangePat)
  if (m) return [toISO(m[1]), toISO(m[2])]

  // Fallback: two separate date mentions (check-in / check-out labels)
  const checkinMatch = text.match(/(?:check[\s-]*in|arrival|from)[:\s]+([A-Za-z0-9,\s\/\-]+?)(?:\n|check|depart|to\s)/i)
  const checkoutMatch = text.match(/(?:check[\s-]*out|departure|to|until)[:\s]+([A-Za-z0-9,\s\/\-]+?)(?:\n|$)/i)

  return [
    checkinMatch ? toISO(checkinMatch[1].trim()) : null,
    checkoutMatch ? toISO(checkoutMatch[1].trim()) : null,
  ]
}

/** Extract amount in rupees from text */
function extractAmount(text: string): number | null {
  // Matches: ₹12,500 | Rs. 12500 | INR 12,500 | Total: 12500
  const m = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+)/i) ||
            text.match(/(?:total|amount|price|fare)[:\s]+(?:₹|rs\.?|inr)?\s*([\d,]+)/i)
  if (!m) return null
  const n = parseInt(m[1].replace(/,/g, ''))
  return isNaN(n) ? null : n
}

// ---------------------------------------------------------------------------
// OTA-specific parsers
// ---------------------------------------------------------------------------

function parseAirbnb(text: string): ParsedOTABooking | null {
  // Keywords: "airbnb", "confirmation code", "reservation"
  if (!/airbnb/i.test(text) && !/confirmation\s*code/i.test(text)) return null

  // Confirmation code: HMXYZ123
  const codeMatch = text.match(/(?:confirmation\s*code|code)[:\s]+([A-Z0-9]{6,12})/i)

  // Guest name: usually "Guest: Name" or first prominent name line
  const guestMatch =
    text.match(/(?:guest|name)[:\s]+([A-Za-z][\w\s]{2,40}?)(?:\n|,|$)/i) ||
    text.match(/(?:reservation\s+for|booked\s+by)\s+([A-Za-z][\w\s]{2,30}?)(?:\n|,|$)/i)

  const [checkIn, checkOut] = extractDateRange(text)

  // Nights
  const nightsMatch = text.match(/(\d+)\s*night/i)

  return {
    source: 'airbnb',
    guestName: guestMatch?.[1]?.trim() ?? null,
    checkInDate: checkIn,
    checkOutDate: checkOut,
    nights: nightsMatch ? parseInt(nightsMatch[1]) : null,
    amountRupees: extractAmount(text),
    confirmationCode: codeMatch?.[1] ?? null,
  }
}

function parseMakeMyTrip(text: string): ParsedOTABooking | null {
  if (!/makemytrip|mmt/i.test(text)) return null

  // Booking ID: HTLXXXXX
  const codeMatch = text.match(/(?:booking\s*id|booking\s*no|ref(?:erence)?)[:\s]+([A-Z0-9\-]{5,20})/i)

  // Guest name
  const guestMatch = text.match(/(?:guest|lead\s*guest|booked\s*(?:by|for))[:\s]+([A-Za-z][\w\s]{2,40}?)(?:\n|,|$)/i)

  const [checkIn, checkOut] = extractDateRange(text)
  const nightsMatch = text.match(/(\d+)\s*night/i)

  return {
    source: 'makemytrip',
    guestName: guestMatch?.[1]?.trim() ?? null,
    checkInDate: checkIn,
    checkOutDate: checkOut,
    nights: nightsMatch ? parseInt(nightsMatch[1]) : null,
    amountRupees: extractAmount(text),
    confirmationCode: codeMatch?.[1] ?? null,
  }
}

function parseBookingCom(text: string): ParsedOTABooking | null {
  if (!/booking\.com/i.test(text) && !/reservation\s*number/i.test(text)) return null

  const codeMatch = text.match(/(?:reservation\s*(?:number|id|no)|pin)[:\s]+([0-9\-]{4,20})/i)

  const guestMatch = text.match(/(?:guest|name|booker)[:\s]+([A-Za-z][\w\s]{2,40}?)(?:\n|,|$)/i)

  const [checkIn, checkOut] = extractDateRange(text)
  const nightsMatch = text.match(/(\d+)\s*night/i)

  return {
    source: 'booking_com',
    guestName: guestMatch?.[1]?.trim() ?? null,
    checkInDate: checkIn,
    checkOutDate: checkOut,
    nights: nightsMatch ? parseInt(nightsMatch[1]) : null,
    amountRupees: extractAmount(text),
    confirmationCode: codeMatch?.[1] ?? null,
  }
}

function parseGoibibo(text: string): ParsedOTABooking | null {
  if (!/goibibo/i.test(text)) return null

  const codeMatch = text.match(/(?:booking\s*id|ref)[:\s]+([A-Z0-9\-]{5,20})/i)
  const guestMatch = text.match(/(?:guest|name)[:\s]+([A-Za-z][\w\s]{2,40}?)(?:\n|,|$)/i)
  const [checkIn, checkOut] = extractDateRange(text)
  const nightsMatch = text.match(/(\d+)\s*night/i)

  return {
    source: 'goibibo',
    guestName: guestMatch?.[1]?.trim() ?? null,
    checkInDate: checkIn,
    checkOutDate: checkOut,
    nights: nightsMatch ? parseInt(nightsMatch[1]) : null,
    amountRupees: extractAmount(text),
    confirmationCode: codeMatch?.[1] ?? null,
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Try to parse an OTA booking confirmation from forwarded text.
 * Returns null if the text doesn't look like a booking confirmation.
 */
export function parseOTAConfirmation(text: string): ParsedOTABooking | null {
  if (!text || text.length < 30) return null

  return (
    parseAirbnb(text) ??
    parseMakeMyTrip(text) ??
    parseBookingCom(text) ??
    parseGoibibo(text) ??
    null
  )
}

/**
 * Format a ParsedOTABooking into a WhatsApp reply summary.
 * Includes a deep link to pre-fill the new booking form.
 */
export function formatBookingReply(
  booking: ParsedOTABooking,
  appUrl: string
): string {
  const sourceLabels: Record<OTASource, string> = {
    airbnb: 'Airbnb',
    makemytrip: 'MakeMyTrip',
    booking_com: 'Booking.com',
    goibibo: 'Goibibo',
  }

  const source = sourceLabels[booking.source]
  const checkin = booking.checkInDate ? fmtDate(booking.checkInDate) : '?'
  const checkout = booking.checkOutDate ? fmtDate(booking.checkOutDate) : '?'
  const nights = booking.nights
    ? `${booking.nights} night${booking.nights !== 1 ? 's' : ''}`
    : booking.checkInDate && booking.checkOutDate
    ? calcNights(booking.checkInDate, booking.checkOutDate)
    : null
  const amount = booking.amountRupees
    ? `₹${booking.amountRupees.toLocaleString('en-IN')}`
    : 'Amount unknown'

  // Build deep link with pre-filled params
  const params = new URLSearchParams()
  if (booking.guestName) params.set('guest_name', booking.guestName)
  if (booking.checkInDate) params.set('check_in', booking.checkInDate)
  if (booking.checkOutDate) params.set('check_out', booking.checkOutDate)
  params.set('source', booking.source)
  if (booking.amountRupees) params.set('amount', String(booking.amountRupees))
  if (booking.confirmationCode) params.set('ref', booking.confirmationCode)

  const link = `${appUrl}/bookings/new?${params.toString()}`

  let reply = `📋 *${source} Booking Detected!*\n\n`
  if (booking.guestName) reply += `👤 Guest: ${booking.guestName}\n`
  reply += `📅 ${checkin} → ${checkout}`
  if (nights) reply += ` (${nights})`
  reply += '\n'
  reply += `💰 ${amount}\n`
  if (booking.confirmationCode) reply += `🔖 Ref: ${booking.confirmationCode}\n`

  reply += `\n👉 Add booking:\n${link}`
  reply += `\n\n_Tap the link to open a pre-filled booking form._`

  return reply
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

function calcNights(checkIn: string, checkOut: string): string {
  const diff =
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) /
    (1000 * 60 * 60 * 24)
  const n = Math.round(diff)
  return n > 0 ? `${n} night${n !== 1 ? 's' : ''}` : ''
}
