'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePropertyStore } from '@/stores/property-store'
import { format, parseISO } from 'date-fns'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import {
  CalendarCheck,
  CalendarX,
  Users,
  BedDouble,
  TrendingUp,
  IndianRupee,
  BarChart2,
  ArrowRight,
  Plus,
  Building2,
  Clock,
  TrendingDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils/currency'
import { BOOKING_SOURCE_LABELS } from '@/lib/constants'
import type { BookingStatus } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Today's date in IST as YYYY-MM-DD */
function getTodayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}

/** Current month start/end as YYYY-MM-DD */
function getMonthRange(): { start: string; end: string; label: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const lastDay = new Date(year, month, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay)}`,
    label: format(now, 'MMMM yyyy'),
  }
}

function formatDate(iso: string) {
  try { return format(parseISO(iso), 'd MMM') } catch { return iso }
}

// ── Status display ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  checked_out: 'Checked Out',
  cancelled: 'Cancelled',
  no_show: 'No Show',
}

const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  checked_in: 'bg-green-50 text-green-700 border-green-200',
  checked_out: 'bg-gray-50 text-gray-600 border-gray-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
  no_show: 'bg-orange-50 text-orange-700 border-orange-200',
}

// ── Types ──────────────────────────────────────────────────────────────────────

type TodayBooking = {
  id: string
  status: BookingStatus
  check_in_date: string
  check_out_date: string
  room_id: string
  guest_name: string
}

type MonthBooking = {
  id: string
  status: BookingStatus
  source: string
  total_amount_paise: number
  num_nights: number
  check_out_date: string
}

type RecentBooking = {
  id: string
  status: BookingStatus
  check_in_date: string
  check_out_date: string
  updated_at: string
  guest_name: string
}

type RoomSummary = {
  id: string
  status: string
}

type DashData = {
  today: TodayBooking[]
  monthBookings: MonthBooking[]
  recent: RecentBooking[]
  rooms: RoomSummary[]
  monthExpensesPaise: number
}

// ── Source chart colours ───────────────────────────────────────────────────────

const SOURCE_CHART_COLORS: Record<string, string> = {
  airbnb:      '#FF5A5F',
  makemytrip:  '#E84393',
  booking_com: '#003580',
  goibibo:     '#EB2026',
  direct:      '#2563EB',
  walk_in:     '#16A34A',
  phone:       '#7C3AED',
  referral:    '#D97706',
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  loading,
  accent,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  loading?: boolean
  accent?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent ?? 'bg-gray-100'}`}>
        <Icon className="w-5 h-5 text-gray-600" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
        {loading ? (
          <Skeleton className="h-7 w-16 mt-1" />
        ) : (
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        )}
        {sub && !loading && (
          <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
        )}
      </div>
    </div>
  )
}

// ── Custom recharts tooltip ────────────────────────────────────────────────────

function SourceTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-sm">
      <p className="font-medium text-gray-900">{label}</p>
      <p className="text-gray-600">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DashboardClient() {
  const router = useRouter()
  const supabase = createClient()
  const { activePropertyId, properties } = usePropertyStore()

  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async (propertyId: string) => {
    setLoading(true)

    const today = getTodayIST()
    const { start: monthStart, end: monthEnd } = getMonthRange()

    // All queries in parallel
    const [roomsRes, todayRes, monthRes, expensesRes, recentRes] = await Promise.all([
      // Rooms for the active property
      supabase
        .from('rooms')
        .select('id, status')
        .eq('property_id', propertyId)
        .is('deleted_at', null),

      // Today's relevant bookings: check_in = today OR check_out = today OR currently checked_in
      supabase
        .from('bookings')
        .select(`
          id, status, check_in_date, check_out_date, room_id,
          booking_guests ( is_primary, guests ( full_name ) )
        `)
        .eq('property_id', propertyId)
        .is('deleted_at', null)
        .not('status', 'in', '(cancelled,no_show)')
        .or(`check_in_date.eq.${today},check_out_date.eq.${today},status.eq.checked_in`),

      // This month's checked-out bookings (revenue + metrics)
      supabase
        .from('bookings')
        .select('id, status, source, total_amount_paise, num_nights, check_out_date')
        .eq('property_id', propertyId)
        .is('deleted_at', null)
        .eq('status', 'checked_out')
        .gte('check_out_date', monthStart)
        .lte('check_out_date', monthEnd),

      // This month's expenses total
      supabase
        .from('expenses')
        .select('amount_paise')
        .eq('property_id', propertyId)
        .gte('expense_date', monthStart)
        .lte('expense_date', monthEnd),

      // Recent activity: last 10 bookings by updated_at
      supabase
        .from('bookings')
        .select(`
          id, status, check_in_date, check_out_date, updated_at,
          booking_guests ( is_primary, guests ( full_name ) )
        `)
        .eq('property_id', propertyId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(10),
    ])

    // ── Parse today bookings ──────────────────────────────────────────────────
    const todayBookings: TodayBooking[] = (todayRes.data ?? []).map((b) => {
      const guests = (b.booking_guests ?? []) as unknown as {
        is_primary: boolean
        guests: { full_name: string } | null
      }[]
      const primary = guests.find((g) => g.is_primary) ?? guests[0]
      return {
        id: b.id,
        status: b.status as BookingStatus,
        check_in_date: b.check_in_date,
        check_out_date: b.check_out_date,
        room_id: b.room_id,
        guest_name: primary?.guests?.full_name ?? 'Guest',
      }
    })

    // ── Parse month bookings ──────────────────────────────────────────────────
    const monthBookings: MonthBooking[] = (monthRes.data ?? []).map((b) => ({
      id: b.id,
      status: b.status as BookingStatus,
      source: b.source ?? 'direct',
      total_amount_paise: b.total_amount_paise ?? 0,
      num_nights: b.num_nights ?? 0,
      check_out_date: b.check_out_date,
    }))

    // ── Parse recent bookings ─────────────────────────────────────────────────
    const recentBookings: RecentBooking[] = (recentRes.data ?? []).map((b) => {
      const guests = (b.booking_guests ?? []) as unknown as {
        is_primary: boolean
        guests: { full_name: string } | null
      }[]
      const primary = guests.find((g) => g.is_primary) ?? guests[0]
      return {
        id: b.id,
        status: b.status as BookingStatus,
        check_in_date: b.check_in_date,
        check_out_date: b.check_out_date,
        updated_at: b.updated_at,
        guest_name: primary?.guests?.full_name ?? 'Guest',
      }
    })

    const monthExpensesPaise = (expensesRes.data ?? []).reduce(
      (s: number, e: { amount_paise: number }) => s + (e.amount_paise ?? 0), 0
    )

    setData({
      today: todayBookings,
      monthBookings,
      recent: recentBookings,
      rooms: (roomsRes.data ?? []) as RoomSummary[],
      monthExpensesPaise,
    })
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activePropertyId) {
      fetchData(activePropertyId)
    } else {
      setData(null)
      setLoading(false)
    }
  }, [activePropertyId, fetchData])

  // ── Derived values ──────────────────────────────────────────────────────────

  const today = getTodayIST()
  const { label: monthLabel } = getMonthRange()

  const arrivals = data?.today.filter(
    (b) => b.check_in_date === today && (b.status === 'pending' || b.status === 'confirmed')
  ) ?? []

  const departures = data?.today.filter(
    (b) => b.check_out_date === today && b.status === 'checked_in'
  ) ?? []

  const inHouse = data?.today.filter(
    (b) => b.status === 'checked_in' && b.check_in_date < today && b.check_out_date > today
  ) ?? []

  const totalRooms = data?.rooms.length ?? 0
  const availableRooms = data?.rooms.filter((r) => r.status === 'available').length ?? 0

  const revenue = data?.monthBookings.reduce((s, b) => s + b.total_amount_paise, 0) ?? 0
  const expenses = data?.monthExpensesPaise ?? 0
  const netPaise = revenue - expenses
  const occupiedNights = data?.monthBookings.reduce((s, b) => s + b.num_nights, 0) ?? 0
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const totalNights = totalRooms * daysInMonth
  const occupancyPct = totalNights > 0 ? Math.round((occupiedNights / totalNights) * 100) : 0
  const adr = occupiedNights > 0 ? Math.round(revenue / occupiedNights) : 0
  const revpar = totalNights > 0 ? Math.round(revenue / totalNights) : 0

  // Revenue by source
  const revenueBySource = Object.entries(
    (data?.monthBookings ?? []).reduce<Record<string, number>>((acc, b) => {
      acc[b.source] = (acc[b.source] ?? 0) + b.total_amount_paise
      return acc
    }, {})
  )
    .map(([source, amount]) => ({
      source: BOOKING_SOURCE_LABELS[source] ?? source,
      sourceKey: source,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount)

  // ── No property selected ────────────────────────────────────────────────────

  if (!activePropertyId && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Building2 className="w-7 h-7 text-gray-400" />
        </div>
        <p className="text-gray-900 font-medium mb-1">No property selected</p>
        <p className="text-sm text-gray-500 mb-6 max-w-xs">
          Add a property to start tracking your homestay operations.
        </p>
        <Link href="/properties/new">
          <Button>
            <Plus className="w-4 h-4" />
            Add property
          </Button>
        </Link>
      </div>
    )
  }

  const activeProperty = properties.find((p) => p.id === activePropertyId)

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeProperty ? activeProperty.name : 'All properties'} · {format(new Date(), 'EEEE, d MMMM yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/bookings">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              New Booking
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Today's Operations ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Today's Operations
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={CalendarCheck}
            label="Arrivals"
            value={loading ? '' : arrivals.length}
            sub={arrivals.length > 0 ? `${arrivals.map((b) => b.guest_name).slice(0, 2).join(', ')}${arrivals.length > 2 ? ` +${arrivals.length - 2}` : ''}` : 'No arrivals today'}
            loading={loading}
            accent="bg-blue-50"
          />
          <StatCard
            icon={CalendarX}
            label="Departures"
            value={loading ? '' : departures.length}
            sub={departures.length > 0 ? `${departures.map((b) => b.guest_name).slice(0, 2).join(', ')}${departures.length > 2 ? ` +${departures.length - 2}` : ''}` : 'No departures today'}
            loading={loading}
            accent="bg-orange-50"
          />
          <StatCard
            icon={Users}
            label="In-House"
            value={loading ? '' : inHouse.length}
            sub={inHouse.length > 0 ? `${inHouse.length} guest${inHouse.length !== 1 ? 's' : ''} staying` : 'No guests in-house'}
            loading={loading}
            accent="bg-green-50"
          />
          <StatCard
            icon={BedDouble}
            label="Available"
            value={loading ? '' : `${availableRooms}/${totalRooms}`}
            sub={loading ? '' : `${totalRooms - availableRooms} occupied`}
            loading={loading}
            accent="bg-purple-50"
          />
        </div>
      </section>

      {/* ── Arrivals quick-list ──────────────────────────────────────────────── */}
      {!loading && arrivals.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Today's Arrivals
            </h2>
            <Link href="/bookings" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              View calendar <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {arrivals.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => router.push('/bookings')}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 shrink-0">
                    {b.guest_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{b.guest_name}</p>
                    <p className="text-xs text-gray-400">
                      Checking in · until {formatDate(b.check_out_date)}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={STATUS_COLORS[b.status]}>
                  {STATUS_LABELS[b.status]}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Monthly Metrics ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {monthLabel} Metrics
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            icon={TrendingUp}
            label="Occupancy"
            value={loading ? '' : `${occupancyPct}%`}
            sub={`${occupiedNights} room-nights`}
            loading={loading}
            accent="bg-blue-50"
          />
          <StatCard
            icon={IndianRupee}
            label="Revenue"
            value={loading ? '' : formatCurrency(revenue)}
            sub={`${data?.monthBookings.length ?? 0} check-outs`}
            loading={loading}
            accent="bg-green-50"
          />
          <StatCard
            icon={TrendingDown}
            label="Expenses"
            value={loading ? '' : formatCurrency(expenses)}
            sub={expenses > 0 ? 'This month' : 'None logged'}
            loading={loading}
            accent="bg-red-50"
          />
          <StatCard
            icon={IndianRupee}
            label="Net Profit"
            value={loading ? '' : formatCurrency(Math.abs(netPaise))}
            sub={loading ? '' : netPaise >= 0 ? '✅ Profit' : '⚠️ Loss'}
            loading={loading}
            accent={netPaise >= 0 ? 'bg-emerald-50' : 'bg-orange-50'}
          />
          <StatCard
            icon={BarChart2}
            label="ADR"
            value={loading ? '' : formatCurrency(adr)}
            sub="Avg daily rate"
            loading={loading}
            accent="bg-purple-50"
          />
          <StatCard
            icon={IndianRupee}
            label="RevPAR"
            value={loading ? '' : formatCurrency(revpar)}
            sub="Per available room"
            loading={loading}
            accent="bg-amber-50"
          />
        </div>
      </section>

      {/* ── Revenue by Source + Recent Activity ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Revenue by Source chart */}
        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Revenue by Source · {monthLabel}
          </h2>
          {loading ? (
            <div className="space-y-2 mt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 rounded" style={{ width: `${70 - i * 12}%` }} />
              ))}
            </div>
          ) : revenueBySource.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <BarChart2 className="w-8 h-8 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">No revenue data this month</p>
              <p className="text-xs text-gray-300 mt-1">Check-out bookings will appear here</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, revenueBySource.length * 52)}>
              <BarChart
                data={revenueBySource}
                layout="vertical"
                margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => `₹${Math.round(v / 100).toLocaleString('en-IN')}`}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="source"
                  tick={{ fontSize: 12, fill: '#374151' }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <Tooltip content={<SourceTooltip />} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={32}>
                  {revenueBySource.map((entry) => (
                    <Cell
                      key={entry.sourceKey}
                      fill={SOURCE_CHART_COLORS[entry.sourceKey] ?? '#6366f1'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>

        {/* Recent Activity */}
        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Recent Activity
            </h2>
            <Link href="/bookings" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              All bookings <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : (data?.recent ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Clock className="w-8 h-8 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">No recent activity</p>
              <p className="text-xs text-gray-300 mt-1">Booking changes will appear here</p>
            </div>
          ) : (
            <div className="space-y-0 divide-y divide-gray-50">
              {(data?.recent ?? []).map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-3 py-2.5 cursor-pointer hover:bg-gray-50 -mx-4 px-4 transition-colors"
                  onClick={() => router.push('/bookings')}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0">
                      {b.guest_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{b.guest_name}</p>
                      <p className="text-xs text-gray-400">
                        {formatDate(b.check_in_date)} → {formatDate(b.check_out_date)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`${STATUS_COLORS[b.status]} shrink-0 text-xs`}>
                    {STATUS_LABELS[b.status]}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
