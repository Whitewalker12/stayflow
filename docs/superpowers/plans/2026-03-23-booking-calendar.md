# Booking Calendar & CRUD Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete booking management system — calendar grid view, new booking sheet, booking detail sheet, quick booking modal, and availability API.

**Architecture:** Custom CSS Grid calendar (rooms × dates), client-side interactive with Supabase queries. All booking mutations go through direct Supabase client calls with Zod validation. Sheets slide from the right using shadcn/ui Sheet component.

**Tech Stack:** Next.js 14 App Router, Supabase client, shadcn/ui (Sheet, Dialog, Select, Badge), Tailwind CSS, date-fns, Zod, Zustand (property store)

---

## File Map

| File | Purpose |
|------|---------|
| `src/lib/validations/booking.ts` | Zod schema: booking create/edit, quick booking |
| `src/app/api/bookings/check-availability/route.ts` | GET endpoint: room+date conflict check |
| `src/app/(dashboard)/bookings/page.tsx` | Root page — passes data to calendar client component |
| `src/app/(dashboard)/bookings/_components/bookings-client.tsx` | Top-level client wrapper (property filter, state, FAB) |
| `src/app/(dashboard)/bookings/_components/booking-calendar.tsx` | Calendar grid: room rows × date columns, booking blocks |
| `src/app/(dashboard)/bookings/_components/new-booking-sheet.tsx` | Slide-out form: create a booking |
| `src/app/(dashboard)/bookings/_components/booking-detail-sheet.tsx` | Slide-out: view/edit booking, status transitions |
| `src/app/(dashboard)/bookings/_components/quick-booking-modal.tsx` | Dialog: minimal fast booking (FAB) |
| `src/app/(dashboard)/bookings/_components/status-badge.tsx` | Shared: color-coded status badge |

---

## Task 1: Zod Validation Schema

**Files:**
- Create: `src/lib/validations/booking.ts`

- [ ] Create the schema:

```typescript
import { z } from 'zod'

export const bookingSchema = z.object({
  property_id: z.string().uuid('Select a property'),
  room_id: z.string().uuid('Select a room'),
  check_in_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid check-in date'),
  check_out_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid check-out date'),
  guest_id: z.string().uuid('Select a guest'),
  num_adults: z.number().int().min(1, 'At least 1 adult required'),
  num_children: z.number().int().min(0).default(0),
  rate_per_night: z.number().positive('Rate must be positive'), // in rupees; converted to paise before save
  source: z.enum([
    'airbnb', 'makemytrip', 'booking_com', 'goibibo',
    'direct', 'walk_in', 'phone', 'referral',
  ]),
  payment_method: z.enum(['upi', 'cash', 'bank_transfer', 'card', 'ota_collected']).optional(),
  amount_paid: z.number().min(0).default(0), // rupees
  ota_booking_id: z.string().optional().or(z.literal('')),
  special_requests: z.string().max(1000).optional().or(z.literal('')),
  internal_notes: z.string().max(1000).optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  if (data.check_out_date <= data.check_in_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['check_out_date'],
      message: 'Check-out must be after check-in',
    })
  }
})

export type BookingFormData = z.infer<typeof bookingSchema>

export const quickBookingSchema = z.object({
  room_id: z.string().uuid('Select a room'),
  check_in_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  check_out_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  guest_name: z.string().min(2, 'Enter guest name'),
  guest_phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter valid 10-digit mobile').optional().or(z.literal('')),
  rate_per_night: z.number().positive('Rate must be positive'),
  source: z.enum([
    'airbnb', 'makemytrip', 'booking_com', 'goibibo',
    'direct', 'walk_in', 'phone', 'referral',
  ]).default('direct'),
}).superRefine((data, ctx) => {
  if (data.check_out_date <= data.check_in_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['check_out_date'],
      message: 'Check-out must be after check-in',
    })
  }
})

export type QuickBookingFormData = z.infer<typeof quickBookingSchema>

export const SOURCE_LABELS: Record<string, string> = {
  airbnb: 'Airbnb',
  makemytrip: 'MakeMyTrip',
  booking_com: 'Booking.com',
  goibibo: 'Goibibo',
  direct: 'Direct',
  walk_in: 'Walk-in',
  phone: 'Phone',
  referral: 'Referral',
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  upi: 'UPI',
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  card: 'Card',
  ota_collected: 'OTA Collected',
}
```

