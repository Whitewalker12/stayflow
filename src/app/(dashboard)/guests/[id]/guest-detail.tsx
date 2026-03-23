'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GuestForm } from '../_components/guest-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Globe, Pencil, Trash2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { format, parseISO, differenceInDays } from 'date-fns'
import { formatCurrency } from '@/lib/utils/currency'
import type { Guest, Booking, Room, Property, BookingStatus, PaymentStatus } from '@/types'

type BookingWithDetails = Booking & {
  rooms: Pick<Room, 'id' | 'name' | 'room_type'> | null
  properties: Pick<Property, 'id' | 'name'> | null
}

function formatDate(iso: string): string {
  try { return format(parseISO(iso), 'd MMM yyyy') } catch { return iso }
}

const BOOKING_STATUS_STYLES: Record<BookingStatus, string> = {
  pending:     'bg-yellow-50 text-yellow-700 border-yellow-200',
  confirmed:   'bg-blue-50 text-blue-700 border-blue-200',
  checked_in:  'bg-green-50 text-green-700 border-green-200',
  checked_out: 'bg-gray-50 text-gray-600 border-gray-200',
  cancelled:   'bg-red-50 text-red-600 border-red-200',
  no_show:     'bg-orange-50 text-orange-700 border-orange-200',
}

const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  pending:  'bg-yellow-50 text-yellow-700 border-yellow-200',
  partial:  'bg-orange-50 text-orange-700 border-orange-200',
  paid:     'bg-green-50 text-green-700 border-green-200',
  refunded: 'bg-purple-50 text-purple-700 border-purple-200',
}

export function GuestDetail({
  guest,
  bookings,
}: {
  guest: Guest
  bookings: BookingWithDetails[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [isEditing, setIsEditing] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    await supabase
      .from('guests')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', guest.id)
    setDeleting(false)
    router.push('/guests')
  }

  if (isEditing) {
    return (
      <div>
        <button
          onClick={() => setIsEditing(false)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Cancel editing
        </button>
        <GuestForm guest={guest} onSaved={() => setIsEditing(false)} />
      </div>
    )
  }

  const nights = bookings.reduce((sum, b) => {
    if (b.status === 'cancelled' || b.status === 'no_show') return sum
    return sum + differenceInDays(parseISO(b.check_out_date), parseISO(b.check_in_date))
  }, 0)

  const totalSpent = bookings
    .filter((b) => b.status !== 'cancelled' && b.status !== 'no_show')
    .reduce((sum, b) => sum + b.total_amount_paise, 0)

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/guests"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="w-4 h-4" />
        Guests
      </Link>

      {/* Profile header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-xl font-semibold text-gray-600 shrink-0">
              {guest.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-900">{guest.full_name}</h1>
                {guest.is_foreign_national && (
                  <Globe className="w-4 h-4 text-amber-500" aria-label="Foreign national" />
                )}
              </div>
              {guest.phone && (
                <p className="text-sm text-gray-500">+91 {guest.phone}</p>
              )}
              {guest.email && (
                <p className="text-sm text-gray-500">{guest.email}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 hover:text-red-700 hover:border-red-200"
              onClick={() => setShowDelete(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Visits</p>
            <p className="text-2xl font-semibold text-gray-900 mt-0.5">
              {bookings.filter((b) => b.status !== 'cancelled' && b.status !== 'no_show').length}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Nights</p>
            <p className="text-2xl font-semibold text-gray-900 mt-0.5">{nights}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total spent</p>
            <p className="text-2xl font-semibold text-gray-900 mt-0.5">
              {formatCurrency(totalSpent)}
            </p>
          </div>
        </div>

        {/* Details grid */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-5 pt-5 border-t border-gray-100 text-sm">
          {guest.nationality && (
            <>
              <dt className="text-gray-500">Nationality</dt>
              <dd className="text-gray-900">
                {guest.nationality}
                {guest.is_foreign_national && (
                  <Badge variant="outline" className="ml-2 text-amber-600 border-amber-200 bg-amber-50 text-xs">
                    Foreign national
                  </Badge>
                )}
              </dd>
            </>
          )}
          {guest.id_document_type && (
            <>
              <dt className="text-gray-500">ID document</dt>
              <dd className="text-gray-900 font-mono">
                {guest.id_document_type.replace('_', ' ')} — {guest.id_document_number ?? '—'}
              </dd>
            </>
          )}
          {(guest.address || guest.city) && (
            <>
              <dt className="text-gray-500">Address</dt>
              <dd className="text-gray-900">
                {[guest.address, guest.city, guest.state, guest.pincode]
                  .filter(Boolean)
                  .join(', ')}
              </dd>
            </>
          )}
          {guest.notes && (
            <>
              <dt className="text-gray-500">Notes</dt>
              <dd className="text-gray-900">{guest.notes}</dd>
            </>
          )}
        </dl>
      </div>

      {/* Visit history */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-medium text-gray-900">Visit history</h2>
        </div>

        {bookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-gray-500 text-sm">No bookings yet</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property / Room</TableHead>
                <TableHead className="hidden sm:table-cell">Dates</TableHead>
                <TableHead className="hidden md:table-cell">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((booking) => {
                const nights = differenceInDays(
                  parseISO(booking.check_out_date),
                  parseISO(booking.check_in_date)
                )
                return (
                  <TableRow
                    key={booking.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/bookings/${booking.id}`)}
                  >
                    <TableCell>
                      <p className="font-medium text-gray-900">
                        {booking.properties?.name ?? '—'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {booking.rooms?.name ?? '—'}
                      </p>
                      <p className="text-xs text-gray-400 sm:hidden mt-0.5">
                        {formatDate(booking.check_in_date)} · {nights}n
                      </p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-gray-600">
                      <p>{formatDate(booking.check_in_date)}</p>
                      <p className="text-xs text-gray-400">
                        → {formatDate(booking.check_out_date)} · {nights} night{nights !== 1 ? 's' : ''}
                      </p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-gray-900 font-medium">
                      {formatCurrency(booking.total_amount_paise)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={BOOKING_STATUS_STYLES[booking.status]}
                      >
                        {booking.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge
                        variant="outline"
                        className={PAYMENT_STATUS_STYLES[booking.payment_status]}
                      >
                        {booking.payment_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Delete dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete guest?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            <strong>{guest.full_name}</strong> will be removed from your guest registry.
            Their booking history will be preserved.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? 'Deleting…' : 'Delete guest'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
