import { createServiceClient } from '@/lib/supabase/service'
import { CheckinForm } from './_components/checkin-form'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { IdDocumentType } from '@/types'

interface Props {
  params: Promise<{ token: string }>
}

// ── Helper components ────────────────────────────────────────────────────────

function ErrorPage({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-600">{message}</p>
      </div>
    </div>
  )
}

function AlreadyCompleted({ propertyName }: { propertyName?: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">Already Submitted</h1>
        <p className="text-sm text-gray-600">
          Your check-in details for {propertyName ?? 'this property'} have already been
          submitted. See you soon!
        </p>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function CheckinPage({ params }: Props) {
  const { token } = await params

  // Use service client — this page requires no user auth
  let supabase: ReturnType<typeof createServiceClient>
  try {
    supabase = createServiceClient()
  } catch {
    return (
      <ErrorPage
        title="Configuration Error"
        message="The server is not fully configured. Please contact the property owner."
      />
    )
  }

  const { data: tokenRow } = await supabase
    .from('checkin_tokens')
    .select(`
      id,
      token,
      expires_at,
      completed_at,
      bookings (
        id,
        check_in_date,
        check_out_date,
        num_adults,
        num_children,
        special_requests,
        deleted_at,
        properties (
          id,
          owner_id,
          name,
          address_line1,
          city,
          state,
          phone,
          owner_phone
        ),
        rooms ( name ),
        booking_guests (
          is_primary,
          guests (
            id,
            full_name,
            phone,
            email,
            address,
            city,
            state,
            pincode,
            id_document_type,
            id_document_number,
            nationality,
            is_foreign_national
          )
        )
      )
    `)
    .eq('token', token)
    .maybeSingle()

  if (!tokenRow) {
    return (
      <ErrorPage
        title="Link Not Found"
        message="This check-in link is invalid. Please contact the property."
      />
    )
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return (
      <ErrorPage
        title="Link Expired"
        message="This check-in link has expired (valid for 48 hours). Please contact the property for a new link."
      />
    )
  }

  if (tokenRow.completed_at) {
    const booking = tokenRow.bookings as unknown as BookingWithRelations | null
    return (
      <AlreadyCompleted propertyName={booking?.properties?.name} />
    )
  }

  const booking = tokenRow.bookings as unknown as BookingWithRelations | null

  if (!booking || booking.deleted_at) {
    return (
      <ErrorPage
        title="Booking Not Found"
        message="This booking could not be found. Please contact the property."
      />
    )
  }

  const property = booking.properties
  const room = booking.rooms

  // Find primary guest (or first guest)
  const guestRows = (booking.booking_guests ?? []) as BookingGuestRow[]
  const primaryGuestRow =
    guestRows.find((bg) => bg.is_primary) ?? guestRows[0]
  const guest = primaryGuestRow?.guests ?? null

  return (
    <CheckinForm
      token={token}
      bookingId={booking.id}
      property={{
        name: property?.name ?? 'Property',
        address: [property?.address_line1, property?.city]
          .filter(Boolean)
          .join(', '),
        phone: property?.phone ?? null,
        ownerPhone: property?.owner_phone ?? null,
      }}
      room={{ name: room?.name ?? 'Room' }}
      checkInDate={booking.check_in_date}
      checkOutDate={booking.check_out_date}
      prefill={{
        full_name: guest?.full_name ?? '',
        phone: guest?.phone ?? '',
        email: guest?.email ?? '',
        num_adults: booking.num_adults,
        num_children: booking.num_children,
        special_requests: booking.special_requests ?? '',
        id_type: (guest?.id_document_type as IdDocumentType | null) ?? undefined,
        id_number: guest?.id_document_number ?? '',
        address: guest?.address ?? '',
        city: guest?.city ?? '',
        state: guest?.state ?? '',
        pincode: guest?.pincode ?? '',
      }}
      guestId={guest?.id ?? null}
    />
  )
}

// ── Local types (only used in this file) ─────────────────────────────────────

interface GuestRow {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  id_document_type: string | null
  id_document_number: string | null
  nationality: string
  is_foreign_national: boolean
}

interface BookingGuestRow {
  is_primary: boolean
  guests: GuestRow | null
}

interface BookingWithRelations {
  id: string
  check_in_date: string
  check_out_date: string
  num_adults: number
  num_children: number
  special_requests: string | null
  deleted_at: string | null
  properties: {
    id: string
    owner_id: string
    name: string
    address_line1: string
    city: string
    state: string
    phone: string | null
    owner_phone: string | null
  } | null
  rooms: { name: string } | null
  booking_guests: BookingGuestRow[]
}
