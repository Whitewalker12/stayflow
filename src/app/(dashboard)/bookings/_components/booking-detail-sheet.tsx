'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertTriangle,
  Loader2,
  ExternalLink,
  CreditCard,
  Calendar,
  User,
  Home,
  FileText,
  Pencil,
  X,
  Receipt,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO, differenceInDays } from 'date-fns'
import { formatCurrency, rupeesToPaise, paiseToRupees } from '@/lib/utils/currency'
import { StatusBadge } from './status-badge'
import { SOURCE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '@/lib/validations/booking'
import type { Booking, BookingStatus, Room, Property } from '@/types'
import type { BookingWithGuest } from './booking-calendar'

interface BookingDetailSheetProps {
  booking: BookingWithGuest | null
  room?: Room | null
  property?: Property | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}

const STATUS_TRANSITIONS: Partial<Record<BookingStatus, { label: string; next: BookingStatus; variant: 'default' | 'outline' }[]>> = {
  pending:    [{ label: 'Confirm',   next: 'confirmed',   variant: 'default' }],
  confirmed:  [{ label: 'Check In',  next: 'checked_in',  variant: 'default' }],
  checked_in: [{ label: 'Check Out', next: 'checked_out', variant: 'default' }],
}

function formatDate(iso: string) {
  try { return format(parseISO(iso), 'd MMM yyyy') } catch { return iso }
}

export function BookingDetailSheet({
  booking,
  room,
  property,
  open,
  onOpenChange,
  onUpdated,
}: BookingDetailSheetProps) {
  const supabase = createClient()
  const router = useRouter()
  const [transitioning, setTransitioning] = useState(false)
  // Invoice generation state
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  // Payment update state
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('upi')
  const [recordingPayment, setRecordingPayment] = useState(false)

  // Edit rate state
  const [editingRate, setEditingRate] = useState(false)
  const [newRate, setNewRate] = useState('')
  const [savingRate, setSavingRate] = useState(false)

  if (!booking) return null

  const nights = differenceInDays(
    parseISO(booking.check_out_date),
    parseISO(booking.check_in_date)
  )

  const transitions = STATUS_TRANSITIONS[booking.status] ?? []
  const canCancel = !['cancelled', 'no_show', 'checked_out'].includes(booking.status)

  // ── Status transition ────────────────────────────────────────────────────
  async function handleTransition(nextStatus: BookingStatus) {
    if (!booking) return
    setTransitioning(true)
    const { error } = await supabase
      .from('bookings')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', booking.id)
    setTransitioning(false)
    if (!error) {
      const labels: Record<string, string> = {
        confirmed: 'Booking confirmed',
        checked_in: 'Guest checked in',
        checked_out: 'Guest checked out',
      }
      toast.success(labels[nextStatus] ?? 'Status updated')

      // Notify owner via WhatsApp (fire-and-forget)
      fetch('/api/bookings/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: booking.id,
          event: 'status_changed',
          new_status: nextStatus,
        }),
      }).catch(() => {})

      onUpdated()
      if (nextStatus !== 'checked_out') onOpenChange(false)
    } else {
      toast.error('Failed to update status')
    }
  }

  // ── Cancel ───────────────────────────────────────────────────────────────
  async function handleCancel() {
    if (!booking) return
    setCancelling(true)
    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        special_requests: cancelReason
          ? `[CANCELLED: ${cancelReason}]\n${booking.special_requests ?? ''}`
          : booking.special_requests,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id)
    setCancelling(false)
    if (!error) {
      toast.success('Booking cancelled')
      setShowCancelDialog(false)
      onUpdated()
      onOpenChange(false)
    } else {
      toast.error('Failed to cancel booking')
    }
  }

  // ── Record payment ────────────────────────────────────────────────────────
  async function handleRecordPayment() {
    if (!booking) return
    const amount = parseFloat(paymentAmount)
    if (!amount || amount <= 0) return

    setRecordingPayment(true)
    const totalRupees = paiseToRupees(booking.total_amount_paise)
    // We don't track payment history per-row in MVP; just update total tracking
    // Determine new payment status
    const newStatus =
      amount >= totalRupees ? 'paid' : amount > 0 ? 'partial' : 'pending'

    const { error } = await supabase
      .from('bookings')
      .update({
        payment_status: newStatus,
        payment_method: paymentMethod,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id)

    setRecordingPayment(false)
    if (!error) {
      toast.success('Payment recorded')
      setShowPaymentForm(false)
      setPaymentAmount('')
      onUpdated()
    } else {
      toast.error('Failed to record payment')
    }
  }

  // ── Edit rate ─────────────────────────────────────────────────────────────
  async function handleSaveRate() {
    if (!booking) return
    const rate = parseFloat(newRate)
    if (!rate || rate <= 0) return
    setSavingRate(true)
    const ratePaise = rupeesToPaise(rate)
    const totalPaise = ratePaise * nights
    const { error } = await supabase
      .from('bookings')
      .update({
        rate_per_night_paise: ratePaise,
        total_amount_paise: totalPaise,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id)
    setSavingRate(false)
    if (!error) {
      toast.success('Rate updated')
      setEditingRate(false)
      onUpdated()
    } else {
      toast.error('Failed to update rate')
    }
  }

  // ── Generate invoice ──────────────────────────────────────────────────────
  async function handleGenerateInvoice() {
    if (!booking) return
    setGeneratingInvoice(true)
    setInvoiceError(null)
    try {
      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: booking.id,
          invoice_date: new Date().toISOString().split('T')[0],
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        // If invoice already exists, navigate to it
        if (res.status === 409 && json.invoice_id) {
          toast('Invoice already exists', { description: 'Opening existing invoice…' })
          onOpenChange(false)
          router.push(`/invoices/${json.invoice_id}`)
          return
        }
        setInvoiceError(json.error ?? 'Failed to generate invoice')
        toast.error('Failed to generate invoice')
      } else {
        toast.success('Invoice generated', { description: json.invoice_number })
        onOpenChange(false)
        router.push(`/invoices/${json.invoice_id}`)
      }
    } catch {
      setInvoiceError('Network error. Please try again.')
    } finally {
      setGeneratingInvoice(false)
    }
  }

  const paymentStatusClass = {
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    partial: 'bg-orange-50 text-orange-700 border-orange-200',
    paid: 'bg-green-50 text-green-700 border-green-200',
    refunded: 'bg-purple-50 text-purple-700 border-purple-200',
  }[booking.payment_status]

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle className="text-lg">{booking.guest_name}</SheetTitle>
                <p className="text-sm text-gray-500 mt-0.5">
                  {property?.name} · {room?.name ?? '—'}
                </p>
              </div>
              <StatusBadge status={booking.status} />
            </div>
          </SheetHeader>

          <div className="space-y-5">
            {/* ── Dates ─────────────────────────────────────────────── */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="font-medium text-gray-700">
                  {formatDate(booking.check_in_date)} → {formatDate(booking.check_out_date)}
                </span>
                <span className="text-gray-400 text-xs">
                  {nights} night{nights !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Home className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">{room?.name ?? '—'}</span>
                <span className="text-gray-400 text-xs capitalize">{room?.room_type}</span>
              </div>
            </div>

            {/* ── Status transition buttons ──────────────────────────── */}
            {(transitions.length > 0 || canCancel) && (
              <div className="flex flex-wrap gap-2">
                {transitions.map((t) => (
                  <Button
                    key={t.next}
                    size="sm"
                    variant={t.variant}
                    disabled={transitioning}
                    onClick={() => handleTransition(t.next)}
                    className="gap-1.5"
                  >
                    {transitioning ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : null}
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
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </Button>
                )}
              </div>
            )}

            {/* ── Booking info ───────────────────────────────────────── */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-gray-500">Source</dt>
              <dd className="text-gray-900">{SOURCE_LABELS[booking.source] ?? booking.source}</dd>

              <dt className="text-gray-500">Adults / Children</dt>
              <dd className="text-gray-900">
                {booking.num_adults} adult{booking.num_adults !== 1 ? 's' : ''}
                {booking.num_children > 0 ? `, ${booking.num_children} child${booking.num_children !== 1 ? 'ren' : ''}` : ''}
              </dd>

              <dt className="text-gray-500">Rate / night</dt>
              <dd className="text-gray-900 flex items-center gap-2">
                {editingRate ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      value={newRate}
                      onChange={(e) => setNewRate(e.target.value)}
                      className="h-7 w-24 text-xs"
                      placeholder="₹"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={savingRate}
                      onClick={handleSaveRate}
                    >
                      {savingRate ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setEditingRate(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    {formatCurrency(booking.rate_per_night_paise)}
                    {['pending', 'confirmed'].includes(booking.status) && (
                      <button
                        onClick={() => {
                          setNewRate(String(paiseToRupees(booking.rate_per_night_paise)))
                          setEditingRate(true)
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </>
                )}
              </dd>

              <dt className="text-gray-500">Total</dt>
              <dd className="text-gray-900 font-semibold">
                {formatCurrency(booking.total_amount_paise)}
              </dd>
            </dl>

            {/* ── Payment ────────────────────────────────────────────── */}
            <div className="border border-gray-200 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">Payment</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={paymentStatusClass}>
                    {booking.payment_status}
                  </Badge>
                  {booking.payment_method && (
                    <span className="text-xs text-gray-400">
                      {PAYMENT_METHOD_LABELS[booking.payment_method] ?? booking.payment_method}
                    </span>
                  )}
                  {!['cancelled', 'no_show', 'checked_out'].includes(booking.status) && (
                    <button
                      onClick={() => setShowPaymentForm(!showPaymentForm)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Update
                    </button>
                  )}
                </div>
              </div>

              {showPaymentForm && (
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <p className="text-xs text-gray-500">Record a payment received:</p>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Amount paid (₹)"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Select value={paymentMethod} onValueChange={(v) => { if (v) setPaymentMethod(v) }}>
                      <SelectTrigger className="h-8 text-sm w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {PAYMENT_METHOD_LABELS[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-8 shrink-0"
                      disabled={recordingPayment}
                      onClick={handleRecordPayment}
                    >
                      {recordingPayment ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        'Save'
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Guest link ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-gray-700">{booking.guest_name}</span>
              </div>
              {/* We'd need guest_id in BookingWithGuest to link — show if available */}
              <Link
                href={`/guests`}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                Guest registry
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            {/* ── Special requests ───────────────────────────────────── */}
            {booking.special_requests && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Special Requests
                </p>
                <p className="text-sm text-gray-700 bg-gray-50 rounded p-2">
                  {booking.special_requests}
                </p>
              </div>
            )}

            {/* ── Invoice section ─────────────────────────────────────── */}
            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="font-medium">Invoice</span>
                </div>
                <Link
                  href="/invoices"
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  View all
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              {invoiceError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {invoiceError}
                </p>
              )}

              {booking.status === 'checked_out' ? (
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  disabled={generatingInvoice}
                  onClick={handleGenerateInvoice}
                >
                  {generatingInvoice ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</>
                  ) : (
                    <><Receipt className="w-3.5 h-3.5" />Generate GST Invoice</>
                  )}
                </Button>
              ) : (
                <p className="text-xs text-gray-400">
                  Invoice can be generated after check-out
                </p>
              )}
            </div>

            {/* ── Booking meta ───────────────────────────────────────── */}
            <p className="text-xs text-gray-400">
              Booking ID: <span className="font-mono">{booking.id.slice(0, 8)}…</span>
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Cancel dialog ─────────────────────────────────────────────── */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel booking?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Cancel booking for <strong>{booking.guest_name}</strong>{' '}
            ({formatDate(booking.check_in_date)} – {formatDate(booking.check_out_date)}).
          </p>
          <div className="space-y-1.5">
            <Label>Reason <span className="text-gray-400 text-xs">(optional)</span></Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Guest request, no-show, etc."
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Keep booking
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
    </>
  )
}
