'use client'

/**
 * Reports page — 4 tabular exports: Revenue, GST, Occupancy, P&L.
 * Each card shows a summary metric + CSV / PDF download buttons.
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePropertyStore } from '@/stores/property-store'
import { format } from 'date-fns'
import { Building2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils/currency'
import { BOOKING_SOURCE_LABELS } from '@/lib/constants'
import { EXPENSE_CATEGORY_LABELS } from '@/types'
import type { Booking, Invoice, Expense } from '@/types'
import { ReportDownloadButtons } from '@/components/reports/report-download-button'
import type { ReportPDFProps } from '@/components/reports/report-pdf'
import Link from 'next/link'

// ── Month helpers ─────────────────────────────────────────────────────────────

function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthOptions() {
  const opts: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = format(d, 'MMMM yyyy')
    opts.push({ value, label })
  }
  return opts
}

// ── Formatters ────────────────────────────────────────────────────────────────

/** Paise → plain rupee string (no symbol) — for CSV cells */
function rp(paise: number): string {
  return Math.round(paise / 100).toLocaleString('en-IN')
}

/** Paise → rupee string with symbol — for PDF cells */
function rs(paise: number): string {
  return `\u20B9${Math.round(paise / 100).toLocaleString('en-IN')}`
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  partial: 'Partial',
  paid: 'Paid',
  refunded: 'Refunded',
}

const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  checked_out: 'Checked Out',
  cancelled: 'Cancelled',
  no_show: 'No Show',
}

// ── Types ─────────────────────────────────────────────────────────────────────

type BookingWithRoom = Booking & { room_name: string }

