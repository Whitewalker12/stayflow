import type { Metadata } from 'next'
import { BookingsClient } from './_components/bookings-client'

export const metadata: Metadata = {
  title: 'Bookings',
  robots: { index: false, follow: false },
}

interface BookingsPageProps {
  searchParams: {
    guest_name?: string
    check_in?: string
    check_out?: string
    source?: string
    amount?: string
    ref?: string
  }
}

export default function BookingsPage({ searchParams }: BookingsPageProps) {
  return <BookingsClient otaPrefill={searchParams} />
}
