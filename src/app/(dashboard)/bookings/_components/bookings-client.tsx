'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { startOfDay, addDays, subDays } from 'date-fns'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePropertyStore } from '@/stores/property-store'
import { BookingCalendar, type BookingWithGuest } from './booking-calendar'
import { NewBookingSheet } from './new-booking-sheet'
import { BookingDetailSheet } from './booking-detail-sheet'
import { QuickBookingModal } from './quick-booking-modal'
import type { Property, Room } from '@/types'

const NUM_DAYS = 14

export function BookingsClient() {
  const supabase = createClient()

  // ── Property store ───────────────────────────────────────────────────────
  const { properties, activePropertyId, setActiveProperty, fetchProperties } = usePropertyStore()

  useEffect(() => {
    fetchProperties(supabase)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Date range ───────────────────────────────────────────────────────────
  const [startDate, setStartDate] = useState<Date>(() => startOfDay(new Date()))

  function navigate(direction: 'prev' | 'next' | 'today') {
    if (direction === 'today') {
      setStartDate(startOfDay(new Date()))
    } else if (direction === 'next') {
      setStartDate((d) => addDays(d, NUM_DAYS))
    } else {
      setStartDate((d) => subDays(d, NUM_DAYS))
    }
  }

  // ── Rooms for active property ─────────────────────────────────────────────
  const [rooms, setRooms] = useState<Room[]>([])

  const fetchRooms = useCallback(async () => {
    if (!activePropertyId) { setRooms([]); return }
    const { data } = await supabase
      .from('rooms')
      .select('*')
      .eq('property_id', activePropertyId)
      .is('deleted_at', null)
      .order('name')
    setRooms((data ?? []) as Room[])
  }, [activePropertyId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchRooms() }, [fetchRooms])

  // ── Bookings for visible range ────────────────────────────────────────────
  const [bookings, setBookings] = useState<BookingWithGuest[]>([])
  const [loadingBookings, setLoadingBookings] = useState(false)

  const fetchBookings = useCallback(async () => {
    if (!activePropertyId) { setBookings([]); return }
    setLoadingBookings(true)

    const rangeStart = startDate.toISOString().split('T')[0]
    const rangeEnd = addDays(startDate, NUM_DAYS).toISOString().split('T')[0]

    // Fetch bookings that overlap the visible range:
    // check_in_date < rangeEnd AND check_out_date > rangeStart
    const { data: bookingRows } = await supabase
      .from('bookings')
      .select(`
        id, property_id, room_id, check_in_date, check_out_date,
        status, source, rate_per_night_paise, total_amount_paise,
        payment_status, payment_method, special_requests,
        num_adults, num_children, num_nights,
        created_at, updated_at, deleted_at,
        booking_guests (
          guest_id, is_primary,
          guests ( id, full_name )
        )
      `)
      .eq('property_id', activePropertyId)
      .is('deleted_at', null)
      .lt('check_in_date', rangeEnd)
      .gt('check_out_date', rangeStart)

    const result: BookingWithGuest[] = (bookingRows ?? []).map((b) => {
      // Find primary guest name
      const guests = (b.booking_guests ?? []) as unknown as {
        guest_id: string
        is_primary: boolean
        guests: { id: string; full_name: string } | null
      }[]
      const primary = guests.find((g) => g.is_primary) ?? guests[0]
      const guestName = primary?.guests?.full_name ?? 'Guest'

      return {
        id: b.id,
        property_id: b.property_id,
        room_id: b.room_id,
        check_in_date: b.check_in_date,
        check_out_date: b.check_out_date,
        status: b.status,
        source: b.source,
        rate_per_night_paise: b.rate_per_night_paise,
        total_amount_paise: b.total_amount_paise,
        payment_status: b.payment_status,
        payment_method: b.payment_method,
        special_requests: b.special_requests,
        num_adults: b.num_adults,
        num_children: b.num_children,
        num_nights: b.num_nights,
        created_at: b.created_at,
        updated_at: b.updated_at,
        deleted_at: b.deleted_at,
        guest_name: guestName,
      }
    })

    setBookings(result)
    setLoadingBookings(false)
  }, [activePropertyId, startDate]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchBookings() }, [fetchBookings])

  // ── Sheet / modal state ───────────────────────────────────────────────────
  const [newSheetOpen, setNewSheetOpen] = useState(false)
  const [newBookingPrefill, setNewBookingPrefill] = useState<{
    roomId?: string
    date?: Date
    propertyId?: string
  } | null>(null)

  const [detailSheetOpen, setDetailSheetOpen] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<BookingWithGuest | null>(null)

  const [quickOpen, setQuickOpen] = useState(false)

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleCellClick(roomId: string, date: Date) {
    setNewBookingPrefill({ roomId, date, propertyId: activePropertyId ?? undefined })
    setNewSheetOpen(true)
  }

  function handleBookingClick(booking: BookingWithGuest) {
    setSelectedBooking(booking)
    setDetailSheetOpen(true)
  }

  function handleCreated() {
    fetchBookings()
    fetchRooms()
  }

  function handleUpdated() {
    fetchBookings()
  }

  const activeProperty = properties.find((p) => p.id === activePropertyId)
  const selectedRoom = selectedBooking
    ? rooms.find((r) => r.id === selectedBooking.room_id)
    : null

  return (
    <div className="flex flex-col h-full space-y-4" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* ── Top bar: property filter + heading ──────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-lg font-semibold text-gray-900 shrink-0">Bookings</h1>
          {properties.length > 1 && (
            <Select
              value={activePropertyId ?? ''}
              onValueChange={(v) => setActiveProperty(v)}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All properties" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {properties.length === 1 && activeProperty && (
            <span className="text-sm text-gray-500 truncate">{activeProperty.name}</span>
          )}
        </div>

        <Button
          size="sm"
          onClick={() => {
            setNewBookingPrefill({ propertyId: activePropertyId ?? undefined })
            setNewSheetOpen(true)
          }}
          className="gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Booking</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* ── No property selected ────────────────────────────────────────── */}
      {!activePropertyId && (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 text-sm">No property selected.</p>
          <p className="text-gray-400 text-xs mt-1">
            Add a property in Settings to see the calendar.
          </p>
        </div>
      )}

      {/* ── Calendar ──────────────────────────────────────────────────────── */}
      {activePropertyId && (
        <div className="flex-1 min-h-0">
          {loadingBookings && rooms.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
              Loading calendar…
            </div>
          ) : (
            <BookingCalendar
              rooms={rooms}
              bookings={bookings}
              startDate={startDate}
              numDays={NUM_DAYS}
              onNavigate={navigate}
              onCellClick={handleCellClick}
              onBookingClick={handleBookingClick}
            />
          )}
        </div>
      )}

      {/* ── Floating Action Button (Quick Booking) ─────────────────────── */}
      <button
        onClick={() => setQuickOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center"
        title="Quick booking"
        aria-label="Quick booking"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* ── Sheets + Modals ─────────────────────────────────────────────── */}
      <NewBookingSheet
        open={newSheetOpen}
        onOpenChange={setNewSheetOpen}
        properties={properties}
        prefill={newBookingPrefill}
        onCreated={handleCreated}
      />

      <BookingDetailSheet
        booking={selectedBooking}
        room={selectedRoom}
        property={activeProperty}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
        onUpdated={handleUpdated}
      />

      <QuickBookingModal
        open={quickOpen}
        onOpenChange={setQuickOpen}
        properties={properties}
        activePropertyId={activePropertyId}
        onCreated={handleCreated}
      />
    </div>
  )
}
