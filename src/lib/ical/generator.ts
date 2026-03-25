/**
 * Generate a valid iCal (RFC 5545) calendar feed from StayFlow bookings.
 * Used by the public export endpoint so OTAs can subscribe to room availability.
 */

interface BookingForExport {
  id: string
  check_in_date: string   // YYYY-MM-DD
  check_out_date: string  // YYYY-MM-DD
}

interface RoomForExport {
  id: string
  name: string
  property_name: string
}

/** Format a YYYY-MM-DD date to iCal DATE format: YYYYMMDD */
function toICalDate(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

/** Current UTC timestamp in iCal DTSTAMP format */
function nowDtStamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}

export function generateICal(room: RoomForExport, bookings: BookingForExport[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HomeStayPMS//PMS//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${room.name} - ${room.property_name}`,
    'X-WR-TIMEZONE:Asia/Kolkata',
    'X-WR-CALDESC:Availability calendar managed by HomeStayPMS',
  ]

  const dtstamp = nowDtStamp()

  for (const booking of bookings) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${booking.id}@homestaypms.com`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${toICalDate(booking.check_in_date)}`,
      `DTEND;VALUE=DATE:${toICalDate(booking.check_out_date)}`,
      'SUMMARY:Booked - HomeStayPMS',
      'DESCRIPTION:Booking managed via HomeStayPMS',
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT'
    )
  }

  lines.push('END:VCALENDAR')

  // RFC 5545 requires CRLF line endings
  return lines.join('\r\n')
}