---

## Task 2: Availability Check API Route

**Files:**
- Create: `src/app/api/bookings/check-availability/route.ts`

- [ ] Create the route handler:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const room_id = searchParams.get('room_id')
  const check_in_date = searchParams.get('check_in_date')
  const check_out_date = searchParams.get('check_out_date')
  const exclude_booking_id = searchParams.get('exclude_booking_id')

  if (!room_id || !check_in_date || !check_out_date) {
    return NextResponse.json({ error: 'Missing required params' }, { status: 400 })
  }

  const supabase = await createClient()

  // Find conflicting bookings:
  // A conflict exists when existing booking's check_in < new check_out AND existing check_out > new check_in
  let query = supabase
    .from('bookings')
    .select('id, check_in_date, check_out_date, status')
    .eq('room_id', room_id)
    .is('deleted_at', null)
    .not('status', 'in', '("cancelled","no_show")')
    .lt('check_in_date', check_out_date)
    .gt('check_out_date', check_in_date)

  if (exclude_booking_id) {
    query = query.neq('id', exclude_booking_id)
  }

  const { data: conflicting, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    available: (conflicting ?? []).length === 0,
    conflicting_bookings: conflicting ?? [],
  })
}
```

---

## Task 3: Status Badge Shared Component

**Files:**
- Create: `src/app/(dashboard)/bookings/_components/status-badge.tsx`

- [ ] Create the component:

```typescript
import { Badge } from '@/components/ui/badge'
import type { BookingStatus } from '@/types'

const STATUS_CONFIG: Record<BookingStatus, { label: string; className: string }> = {
  pending:     { label: 'Pending',      className: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed:   { label: 'Confirmed',    className: 'bg-blue-50 text-blue-700 border-blue-200' },
  checked_in:  { label: 'Checked In',  className: 'bg-green-50 text-green-700 border-green-200' },
  checked_out: { label: 'Checked Out', className: 'bg-gray-50 text-gray-600 border-gray-200' },
  cancelled:   { label: 'Cancelled',   className: 'bg-red-50 text-red-600 border-red-200' },
  no_show:     { label: 'No Show',     className: 'bg-orange-50 text-orange-700 border-orange-200' },
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { label, className } = STATUS_CONFIG[status]
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  )
}

export { STATUS_CONFIG }
```

---

## Task 4: Booking Calendar Component

**Files:**
- Create: `src/app/(dashboard)/bookings/_components/booking-calendar.tsx`

This is the core component. Rooms are rows, dates are columns. Booking blocks are rendered as absolutely-positioned overlays spanning their date range.

- [ ] Create the calendar:

```typescript
'use client'

import { useMemo, useRef } from 'react'
import { format, addDays, differenceInDays, parseISO, startOfDay, isSameDay } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { STATUS_CONFIG } from './status-badge'
import type { Room, Booking, BookingStatus } from '@/types'

type BookingWithGuest = Booking & {
  guest_name?: string
}

interface BookingCalendarProps {
  rooms: Room[]
  bookings: BookingWithGuest[]
  startDate: Date
  numDays: number
  onNavigate: (direction: 'prev' | 'next' | 'today') => void
  onCellClick: (roomId: string, date: Date) => void
  onBookingClick: (booking: BookingWithGuest) => void
}

const DATE_COL_WIDTH = 52  // px per day column
const ROOM_COL_WIDTH = 140 // px for the room name column