interface ReportState {
  bookings: BookingWithRoom[]
  invoices: Invoice[]
  expenses: Expense[]
  loading: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReportsClient() {
  const supabase = createClient()
  const { properties, activePropertyId, setActiveProperty, fetchProperties } =
    usePropertyStore()

  useEffect(() => { fetchProperties(supabase) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [month, setMonth] = useState(currentYearMonth())
  const [state, setState] = useState<ReportState>({
    bookings: [],
    invoices: [],
    expenses: [],
    loading: false,
  })

  const months = monthOptions()
  const activeProperty = properties.find((p) => p.id === activePropertyId)

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!activePropertyId) {
      setState({ bookings: [], invoices: [], expenses: [], loading: false })
      return
    }
    setState((s) => ({ ...s, loading: true }))

    const [year, mon] = month.split('-').map(Number)
    const lastDay = new Date(year, mon, 0).getDate()
    const start = `${month}-01`
    const end = `${month}-${String(lastDay).padStart(2, '0')}`

    const [roomsRes, bookingsRes, invoicesRes, expensesRes] = await Promise.all([
      supabase
        .from('rooms')
        .select('id, name')
        .eq('property_id', activePropertyId)
        .is('deleted_at', null),
      supabase
        .from('bookings')
        .select('*')
        .eq('property_id', activePropertyId)
        .gte('check_in_date', start)
        .lte('check_in_date', end)
        .order('check_in_date', { ascending: true }),
      supabase
        .from('invoices')
        .select('*')
        .eq('property_id', activePropertyId)
        .gte('invoice_date', start)
        .lte('invoice_date', end)
        .neq('status', 'cancelled')
        .order('invoice_date', { ascending: true }),
      supabase
        .from('expenses')
        .select('*')
        .eq('property_id', activePropertyId)
        .gte('expense_date', start)
        .lte('expense_date', end)
        .order('expense_date', { ascending: true }),
    ])

    const roomMap = new Map<string, string>(
      (roomsRes.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name])
    )

    const bookings: BookingWithRoom[] = ((bookingsRes.data ?? []) as Booking[]).map((b) => ({
      ...b,
      room_name: roomMap.get(b.room_id) ?? '—',
    }))

    setState({
      bookings,
      invoices: (invoicesRes.data ?? []) as Invoice[],
      expenses: (expensesRes.data ?? []) as Expense[],
      loading: false,
    })
  }, [activePropertyId, month]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData]) // eslint-disable-line react-hooks/set-state-in-effect

  const { bookings, invoices, expenses, loading } = state
  const monthLabel = months.find((m) => m.value === month)?.label ?? month
  const propertyName = activeProperty?.name ?? ''

  // ── Revenue report data ─────────────────────────────────────────────────────

  const revBookings = bookings.filter(
    (b) => b.status !== 'cancelled' && b.status !== 'no_show'
  )
  const totalRevenuePaise = revBookings.reduce((s, b) => s + b.total_amount_paise, 0)
  const totalRevNights = revBookings.reduce((s, b) => s + b.num_nights, 0)
  const adrPaise = totalRevNights > 0 ? Math.round(totalRevenuePaise / totalRevNights) : 0

  const revCSVHeaders = [
    'Date', 'Room', 'Source', 'Nights', 'Rate/Night (Rs.)', 'Total (Rs.)', 'Payment',
  ]
  const revCSVRows: string[][] = revBookings.map((b) => [
    b.check_in_date,
    b.room_name,
    BOOKING_SOURCE_LABELS[b.source] ?? b.source,
    String(b.num_nights),
    rp(b.rate_per_night_paise),
    rp(b.total_amount_paise),
    PAYMENT_STATUS_LABELS[b.payment_status] ?? b.payment_status,
  ])
  const revPDF: ReportPDFProps = {
    title: 'Revenue Report',
    propertyName,
    dateRange: monthLabel,
    columns: [
      { header: 'Date',       width: 70 },
      { header: 'Room',       width: 90 },
      { header: 'Source',     width: 80 },
      { header: 'Nights',     width: 42, align: 'right' },
      { header: 'Rate/Night', width: 78, align: 'right' },
      { header: 'Total',      width: 78, align: 'right' },
      { header: 'Payment',    width: 72 },
    ],
    rows: revCSVRows,
    totalRow: ['TOTAL', '', '', String(totalRevNights), '', rs(totalRevenuePaise), ''],
    summaries: [
      { label: 'Total Revenue', value: rs(totalRevenuePaise) },
      { label: 'Bookings',      value: String(revBookings.length) },
      { label: 'Total Nights',  value: String(totalRevNights) },
      { label: 'ADR',           value: rs(adrPaise) },
    ],
  }

  // ── GST report data ─────────────────────────────────────────────────────────

  const totalSubtotal      = invoices.reduce((s, i) => s + i.subtotal_paise,      0)
  const totalCGST          = invoices.reduce((s, i) => s + i.cgst_amount_paise,   0)
  const totalSGST          = invoices.reduce((s, i) => s + i.sgst_amount_paise,   0)
  const totalIGST          = invoices.reduce((s, i) => s + i.igst_amount_paise,   0)
  const totalInvoiceValue  = invoices.reduce((s, i) => s + i.total_paise,         0)
  const totalGST           = totalCGST + totalSGST + totalIGST

  const gstCSVHeaders = [
    'Invoice #', 'Date', 'Guest',
    'Taxable (Rs.)', 'CGST (Rs.)', 'SGST (Rs.)', 'IGST (Rs.)', 'Total (Rs.)',
  ]
  const gstCSVRows: string[][] = invoices.map((inv) => [
    inv.invoice_number,
    inv.invoice_date,
    inv.guest_name,
    rp(inv.subtotal_paise),
    rp(inv.cgst_amount_paise),
    rp(inv.sgst_amount_paise),
    rp(inv.igst_amount_paise),
    rp(inv.total_paise),
  ])
  const gstPDF: ReportPDFProps = {
    title: 'GST Report',
    propertyName,
    dateRange: monthLabel,
    columns: [
      { header: 'Invoice #', width: 75 },
      { header: 'Date',      width: 65 },
      { header: 'Guest',     width: 120 },
      { header: 'Taxable',   width: 72, align: 'right' },
      { header: 'CGST',      width: 62, align: 'right' },
      { header: 'SGST',      width: 62, align: 'right' },
      { header: 'IGST',      width: 62, align: 'right' },
      { header: 'Total',     width: 72, align: 'right' },
    ],
    rows: gstCSVRows,
    totalRow: [
      'TOTAL', '', '',
      rs(totalSubtotal), rs(totalCGST), rs(totalSGST), rs(totalIGST), rs(totalInvoiceValue),
    ],
    summaries: [
      { label: 'Taxable Value', value: rs(totalSubtotal) },
      { label: 'Total GST',     value: rs(totalGST) },
      { label: 'Invoice Total', value: rs(totalInvoiceValue) },
      { label: 'Invoices',      value: String(invoices.length) },
    ],
  }

  // ── Occupancy report data ───────────────────────────────────────────────────

  const activeBookings = bookings.filter(
    (b) => b.status !== 'cancelled' && b.status !== 'no_show'
  )
  const totalOccNights = activeBookings.reduce((s, b) => s + b.num_nights, 0)

  const occCSVHeaders = [
    'Room', 'Check-In', 'Check-Out', 'Nights', 'Adults', 'Children', 'Source', 'Status',
  ]
  const occCSVRows: string[][] = bookings.map((b) => [
    b.room_name,
    b.check_in_date,
    b.check_out_date,
    String(b.num_nights),
    String(b.num_adults),
    String(b.num_children),
    BOOKING_SOURCE_LABELS[b.source] ?? b.source,
    BOOKING_STATUS_LABELS[b.status] ?? b.status,
  ])
  const occPDF: ReportPDFProps = {
    title: 'Occupancy Report',
    propertyName,
    dateRange: monthLabel,
    columns: [
      { header: 'Room',      width: 105 },
      { header: 'Check-In',  width: 72 },
      { header: 'Check-Out', width: 72 },
      { header: 'Nights',    width: 45, align: 'right' },
      { header: 'Adults',    width: 45, align: 'right' },
      { header: 'Children',  width: 50, align: 'right' },
      { header: 'Source',    width: 88 },
      { header: 'Status',    width: 80 },
    ],
    rows: occCSVRows,
    summaries: [
      { label: 'Total Bookings',  value: String(bookings.length) },
      { label: 'Active Bookings', value: String(activeBookings.length) },
      { label: 'Total Nights',    value: String(totalOccNights) },
    ],
  }

  // ── P&L report data ─────────────────────────────────────────────────────────

  const totalExpensesPaise = expenses.reduce((s, e) => s + e.amount_paise, 0)
  const netPLPaise = totalRevenuePaise - totalExpensesPaise

  const expByCategory = Object.entries(
    expenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amount_paise
      return acc
    }, {})
  )

  const plCSVHeaders = ['Category', 'Amount (Rs.)']
  const plCSVRows: string[][] = [
    ['Revenue (Bookings)', rp(totalRevenuePaise)],
    ...expByCategory.map(([cat, amt]) => [
      `Expense: ${EXPENSE_CATEGORY_LABELS[cat as keyof typeof EXPENSE_CATEGORY_LABELS] ?? cat}`,
      rp(amt),
    ]),
    ['NET P&L', rp(netPLPaise)],
  ]
  const plPDF: ReportPDFProps = {
    title: 'P&L Summary',
    propertyName,
    dateRange: monthLabel,
    columns: [
      { header: 'Category',     width: 360 },
      { header: 'Amount (Rs.)', width: 150, align: 'right' },
    ],
    rows: [
      ['Revenue (Bookings)', rs(totalRevenuePaise)],
      ...expByCategory.map(([cat, amt]) => [
        `Expense: ${EXPENSE_CATEGORY_LABELS[cat as keyof typeof EXPENSE_CATEGORY_LABELS] ?? cat}`,
        `(${rs(amt)})`,
      ]),
    ],
    totalRow: [
      'Net Profit / Loss',
      netPLPaise >= 0 ? rs(netPLPaise) : `(${rs(Math.abs(netPLPaise))})`,
    ],
    summaries: [
      { label: 'Revenue',        value: rs(totalRevenuePaise) },
      { label: 'Total Expenses', value: rs(totalExpensesPaise) },
      {
        label: 'Net P&L',
        value: `${netPLPaise >= 0 ? '+' : '-'}${rs(Math.abs(netPLPaise))}`,
      },
    ],
  }

  // ── No property state ───────────────────────────────────────────────────────

  if (!activePropertyId && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Building2 className="w-7 h-7 text-gray-400" />
        </div>
        <p className="text-gray-900 font-medium mb-1">No property selected</p>
        <p className="text-sm text-gray-500 mb-6 max-w-xs">
          Add a property to start generating reports.
        </p>
        <Link href="/properties/new">
          <Button>
            <Plus className="w-4 h-4 mr-1" /> Add property
          </Button>
        </Link>
      </div>
    )
  }

  // ── Report cards config ─────────────────────────────────────────────────────

  const cards = [
    {
      title:        'Revenue',
      description:  'Booking revenue by room and source',
      metric:       formatCurrency(totalRevenuePaise),
      metricLabel:  'Total Revenue',
      count:        revBookings.length,
      csvFilename:  `revenue-${month}.csv`,
      pdfFilename:  `revenue-${month}.pdf`,
      csvHeaders:   revCSVHeaders,
      csvRows:      revCSVRows,
      pdf:          revPDF,
    },
    {
      title:        'GST',
      description:  'Tax breakdown for issued invoices',
      metric:       formatCurrency(totalGST),
      metricLabel:  'Total GST',
      count:        invoices.length,
      csvFilename:  `gst-${month}.csv`,
      pdfFilename:  `gst-${month}.pdf`,
      csvHeaders:   gstCSVHeaders,
      csvRows:      gstCSVRows,
      pdf:          gstPDF,
    },
    {
      title:        'Occupancy',
      description:  'Room utilisation and booking mix',
      metric:       String(totalOccNights),
      metricLabel:  'Booked Nights',
      count:        bookings.length,
      csvFilename:  `occupancy-${month}.csv`,
      pdfFilename:  `occupancy-${month}.pdf`,
      csvHeaders:   occCSVHeaders,
      csvRows:      occCSVRows,
      pdf:          occPDF,
    },
    {
      title:        'P&L Summary',
      description:  'Revenue minus expenses for the month',
      metric:       formatCurrency(Math.abs(netPLPaise)),
      metricLabel:  netPLPaise >= 0 ? 'Net Profit' : 'Net Loss',
      count:        expenses.length,
      csvFilename:  `pl-${month}.csv`,
      pdfFilename:  `pl-${month}.pdf`,
      csvHeaders:   plCSVHeaders,
      csvRows:      plCSVRows,
      pdf:          plPDF,
    },
  ]

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
          {activeProperty && (
            <p className="text-sm text-gray-500 mt-0.5">{activeProperty.name}</p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {properties.length > 1 && (
          <Select value={activePropertyId ?? ''} onValueChange={setActiveProperty}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Select property" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={month} onValueChange={(v) => { if (v) setMonth(v) }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map((card) => (
            <div key={card.title} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{card.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{card.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-gray-900">{card.metric}</p>
                  <p className="text-xs text-gray-400">{card.metricLabel}</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                {card.count} record{card.count !== 1 ? 's' : ''} · {monthLabel}
              </p>
              <ReportDownloadButtons
                csvFilename={card.csvFilename}
                csvHeaders={card.csvHeaders}
                csvRows={card.csvRows}
                pdf={card.pdf}
                pdfFilename={card.pdfFilename}
              />
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
