import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GuestDetail } from './guest-detail'
import type { Guest, Booking, Room, Property } from '@/types'

type BookingWithDetails = Booking & {
  rooms: Pick<Room, 'id' | 'name' | 'room_type'> | null
  properties: Pick<Property, 'id' | 'name'> | null
}

export default async function GuestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [guestRes, bookingsRes] = await Promise.all([
    supabase
      .from('guests')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single(),

    supabase
      .from('booking_guests')
      .select(`
        booking_id,
        is_primary,
        bookings (
          id, check_in_date, check_out_date, status, source,
          rate_per_night_paise, total_amount_paise, payment_status, payment_method,
          special_requests, num_adults, num_children, num_nights,
          property_id, room_id, created_at, updated_at, deleted_at,
          rooms ( id, name, room_type ),
          properties ( id, name )
        )
      `)
      .eq('guest_id', id)
      .order('booking_id'),
  ])

  if (guestRes.error || !guestRes.data) notFound()

  // Flatten booking_guests → bookings
  const bookings: BookingWithDetails[] = (bookingsRes.data ?? [])
    .map((bg) => {
      const b = bg.bookings as unknown as BookingWithDetails | null
      return b
    })
    .filter((b): b is BookingWithDetails => b !== null && b.deleted_at === null)

  // Sort newest first
  bookings.sort((a, b) => b.check_in_date.localeCompare(a.check_in_date))

  return <GuestDetail guest={guestRes.data as Guest} bookings={bookings} />
}
