'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FileText, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils/currency'
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_STYLES,
} from '@/lib/validations/invoice'
import type { Invoice, InvoiceStatus, Property } from '@/types'

interface InvoicesClientProps {
  invoices: Invoice[]
  properties: Property[]
}

type DateFilter = 'all' | 'this_month' | 'last_month' | 'this_fy'

const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  all:        'All time',
  this_month: 'This month',
  last_month: 'Last month',
  this_fy:    'This financial year',
}

function formatDate(iso: string): string {
  try { return format(parseISO(iso), 'd MMM yyyy') } catch { return iso }
}

export function InvoicesClient({ invoices, properties }: InvoicesClientProps) {
  const router = useRouter()

  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all')
  const [propertyFilter, setPropertyFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')

  const filtered = useMemo(() => {
    const now = new Date()

    // Date range for filter
    let dateFrom: Date | null = null
    let dateTo: Date | null = null

    if (dateFilter === 'this_month') {
      dateFrom = startOfMonth(now)
      dateTo = endOfMonth(now)
    } else if (dateFilter === 'last_month') {
      const last = subMonths(now, 1)
      dateFrom = startOfMonth(last)
      dateTo = endOfMonth(last)
    } else if (dateFilter === 'this_fy') {
      const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
      dateFrom = new Date(`${fyStartYear}-04-01`)
      dateTo = new Date(`${fyStartYear + 1}-03-31`)
    }

    return invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false
      if (propertyFilter !== 'all' && inv.property_id !== propertyFilter) return false
      if (dateFrom || dateTo) {
        const d = parseISO(inv.invoice_date)
        if (dateFrom && d < dateFrom) return false
        if (dateTo && d > dateTo) return false
      }
      return true
    })
  }, [invoices, statusFilter, propertyFilter, dateFilter])

  // Summary stats
  const totalAmount = filtered.reduce((sum, inv) => sum + inv.total_paise, 0)
  const paidAmount = filtered
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.total_paise, 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Invoices</h1>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => router.push('/bookings')}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Generate from Booking</span>
          <span className="sm:hidden">Generate</span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Invoiced</p>
          <p className="text-xl font-semibold text-gray-900 mt-0.5">
            {formatCurrency(totalAmount)}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Collected</p>
          <p className="text-xl font-semibold text-green-700 mt-0.5">
            {formatCurrency(paidAmount)}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Invoices</p>
          <p className="text-xl font-semibold text-gray-900 mt-0.5">{filtered.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Outstanding</p>
          <p className="text-xl font-semibold text-amber-600 mt-0.5">
            {formatCurrency(totalAmount - paidAmount)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status */}
          <Select
            value={statusFilter}
            onValueChange={(v) => { if (v) setStatusFilter(v as InvoiceStatus | 'all') }}
          >
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(['draft', 'sent', 'paid', 'cancelled'] as InvoiceStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {INVOICE_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range */}
          <Select
            value={dateFilter}
            onValueChange={(v) => { if (v) setDateFilter(v as DateFilter) }}
          >
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DATE_FILTER_LABELS) as DateFilter[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {DATE_FILTER_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Property */}
          {properties.length > 1 && (
            <Select
              value={propertyFilter}
              onValueChange={(v) => { if (v) setPropertyFilter(v) }}
            >
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="All properties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All properties</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <span className="text-xs text-gray-400 ml-auto">
            {filtered.length} invoice{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="w-8 h-8 text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">No invoices found</p>
            <p className="text-gray-400 text-xs mt-1">
              Generate invoices from checked-out bookings
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead className="hidden md:table-cell">Property</TableHead>
                <TableHead className="hidden lg:table-cell">Subtotal</TableHead>
                <TableHead className="hidden lg:table-cell">Tax</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv) => {
                const taxTotal =
                  inv.cgst_amount_paise +
                  inv.sgst_amount_paise +
                  inv.igst_amount_paise

                const propertyName =
                  properties.find((p) => p.id === inv.property_id)?.name ??
                  inv.property_name

                return (
                  <TableRow
                    key={inv.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/invoices/${inv.id}`)}
                  >
                    <TableCell>
                      <p className="font-mono text-sm font-medium text-gray-900">
                        {inv.invoice_number}
                      </p>
                      <p className="text-xs text-gray-400 sm:hidden mt-0.5">
                        {formatDate(inv.invoice_date)}
                      </p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-gray-600">
                      {formatDate(inv.invoice_date)}
                    </TableCell>
                    <TableCell className="text-gray-900">{inv.guest_name}</TableCell>
                    <TableCell className="hidden md:table-cell text-gray-500 text-sm">
                      {propertyName}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-gray-600">
                      {formatCurrency(inv.subtotal_paise)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-gray-500 text-sm">
                      {formatCurrency(taxTotal)}
                    </TableCell>
                    <TableCell className="font-semibold text-gray-900">
                      {formatCurrency(inv.total_paise)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={INVOICE_STATUS_STYLES[inv.status]}
                      >
                        {INVOICE_STATUS_LABELS[inv.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
