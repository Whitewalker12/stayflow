'use client'

import { useMemo, useRef } from 'react'
import {
  format,
  addDays,
  differenceInDays,
  parseISO,
  startOfDay,
  isSameDay,
  isWeekend,
} from 'date-fns'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { STATUS_CONFIG } from './status-badge'
import type { Room, Booking, BookingStatus, ExternalBlock } from '@/types'

export type BookingWithGuest = Booking & {
  guest_name: string
}

interface BookingCalendarProps {
  rooms: Room[]
  bookings: BookingWithGuest[]
  externalBlocks?: ExternalBlock[]
  startDate: Date
  numDays: number
  onNavigate: (direction: 'prev' | 'next' | 'today') => void
  onCellClick: (roomId: string, date: Date) => void
  onBookingClick: (booking: BookingWithGuest) => void
}

// Column widths in px
const DATE_COL_WIDTH = 56
const ROOM_COL_WIDTH = 148

// Calendar row height
const ROW_HEIGHT = 60

export function BookingCalendar({
  rooms,
  bookings,
  externalBlocks = [],
  startDate,
  numDays,
  onNavigate,
  onCellClick,
  onBookingClick,
}: BookingCalendarProps) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const scrollRef = useRef<HTMLDivElement>(null)

  const dates = useMemo(
    () => Array.from({ length: numDays }, (_, i) => addDays(startDate, i)),
    [startDate, numDays]
  )

  const rangeEnd = addDays(startDate, numDays)
  const totalGridWidth = ROOM_COL_WIDTH + numDays * DATE_COL_WIDTH

  /**
   * Compute the visible grid position for a date-range block (booking or external).
   * Returns null if the block doesn't overlap the visible range.
   */
  function computeBlock(
    startDateStr: string,
    endDateStr: string,
    roomId: string,
    blockRoomId: string
  ) {
    if (blockRoomId !== roomId) return null

    const blockStart = parseISO(startDateStr)
    const blockEnd = parseISO(endDateStr)

    if (blockEnd <= startDate || blockStart >= rangeEnd) return null

    const visStart = blockStart < startDate ? startDate : blockStart
    const visEnd = blockEnd > rangeEnd ? rangeEnd : blockEnd

    const colStart = differenceInDays(visStart, startDate)
    const colSpan = differenceInDays(visEnd, visStart)

    if (colSpan <= 0) return null

    return {
      colStart,
      colSpan,
      clippedLeft: blockStart < startDate,
      clippedRight: blockEnd > rangeEnd,
    }
  }

  /**
   * For a given booking and room, compute the visible grid position.
   * Returns null if the booking doesn't overlap the visible range.
   */
  function getBlock(booking: BookingWithGuest, roomId: string) {
    return computeBlock(booking.check_in_date, booking.check_out_date, roomId, booking.room_id)
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Navigation bar */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button size="sm" variant="outline" onClick={() => onNavigate('prev')}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => onNavigate('today')}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          Today
        </Button>
        <Button size="sm" variant="outline" onClick={() => onNavigate('next')}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <span className="text-sm text-gray-500 ml-1 hidden sm:inline">
          {format(startDate, 'd MMM')} –{' '}
          {format(addDays(startDate, numDays - 1), 'd MMM yyyy')}
        </span>
        <span className="text-sm font-medium text-gray-600 ml-1 sm:hidden">
          {format(startDate, 'MMM d')}
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap flex-shrink-0">
        {(
          ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'] as BookingStatus[]
        ).map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span
              className={`w-3 h-3 rounded-sm border ${STATUS_CONFIG[s].calendarClass}`}
            />
            {STATUS_CONFIG[s].label}
          </span>
        ))}
        {externalBlocks.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-3 h-3 rounded-sm border border-gray-400 bg-gray-200" />
            External (OTA)
          </span>
        )}
      </div>

      {/* Scrollable calendar grid */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm"
      >
        <div style={{ minWidth: totalGridWidth }}>
          {/* ─── Date header ─── */}
          <div
            className="flex sticky top-0 z-20 bg-white border-b border-gray-200"
            style={{ minWidth: totalGridWidth }}
          >
            {/* Room label */}
            <div
              className="flex-shrink-0 sticky left-0 z-30 bg-gray-50 border-r border-gray-200 px-3 flex items-center"
              style={{ width: ROOM_COL_WIDTH, minHeight: 48 }}
            >
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Room
              </span>
            </div>

            {/* Date columns */}
            {dates.map((date) => {
              const isToday = isSameDay(date, today)
              const weekend = isWeekend(date)
              return (
                <div
                  key={date.toISOString()}
                  className={`flex-shrink-0 flex flex-col items-center justify-center border-r border-gray-100 py-1.5 ${
                    isToday
                      ? 'bg-blue-50'
                      : weekend
                      ? 'bg-gray-50/60'
                      : ''
                  }`}
                  style={{ width: DATE_COL_WIDTH }}
                >
                  <span
                    className={`text-[10px] font-medium uppercase ${
                      isToday ? 'text-blue-500' : 'text-gray-400'
                    }`}
                  >
                    {format(date, 'EEE')}
                  </span>
                  <span
                    className={`text-sm font-bold leading-tight ${
                      isToday
                        ? 'text-white bg-blue-500 rounded-full w-6 h-6 flex items-center justify-center'
                        : 'text-gray-700'
                    }`}
                  >
                    {format(date, 'd')}
                  </span>
                  <span className={`text-[9px] ${isToday ? 'text-blue-400' : 'text-gray-300'}`}>
                    {format(date, 'MMM')}
                  </span>
                </div>
              )
            })}
          </div>

          {/* ─── Room rows ─── */}
          {rooms.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
              No rooms found for this property
            </div>
          ) : (
            rooms.map((room, roomIdx) => {
              const roomBookings = bookings
                .map((b) => {
                  const block = getBlock(b, room.id)
                  return block ? { booking: b, block } : null
                })
                .filter(Boolean) as {
                booking: BookingWithGuest
                block: NonNullable<ReturnType<typeof getBlock>>
              }[]

              return (
                <div
                  key={room.id}
                  className={`flex border-b border-gray-100 last:border-b-0 relative ${
                    roomIdx % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'
                  }`}
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Sticky room name */}
                  <div
                    className={`flex-shrink-0 sticky left-0 z-10 border-r border-gray-200 px-3 flex flex-col justify-center ${
                      roomIdx % 2 === 1 ? 'bg-gray-50' : 'bg-white'
                    }`}
                    style={{ width: ROOM_COL_WIDTH }}
                  >
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {room.name}
                    </p>
                    <p className="text-xs text-gray-400 capitalize">{room.room_type}</p>
                  </div>

                  {/* Date cells + booking blocks */}
                  <div className="relative flex flex-1">
                    {/* Background cells (clickable) */}
                    {dates.map((date) => {
                      const isToday = isSameDay(date, today)
                      const weekend = isWeekend(date)
                      return (
                        <div
                          key={date.toISOString()}
                          title={`${room.name} · ${format(date, 'd MMM yyyy')}`}
                          className={`flex-shrink-0 border-r border-gray-100 cursor-pointer transition-colors hover:bg-blue-50/60 ${
                            isToday
                              ? 'bg-blue-50/30'
                              : weekend
                              ? 'bg-gray-50/40'
                              : ''
                          }`}
                          style={{ width: DATE_COL_WIDTH, height: ROW_HEIGHT }}
                          onClick={() => onCellClick(room.id, date)}
                        />
                      )
                    })}

                    {/* External blocks (iCal imports — gray, non-clickable) */}
                    {externalBlocks
                      .map((eb) => {
                        const block = computeBlock(eb.start_date, eb.end_date, room.id, eb.room_id)
                        return block ? { eb, block } : null
                      })
                      .filter((x): x is { eb: typeof externalBlocks[0]; block: NonNullable<ReturnType<typeof computeBlock>> } => x !== null)
                      .map(({ eb, block }) => {
                        const { colStart, colSpan, clippedLeft, clippedRight } = block
                        return (
                          <div
                            key={eb.id}
                            title={`${eb.summary} · ${eb.start_date} → ${eb.end_date} (via OTA)`}
                            className={`
                              absolute top-2 bottom-2 z-10
                              flex items-center px-2 select-none overflow-hidden cursor-not-allowed
                              bg-gray-200 border border-gray-400 opacity-80
                              ${clippedLeft ? 'rounded-r-md rounded-l-none' : ''}
                              ${clippedRight ? 'rounded-l-md rounded-r-none' : ''}
                              ${!clippedLeft && !clippedRight ? 'rounded-md' : ''}
                            `}
                            style={{
                              left: colStart * DATE_COL_WIDTH + 2,
                              width: colSpan * DATE_COL_WIDTH - 4,
                            }}
                          >
                            <span className="text-xs font-medium text-gray-600 truncate leading-tight">
                              {eb.summary}
                            </span>
                          </div>
                        )
                      })}

                    {/* Booking blocks (absolute overlay) */}
                    {roomBookings.map(({ booking, block }) => {
                      const { colStart, colSpan, clippedLeft, clippedRight } = block
                      const cfg = STATUS_CONFIG[booking.status]
                      const isCancelled =
                        booking.status === 'cancelled' || booking.status === 'no_show'

                      return (
                        <div
                          key={booking.id}
                          title={`${booking.guest_name} · ${booking.check_in_date} → ${booking.check_out_date}`}
                          className={`
                            absolute top-2 bottom-2 z-10
                            flex items-center px-2 cursor-pointer select-none overflow-hidden
                            border shadow-sm hover:shadow-md transition-all hover:scale-[1.01]
                            ${cfg.calendarClass}
                            ${isCancelled ? 'opacity-60' : ''}
                            ${clippedLeft ? 'rounded-r-md rounded-l-none' : ''}
                            ${clippedRight ? 'rounded-l-md rounded-r-none' : ''}
                            ${!clippedLeft && !clippedRight ? 'rounded-md' : ''}
                          `}
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
                            className={`text-xs font-semibold truncate leading-tight ${
                              isCancelled ? 'line-through opacity-70' : ''
                            }`}
                          >
                            {booking.guest_name}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
