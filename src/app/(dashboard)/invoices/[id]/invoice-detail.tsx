'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO } from 'date-fns'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Building2,
  User,
  Calendar,
  Loader2,
  FileText,
  CheckCircle,
  Send,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils/currency'
import { paiseToWords } from '@/lib/utils/number-to-words'
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_STYLES,
  INVOICE_STATUS_TRANSITIONS,
} from '@/lib/validations/invoice'
import { InvoiceDownloadButton } from '@/components/invoices/invoice-download-button'
import type { Invoice, InvoiceStatus } from '@/types'

interface InvoiceDetailProps {
  invoice: Invoice
}

function formatDate(iso: string): string {
  try { return format(parseISO(iso), 'd MMM yyyy') } catch { return iso }
}

export function InvoiceDetail({ invoice }: InvoiceDetailProps) {
  const router = useRouter()
  const supabase = createClient()

  const [status, setStatus] = useState<InvoiceStatus>(invoice.status)
  const [transitioning, setTransitioning] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const transitions = INVOICE_STATUS_TRANSITIONS[status] ?? []
  const canCancel = status !== 'cancelled' && status !== 'paid'

  const lineData = invoice.line_items
  const isInterState = invoice.igst_rate > 0
  const totalTax =
    invoice.cgst_amount_paise +
    invoice.sgst_amount_paise +
    invoice.igst_amount_paise
  const amountWords = paiseToWords(invoice.total_paise)

  // ── Status transition ─────────────────────────────────────────────────────
  async function handleTransition(nextStatus: string) {
    setTransitioning(true)
    const { error } = await supabase
      .from('invoices')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', invoice.id)
    setTransitioning(false)
    if (!error) {
      const labels: Record<string, string> = { sent: 'Invoice marked as sent', paid: 'Invoice marked as paid' }
      toast.success(labels[nextStatus] ?? 'Status updated')
      setStatus(nextStatus as InvoiceStatus)
    } else {
      toast.error('Failed to update invoice status')
    }
  }

  // ── Cancel ────────────────────────────────────────────────────────────────
  async function handleCancel() {
    setCancelling(true)
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', invoice.id)
    setCancelling(false)
    if (!error) {
      toast.success('Invoice cancelled')
      setShowCancelDialog(false)
      setStatus('cancelled')
    } else {
      toast.error('Failed to cancel invoice')
    }
  }

  const currentInvoice = { ...invoice, status }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Back */}
      <Link
        href="/invoices"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="w-4 h-4" />
        Invoices
      </Link>

      {/* ── Action bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold font-mono text-gray-900">
            {invoice.invoice_number}
          </h1>
          <Badge variant="outline" className={INVOICE_STATUS_STYLES[status]}>
            {INVOICE_STATUS_LABELS[status]}
          </Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status transition buttons */}
          {transitions.map((t) => (
            <Button
              key={t.next}
              size="sm"
              disabled={transitioning}
              onClick={() => handleTransition(t.next)}
              className="gap-1.5"
            >
              {transitioning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : t.next === 'sent' ? (
                <Send className="w-3.5 h-3.5" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5" />
              )}
              {t.label}
            </Button>
          ))}

          {canCancel && (
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 hover:text-red-700 hover:border-red-200 gap-1.5"
              onClick={() => setShowCancelDialog(true)}
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancel
            </Button>
          )}

          {/* PDF Download */}
          <InvoiceDownloadButton invoice={currentInvoice} />
        </div>
      </div>

      {/* ── Invoice card (print-style) ───────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* Header band */}
        <div className="bg-slate-800 px-6 py-5 flex items-start justify-between">
          <div>
            <p className="text-white font-semibold text-lg leading-tight">
              {invoice.property_name}
            </p>
            <p className="text-slate-300 text-sm mt-1">{invoice.property_address}</p>
            {invoice.property_gstin && (
              <p className="text-slate-400 text-xs mt-0.5">
                GSTIN: {invoice.property_gstin}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-blue-300 text-xl font-bold tracking-wide">TAX INVOICE</p>
            <p className="text-slate-400 text-xs mt-1">SAC 9963 · Accommodation</p>
          </div>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100">
          {[
            { label: 'Invoice Number', value: invoice.invoice_number, mono: true },
            { label: 'Invoice Date', value: formatDate(invoice.invoice_date) },
            { label: 'Place of Supply', value: lineData?.property_state ?? invoice.property_address.split(',').pop()?.trim() ?? '—' },
            { label: 'Supply Type', value: isInterState ? 'Inter-State' : 'Intra-State' },
          ].map(({ label, value, mono }) => (
            <div key={label} className="bg-white px-4 py-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
              <p className={`text-sm font-semibold text-gray-900 mt-0.5 ${mono ? 'font-mono' : ''}`}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Bill to / Bill by */}
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100 px-0">
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wide mb-2">
              <User className="w-3.5 h-3.5" />
              Bill To
            </div>
            <p className="font-semibold text-gray-900">{invoice.guest_name}</p>
            {invoice.guest_address && (
              <p className="text-sm text-gray-500 mt-0.5">{invoice.guest_address}</p>
            )}
            {lineData?.guest_state && (
              <p className="text-sm text-gray-500">{lineData.guest_state}</p>
            )}
            {invoice.guest_gstin && (
              <p className="text-sm text-gray-400 font-mono">GSTIN: {invoice.guest_gstin}</p>
            )}
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wide mb-2">
              <Building2 className="w-3.5 h-3.5" />
              Property
            </div>
            <p className="font-semibold text-gray-900">{invoice.property_name}</p>
            <p className="text-sm text-gray-500 mt-0.5">{invoice.property_address}</p>
            {invoice.property_gstin && (
              <p className="text-sm text-gray-400 font-mono">GSTIN: {invoice.property_gstin}</p>
            )}
          </div>
        </div>

        {/* Stay info */}
        {lineData && (
          <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 flex flex-wrap gap-4">
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span>{lineData.num_nights} night{lineData.num_nights !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <FileText className="w-3.5 h-3.5 text-gray-400" />
              <span>{lineData.room_name}</span>
            </div>
            <div className="text-sm text-gray-600">
              {formatCurrency(lineData.rate_per_night_paise)} / night
            </div>
          </div>
        )}

        {/* Line items table */}
        <div className="border-t border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-6">#</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">SAC</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Nights</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Rate</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(lineData?.items ?? [
                {
                  description: `Accommodation — ${invoice.property_name}`,
                  sac_code: '9963',
                  qty: lineData?.num_nights ?? 1,
                  rate_paise: lineData?.rate_per_night_paise ?? invoice.subtotal_paise,
                  amount_paise: invoice.subtotal_paise,
                },
              ]).map((item, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.description}</td>
                  <td className="px-4 py-3 text-center text-gray-500 hidden sm:table-cell font-mono text-xs">
                    {item.sac_code}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600 hidden md:table-cell">
                    {item.qty}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 hidden md:table-cell">
                    {formatCurrency(item.rate_paise)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {formatCurrency(item.amount_paise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end p-6 border-t border-gray-200">
          <div className="w-64 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-900">{formatCurrency(invoice.subtotal_paise)}</span>
            </div>

            {isInterState ? (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">IGST @ {invoice.igst_rate}%</span>
                <span className="text-gray-900">{formatCurrency(invoice.igst_amount_paise)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">CGST @ {invoice.cgst_rate}%</span>
                  <span className="text-gray-900">{formatCurrency(invoice.cgst_amount_paise)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">SGST @ {invoice.sgst_rate}%</span>
                  <span className="text-gray-900">{formatCurrency(invoice.sgst_amount_paise)}</span>
                </div>
              </>
            )}

            <div className="flex justify-between text-sm border-t border-gray-100 pt-1.5">
              <span className="text-gray-500">Total Tax</span>
              <span className="text-gray-900">{formatCurrency(totalTax)}</span>
            </div>

            <div className="flex justify-between font-bold text-base bg-slate-800 text-white rounded-lg px-3 py-2.5 mt-2">
              <span>Grand Total</span>
              <span>{formatCurrency(invoice.total_paise)}</span>
            </div>
          </div>
        </div>

        {/* Amount in words */}
        <div className="mx-6 mb-5 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Amount in Words</p>
          <p className="text-sm font-medium text-gray-700">{amountWords}</p>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="mx-6 mb-5">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-600">{invoice.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-3 flex justify-between items-center">
          <p className="text-xs text-gray-400">
            This is a computer-generated tax invoice.
          </p>
          <p className="text-xs font-mono text-gray-400">{invoice.id.slice(0, 8)}…</p>
        </div>
      </div>

      {/* Cancel dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel invoice?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Cancel invoice <strong className="font-mono">{invoice.invoice_number}</strong>?
            This will mark it as cancelled. The booking is not affected.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Keep invoice
            </Button>
            <Button
              variant="destructive"
              disabled={cancelling}
              onClick={handleCancel}
            >
              {cancelling ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Cancelling…</>
              ) : (
                'Yes, cancel'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