export function BookingCalendar({
  rooms,
  bookings,
  startDate,
  numDays,
  onNavigate,
  onCellClick,
  onBookingClick,
}: BookingCalendarProps) {
  const dates = useMemo(
    () => Array.from({ length: numDays }, (_, i) => addDays(startDate, i)),
    [startDate, numDays]
  )
  const today = startOfDay(new Date())
  const scrollRef = useRef<HTMLDivElement>(null)
  const totalWidth = ROOM_COL_WIDTH + numDays * DATE_COL_WIDTH

  // For each room, find its bookings that overlap the visible range
  const endDate = addDays(startDate, numDays)

  function getBookingBlock(booking: BookingWithGuest, roomId: string) {
    if (booking.room_id !== roomId) return null
    const checkIn = parseISO(booking.check_in_date)
    const checkOut = parseISO(booking.check_out_date)

    // Clamp to visible range
    const visStart = checkIn < startDate ? startDate : checkIn
    const visEnd = checkOut > endDate ? endDate : checkOut
    if (visStart >= visEnd) return null

    const colStart = differenceInDays(visStart, startDate)
    const colSpan = differenceInDays(visEnd, visStart)
    if (colSpan <= 0) return null

    return { colStart, colSpan, checkIn, checkOut }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Navigation header */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <Button size="sm" variant="outline" onClick={() => onNavigate('prev')}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => onNavigate('today')}>
          Today
        </Button>
        <Button size="sm" variant="outline" onClick={() => onNavigate('next')}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <span className="text-sm text-gray-500 ml-2">
          {format(startDate, 'd MMM')} – {format(addDays(startDate, numDays - 1), 'd MMM yyyy')}
        </span>
      </div>

      {/* Scrollable calendar */}
      <div ref={scrollRef} className="overflow-x-auto flex-1 rounded-xl border border-gray-200 bg-white">
        <div style={{ minWidth: totalWidth }}>
          {/* Date header row */}
          <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10">
            {/* Room label header cell */}
            <div
              className="flex-shrink-0 border-r border-gray-200 bg-gray-50 px-3 py-2 flex items-center"
              style={{ width: ROOM_COL_WIDTH }}
            >
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Room</span>
            </div>
            {/* Date cells */}
            {dates.map((date) => {
              const isToday = isSameDay(date, today)
              return (
                <div
                  key={date.toISOString()}
                  className={`flex-shrink-0 border-r border-gray-100 px-1 py-2 text-center ${
                    isToday ? 'bg-blue-50' : ''
                  }`}
                  style={{ width: DATE_COL_WIDTH }}
                >
                  <p className={`text-xs font-medium ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>
                    {format(date, 'EEE')}
                  </p>
                  <p className={`text-sm font-semibold leading-tight ${isToday ? 'text-blue-700' : 'text-gray-700'}`}>
                    {format(date, 'd')}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Room rows */}
          {rooms.map((room) => {
            const roomBookings = bookings
              .map((b) => ({ booking: b, block: getBookingBlock(b, room.id) }))
              .filter((x) => x.block !== null) as { booking: BookingWithGuest; block: NonNullable<ReturnType<typeof getBookingBlock>> }[]

            return (
              <div key={room.id} className="flex border-b border-gray-100 last:border-b-0 relative" style={{ height: 56 }}>
                {/* Sticky room name */}
                <div
                  className="flex-shrink-0 border-r border-gray-200 bg-white sticky left-0 z-10 px-3 flex flex-col justify-center"
                  style={{ width: ROOM_COL_WIDTH }}
                >
                  <p className="text-sm font-medium text-gray-900 truncate">{room.name}</p>
                  <p className="text-xs text-gray-400 capitalize">{room.room_type}</p>
                </div>

                {/* Date cells (clickable) */}
                <div className="flex relative flex-1">
                  {dates.map((date) => {
                    const isToday = isSameDay(date, today)
                    return (
                      <div
                        key={date.toISOString()}
                        className={`flex-shrink-0 border-r border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors ${
                          isToday ? 'bg-blue-50/50' : ''
                        }`}
                        style={{ width: DATE_COL_WIDTH, height: 56 }}
                        onClick={() => onCellClick(room.id, date)}
                      />
                    )
                  })}

                  {/* Booking blocks (absolute positioned over the cells) */}
                  {roomBookings.map(({ booking, block }) => {
                    const { colStart, colSpan } = block
                    const cfg = STATUS_CONFIG[booking.status]
                    const isCancelled = booking.status === 'cancelled'
                    return (
                      <div
                        key={booking.id}
                        className={`absolute top-1.5 bottom-1.5 rounded-md flex items-center px-2 cursor-pointer select-none overflow-hidden z-20
                          ${isCancelled ? 'opacity-60' : ''}
                          ${cfg.className.replace('border-', 'border ').replace('bg-', 'bg-').replace('text-', 'text-')}
                          border shadow-sm hover:shadow-md transition-shadow`}
                        style={{
                          left: colStart * DATE_COL_WIDTH + 2,
                          width: colSpan * DATE_COL_WIDTH - 4,
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onBookingClick(booking)
                        }}
                      >
                        <span
                          className={`text-xs font-medium truncate ${isCancelled ? 'line-through' : ''}`}
                        >
                          {booking.guest_name ?? 'Guest'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {rooms.length === 0 && (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
              No rooms found for this property.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

---

## Task 5: New Booking Sheet

**Files:**
- Create: `src/app/(dashboard)/bookings/_components/new-booking-sheet.tsx`

This is a full booking creation form inside a slide-out Sheet.

- [ ] Create the sheet component (full implementation in execution step)

Key structure:
- Property selector (shows all user properties)
- Room selector (filters by property, shows availability)
- Date range pickers (check-in, check-out)
- Availability check (calls /api/bookings/check-availability)
- GuestSearch component
- Adults/children count
- Rate per night (pre-filled from room.base_rate_paise / 100)
- Auto-calculated total
- Source dropdown
- Payment method + amount paid
- OTA booking ID (optional)
- Special requests textarea
- Internal notes textarea
- Submit → POST to supabase.from('bookings').insert() + supabase.from('booking_guests').insert()

---

## Task 6: Booking Detail Sheet

**Files:**
- Create: `src/app/(dashboard)/bookings/_components/booking-detail-sheet.tsx`

- [ ] Create the detail sheet (full implementation in execution step)

Key sections:
- Header: guest name, room name, dates
- Status badge + transition buttons (Confirm / Check In / Check Out / Cancel)
- Booking info grid (source, payment, rate, total)
- Edit mode: toggle to edit form
- Payment update: record additional payment amount
- Guest link → /guests/:id
- Invoice link (if exists)

---

## Task 7: Quick Booking Modal

**Files:**
- Create: `src/app/(dashboard)/bookings/_components/quick-booking-modal.tsx`

- [ ] Create the minimal modal:

Minimal fields:
- Room dropdown (property-scoped)
- Check-in date, Check-out date
- Guest name (text), Guest phone
- Rate per night
- Source (default: direct)
- One "Book" button

On submit:
1. Find existing guest by phone (if provided)
2. If not found → create guest with name+phone
3. Create booking in 'confirmed' status
4. Create booking_guests record

---

## Task 8: Bookings Client (top-level coordinator)

**Files:**
- Create: `src/app/(dashboard)/bookings/_components/bookings-client.tsx`
- Modify: `src/app/(dashboard)/bookings/page.tsx`

- [ ] Create the client wrapper with all state:

```typescript
'use client'
// State:
// - startDate (Date, default = today)
// - numDays (14)
// - selectedBooking (BookingWithGuest | null)
// - newBookingPrefill ({ roomId, date } | null)
// - quickBookingOpen (boolean)
// - bookings + rooms (fetched from supabase)

// Renders:
// <BookingCalendar .../>
// <NewBookingSheet .../>
// <BookingDetailSheet .../>
// <QuickBookingModal .../>
// FAB button (bottom-right fixed, opens QuickBookingModal)
```

- [ ] Replace placeholder in `page.tsx`:

```typescript
import { BookingsClient } from './_components/bookings-client'
export default function BookingsPage() {
  return <BookingsClient />
}
```
