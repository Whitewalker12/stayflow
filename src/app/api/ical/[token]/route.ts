/**
 * Public iCal export endpoint — no authentication required.
 * URL: /api/ical/[token]  (token = rooms.ical_export_token UUID)
 *
 * OTAs (Airbnb, Booking.com) subscribe to this URL to block dates
 * when HomeStayPMS has confirmed bookings.
 *
 * Security: The token is an unguessable UUID stored in the rooms table.
 * No guest data is exposed — only "Booked" events are shown.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { generateICal } from '@/lib/ical/generator'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!token || token.length < 8) {
    return new Response('Invalid token', { status: 400 })
  }

  const supabase = createServiceClient()

  // Look up the room by its ical_export_token
  const { data: room, error } = await supabase
    .from('rooms')
    .select('id, name, property_id, properties(name)')
    .eq('ical_export_token', token)
    .is('deleted_at', null)
    .single()

  if (error || !room) {
    return new Response('Calendar not found', { status: 404 })
  }

  const propertyName =
    (room.properties as unknown as { name: string } | null)?.name ?? 'Property'

  // Fetch upcoming bookings (pending / confirmed / checked_in)
  const today = new Date().toISOString().split('T')[0]

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, check_in_date, check_out_date')
    .eq('room_id', room.id)
    .is('deleted_at', null)
    .in('status', ['pending', 'confirmed', 'checked_in'])
    .gte('check_out_date', today)

  const ical = generateICal(
    { id: room.id, name: room.name, property_name: propertyName },
    (bookings ?? []) as { id: string; check_in_date: string; check_out_date: string }[]
  )

  return new Response(ical, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${room.name}.ics"`,
      // Allow OTAs to cache for up to 1 hour
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
