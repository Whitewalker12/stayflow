'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { GuestSearch } from '@/components/shared/guest-search'
import {
  bookingSchema,
  SOURCE_LABELS,
  PAYMENT_METHOD_LABELS,
  BOOKING_SOURCES,
  PAYMENT_METHODS,
  type BookingFormData,
} from '@/lib/validations/booking'
import { rupeesToPaise, paiseToRupees } from '@/lib/utils/currency'
import { differenceInDays, parseISO } from 'date-fns'
import type { Property, Room, Guest } from '@/types'

interface NewBookingSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  properties: Property[]
  /** Pre-fill from calendar cell click */
  prefill?: { roomId?: string; date?: Date; propertyId?: string } | null
  onCreated: () => void
}

type FormState = {
  property_id: string
  room_id: string
  check_in_date: string
  check_out_date: string
  num_adults: number
  num_children: number
  rate_per_night: string   // string for input, converted to number on submit
  source: string
  payment_method: string
  amount_paid: string
  ota_booking_id: string
  special_requests: string
  internal_notes: string
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
function tomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export function NewBookingSheet({
  open,
  onOpenChange,
  properties,
  prefill,
  onCreated,
}: NewBookingSheetProps) {
  const supabase = createClient()

  const [form, setForm] = useState<FormState>({
    property_id: properties[0]?.id ?? '',
    room_id: '',
    check_in_date: todayStr(),
    check_out_date: tomorrowStr(),
    num_adults: 1,
    num_children: 0,
    rate_per_night: '',
    source: 'direct',
    payment_method: 'upi',
    amount_paid: '0',
    ota_booking_id: '',
    special_requests: '',
    internal_notes: '',
  })
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [loadingRooms, setLoadingRooms] = useState(false)
  const [availability, setAvailability] = useState<{
    checked: boolean
    available: boolean | null
    checking: boolean
  }>({ checked: false, available: null, checking: false })
  const [errors, setErrors] = useState<Partial<Record<keyof BookingFormData | 'server', string>>>({})
  const [submitting, setSubmitting] = useState(false)

  // ── Apply prefill when sheet opens ──────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const checkIn = prefill?.date
      ? prefill.date.toISOString().split('T')[0]
      : todayStr()
    const checkOutDate = new Date(checkIn)
    checkOutDate.setDate(checkOutDate.getDate() + 1)
    const checkOut = checkOutDate.toISOString().split('T')[0]

    setForm((prev) => ({
      ...prev,
      property_id: prefill?.propertyId ?? properties[0]?.id ?? '',
      room_id: prefill?.roomId ?? '',
      check_in_date: checkIn,
      check_out_date: checkOut,
    }))
    setSelectedGuest(null)
    setErrors({})
    setAvailability({ checked: false, available: null, checking: false })
  }, [open, prefill, properties])

  // ── Fetch rooms when property changes ────────────────────────────────────
  useEffect(() => {
    if (!form.property_id) { setRooms([]); return }
    setLoadingRooms(true)
    supabase
      .from('rooms')
      .select('*')
      .eq('property_id', form.property_id)
      .is('deleted_at', null)
      .order('name')
      .then(({ data }) => {
        setRooms((data ?? []) as Room[])
        setLoadingRooms(false)
      })
  }, [form.property_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-fill rate when room selected ───────────────────────────────────
  useEffect(() => {
    if (!form.room_id) return
    const room = rooms.find((r) => r.id === form.room_id)
    if (room) {
      setForm((prev) => ({
        ...prev,
        rate_per_night: String(paiseToRupees(room.base_rate_paise)),
      }))
    }
  }, [form.room_id, rooms])

  // ── Availability check ───────────────────────────────────────────────────
  const checkAvailability = useCallback(async () => {
    if (!form.room_id || !form.check_in_date || !form.check_out_date) return
    if (form.check_out_date <= form.check_in_date) return

    setAvailability({ checked: false, available: null, checking: true })
    try {
      const res = await fetch(
        `/api/bookings/check-availability?room_id=${form.room_id}&check_in_date=${form.check_in_date}&check_out_date=${form.check_out_date}`
      )
      const json = await res.json()
      setAvailability({ checked: true, available: json.available, checking: false })
    } catch {
      setAvailability({ checked: false, available: null, checking: false })
    }
  }, [form.room_id, form.check_in_date, form.check_out_date])

  // Trigger availability check when room or dates change
  useEffect(() => {
    if (form.room_id && form.check_in_date && form.check_out_date) {
      checkAvailability()
    }
  }, [form.room_id, form.check_in_date, form.check_out_date, checkAvailability])

  // ── Computed values ──────────────────────────────────────────────────────
  const nights =
    form.check_in_date && form.check_out_date && form.check_out_date > form.check_in_date
      ? differenceInDays(parseISO(form.check_out_date), parseISO(form.check_in_date))
      : 0
  const rateNum = parseFloat(form.rate_per_night) || 0
  const totalRupees = rateNum * nights
  const amountPaidNum = parseFloat(form.amount_paid) || 0

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = bookingSchema.safeParse({
      property_id: form.property_id,
      room_id: form.room_id,
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
      guest_id: selectedGuest?.id ?? '',
      num_adults: form.num_adults,
      num_children: form.num_children,
      rate_per_night: rateNum,
      source: form.source,
      payment_method: form.payment_method || undefined,
      amount_paid: amountPaidNum,
      ota_booking_id: form.ota_booking_id || undefined,
      special_requests: form.special_requests || undefined,
      internal_notes: form.internal_notes || undefined,
    })

    if (!parsed.success) {
      const fieldErrors: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof BookingFormData
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    if (!selectedGuest) {
      setErrors((prev) => ({ ...prev, guest_id: 'Select a guest' }))
      return
    }

    if (availability.available === false) {
      setErrors((prev) => ({ ...prev, server: 'This room is not available for the selected dates.' }))
      return
    }

    setSubmitting(true)

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setErrors({ server: 'Not authenticated. Please log in again.' })
      setSubmitting(false)
      return
    }

    const totalAmountPaise = rupeesToPaise(totalRupees)
    const ratePaise = rupeesToPaise(rateNum)

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        property_id: form.property_id,
        room_id: form.room_id,
        primary_guest_id: selectedGuest.id,
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        status: 'confirmed',
        source: form.source,
        rate_per_night_paise: ratePaise,
        total_amount_paise: totalAmountPaise,
        num_adults: form.num_adults,
        num_children: form.num_children,
        payment_status:
          amountPaidNum >= totalRupees
            ? 'paid'
            : amountPaidNum > 0
            ? 'partial'
            : 'pending',
        payment_method: form.payment_method || null,
        special_requests: form.special_requests || null,
      })
      .select('id')
      .single()

    if (bookingError || !booking) {
      // 23P01 = exclusion constraint (overlapping booking dates)
      if (bookingError?.code === '23P01') {
        setErrors({ check_out_date: 'These dates overlap with an existing booking for this room' })
      } else {
        setErrors({ server: bookingError?.message ?? 'Failed to create booking' })
      }
      setSubmitting(false)
      return
    }

    // Create booking_guests junction record
    const { error: bgError } = await supabase.from('booking_guests').insert({
      booking_id: booking.id,
      guest_id: selectedGuest.id,
      is_primary: true,
    })

    if (bgError) {
      // Booking created but guest link failed — still proceed, not fatal
      console.error('booking_guests insert error:', bgError.message)
    }

    // ── Notify owner via WhatsApp (fire-and-forget) ───────────────────────
    fetch('/api/bookings/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: booking.id, event: 'created' }),
    }).catch(() => {})  // never block the UI on notification failure

    setSubmitting(false)
    toast.success('Booking created successfully')
    onCreated()
    onOpenChange(false)
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (errors[key as keyof BookingFormData]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }))
    }
  }

  const selectedRoom = rooms.find((r) => r.id === form.room_id)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <SheetHeader className="px-6 py-5 border-b border-gray-100 shrink-0">
          <SheetTitle className="text-base">New Booking</SheetTitle>
        </SheetHeader>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <form id="new-booking-form" onSubmit={handleSubmit}>

            {/* Server error */}
            {errors.server && (
              <div className="mx-6 mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {errors.server}
              </div>
            )}

            {/* ── Section: Room & Dates ──────────────────────────────────── */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Room & Dates</p>

              {/* Property — only shown when multiple */}
              {properties.length > 1 && (
                <div className="space-y-1.5">
                  <Label>Property</Label>
                  <Select
                    value={form.property_id}
                    onValueChange={(v) => {
                      if (v) set('property_id', v)
                      set('room_id', '')
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select property" />
                    </SelectTrigger>
                    <SelectContent>
                      {properties.map((p) => (
                        <SelectItem key={p.id} value={p.id} label={p.name}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Room */}
              <div className="space-y-1.5">
                <Label>Room <span className="text-red-500">*</span></Label>
                <Select
                  value={form.room_id}
                  onValueChange={(v) => { if (v) set('room_id', v) }}
                  disabled={loadingRooms}
                >
                  <SelectTrigger className={errors.room_id ? 'border-red-300' : ''}>
                    <SelectValue placeholder={loadingRooms ? 'Loading rooms…' : 'Select room'} />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id} label={r.name}>
                        <span className="flex items-center justify-between w-full gap-4">
                          <span>{r.name}</span>
                          <span className="text-gray-400 text-xs capitalize">{r.room_type}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.room_id && <p className="text-xs text-red-500">{errors.room_id}</p>}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Check-in <span className="text-red-500">*</span></Label>
                  <Input
                    type="date"
                    value={form.check_in_date}
                    onChange={(e) => set('check_in_date', e.target.value)}
                    className={errors.check_in_date ? 'border-red-300' : ''}
                  />
                  {errors.check_in_date && <p className="text-xs text-red-500">{errors.check_in_date}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Check-out <span className="text-red-500">*</span></Label>
                  <Input
                    type="date"
                    value={form.check_out_date}
                    min={form.check_in_date}
                    onChange={(e) => set('check_out_date', e.target.value)}
                    className={errors.check_out_date ? 'border-red-300' : ''}
                  />
                  {errors.check_out_date && <p className="text-xs text-red-500">{errors.check_out_date}</p>}
                </div>
              </div>

              {/* Nights + availability pill */}
              {nights > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">{nights} night{nights !== 1 ? 's' : ''}</span>
                  {availability.checking && (
                    <span className="flex items-center gap-1 text-gray-400 text-xs">
                      <Loader2 className="w-3 h-3 animate-spin" /> Checking…
                    </span>
                  )}
                  {availability.checked && availability.available === true && (
                    <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                      <CheckCircle className="w-3 h-3" /> Available
                    </span>
                  )}
                  {availability.checked && availability.available === false && (
                    <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                      <AlertTriangle className="w-3 h-3" /> Dates conflict
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-gray-100" />

            {/* ── Section: Guest ─────────────────────────────────────────── */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Guest</p>

              <div className="space-y-1.5">
                <Label>Guest <span className="text-red-500">*</span></Label>
                <GuestSearch value={selectedGuest} onChange={setSelectedGuest} allowCreate />
                {errors.guest_id && <p className="text-xs text-red-500">{errors.guest_id}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Adults <span className="text-red-500">*</span></Label>
                  <Input
                    type="number"
                    min={1}
                    max={selectedRoom?.max_occupancy ?? 10}
                    value={form.num_adults}
                    onChange={(e) => set('num_adults', parseInt(e.target.value) || 1)}
                    className={errors.num_adults ? 'border-red-300' : ''}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Children</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={form.num_children}
                    onChange={(e) => set('num_children', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* ── Section: Rate & Payment ─────────────────────────────────── */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Rate & Payment</p>

              {/* Rate */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Rate / night (₹) <span className="text-red-500">*</span></Label>
                  {selectedRoom && (
                    <span className="text-xs text-gray-400">
                      Base ₹{paiseToRupees(selectedRoom.base_rate_paise).toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
                <Input
                  type="number"
                  min={1}
                  value={form.rate_per_night}
                  onChange={(e) => set('rate_per_night', e.target.value)}
                  placeholder="e.g. 3500"
                  className={errors.rate_per_night ? 'border-red-300' : ''}
                />
                {errors.rate_per_night && <p className="text-xs text-red-500">{errors.rate_per_night}</p>}
                {nights > 0 && rateNum > 0 && (
                  <p className="text-xs text-gray-500">
                    Total ₹{totalRupees.toLocaleString('en-IN')} ({nights} × ₹{rateNum.toLocaleString('en-IN')})
                  </p>
                )}
              </div>

              {/* Source */}
              <div className="space-y-1.5">
                <Label>Booking Source <span className="text-red-500">*</span></Label>
                <Select value={form.source} onValueChange={(v) => { if (v) set('source', v) }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOKING_SOURCES.map((s) => (
                      <SelectItem key={s} value={s} label={SOURCE_LABELS[s]}>
                        {SOURCE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Payment method + amount */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Payment Method</Label>
                  <Select
                    value={form.payment_method}
                    onValueChange={(v) => { if (v) set('payment_method', v) }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m} label={PAYMENT_METHOD_LABELS[m]}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Amount Paid (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.amount_paid}
                    onChange={(e) => set('amount_paid', e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Payment status chip */}
              {nights > 0 && rateNum > 0 && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  Status:{' '}
                  <Badge
                    variant="outline"
                    className={
                      amountPaidNum >= totalRupees
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : amountPaidNum > 0
                        ? 'bg-orange-50 text-orange-700 border-orange-200'
                        : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                    }
                  >
                    {amountPaidNum >= totalRupees ? 'Paid' : amountPaidNum > 0 ? 'Partial' : 'Pending'}
                  </Badge>
                  {amountPaidNum < totalRupees && amountPaidNum > 0 && (
                    <span>₹{(totalRupees - amountPaidNum).toLocaleString('en-IN')} due</span>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-gray-100" />

            {/* ── Section: Extra info ────────────────────────────────────── */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Extra Info</p>

              <div className="space-y-1.5">
                <Label>OTA Booking ID <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input
                  value={form.ota_booking_id}
                  onChange={(e) => set('ota_booking_id', e.target.value)}
                  placeholder="e.g. AIR-123456789"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Special Requests</Label>
                <Textarea
                  value={form.special_requests}
                  onChange={(e) => set('special_requests', e.target.value)}
                  placeholder="Dietary preferences, room preferences…"
                  rows={2}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Internal Notes <span className="text-gray-400 font-normal">(not visible to guest)</span></Label>
                <Textarea
                  value={form.internal_notes}
                  onChange={(e) => set('internal_notes', e.target.value)}
                  placeholder="Staff reminders…"
                  rows={2}
                />
              </div>
            </div>

          </form>
        </div>

        {/* ── Sticky footer ────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-gray-100 bg-white shrink-0 flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-booking-form"
            className="flex-1"
            disabled={submitting || availability.available === false}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating…</>
            ) : (
              'Create Booking'
            )}
          </Button>
        </div>

      </SheetContent>
    </Sheet>
  )
}
