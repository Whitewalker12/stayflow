'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertTriangle, Loader2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import {
  quickBookingSchema,
  SOURCE_LABELS,
  BOOKING_SOURCES,
  type QuickBookingFormData,
} from '@/lib/validations/booking'
import { rupeesToPaise, paiseToRupees } from '@/lib/utils/currency'
import { differenceInDays, parseISO } from 'date-fns'
import type { Property, Room } from '@/types'

interface QuickBookingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  properties: Property[]
  activePropertyId: string | null
  onCreated: () => void
}

type QuickForm = {
  room_id: string
  check_in_date: string
  check_out_date: string
  guest_name: string
  guest_phone: string
  rate_per_night: string
  source: string
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
function tomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export function QuickBookingModal({
  open,
  onOpenChange,
  properties,
  activePropertyId,
  onCreated,
}: QuickBookingModalProps) {
  const supabase = createClient()
  const [rooms, setRooms] = useState<Room[]>([])
  const [form, setForm] = useState<QuickForm>({
    room_id: '',
    check_in_date: todayStr(),
    check_out_date: tomorrowStr(),
    guest_name: '',
    guest_phone: '',
    rate_per_night: '',
    source: 'direct',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof QuickBookingFormData | 'server', string>>>({})
  const [submitting, setSubmitting] = useState(false)

  // Fetch rooms for active property
  useEffect(() => {
    if (!open) return
    const propId = activePropertyId ?? properties[0]?.id
    if (!propId) return

    supabase
      .from('rooms')
      .select('*')
      .eq('property_id', propId)
      .is('deleted_at', null)
      .order('name')
      .then(({ data }) => {
        const r = (data ?? []) as Room[]
        setRooms(r)
      })
  }, [open, activePropertyId, properties]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill rate when room selected
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

  // Reset on open
  useEffect(() => {
    if (open) {
      setForm({
        room_id: '',
        check_in_date: todayStr(),
        check_out_date: tomorrowStr(),
        guest_name: '',
        guest_phone: '',
        rate_per_night: '',
        source: 'direct',
      })
      setErrors({})
    }
  }, [open])

  function set<K extends keyof QuickForm>(key: K, value: QuickForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const nights =
    form.check_in_date && form.check_out_date && form.check_out_date > form.check_in_date
      ? differenceInDays(parseISO(form.check_out_date), parseISO(form.check_in_date))
      : 0
  const rateNum = parseFloat(form.rate_per_night) || 0

  async function handleBook(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    const parsed = quickBookingSchema.safeParse({
      room_id: form.room_id,
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
      guest_name: form.guest_name,
      guest_phone: form.guest_phone || undefined,
      rate_per_night: rateNum,
      source: form.source,
    })

    if (!parsed.success) {
      const fieldErrors: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof QuickBookingFormData
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setSubmitting(true)

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setErrors({ server: 'Not authenticated.' })
      setSubmitting(false)
      return
    }

    // ── Find or create guest ─────────────────────────────────────────────
    let guestId: string

    if (form.guest_phone) {
      // Look for existing guest by phone
      const { data: existing } = await supabase
        .from('guests')
        .select('id')
        .eq('phone', form.guest_phone)
        .is('deleted_at', null)
        .limit(1)
        .single()

      if (existing) {
        guestId = existing.id
      } else {
        // Create new guest
        const { data: newGuest, error: guestError } = await supabase
          .from('guests')
          .insert({
            owner_id: userData.user.id,
            full_name: form.guest_name,
            phone: form.guest_phone,
            nationality: 'Indian',
            is_foreign_national: false,
          })
          .select('id')
          .single()

        if (guestError || !newGuest) {
          setErrors({ server: guestError?.message ?? 'Failed to create guest' })
          setSubmitting(false)
          return
        }
        guestId = newGuest.id
      }
    } else {
      // No phone — create new guest with just name
      const { data: newGuest, error: guestError } = await supabase
        .from('guests')
        .insert({
          owner_id: userData.user.id,
          full_name: form.guest_name,
          nationality: 'Indian',
          is_foreign_national: false,
        })
        .select('id')
        .single()

      if (guestError || !newGuest) {
        setErrors({ server: guestError?.message ?? 'Failed to create guest' })
        setSubmitting(false)
        return
      }
      guestId = newGuest.id
    }

    // ── Resolve property from room ────────────────────────────────────────
    const selectedRoom = rooms.find((r) => r.id === form.room_id)
    const propId = selectedRoom?.property_id ?? activePropertyId ?? properties[0]?.id

    if (!propId) {
      setErrors({ server: 'Could not determine property.' })
      setSubmitting(false)
      return
    }

    // ── Create booking ────────────────────────────────────────────────────
    const ratePaise = rupeesToPaise(rateNum)
    const totalPaise = ratePaise * nights

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        property_id: propId,
        room_id: form.room_id,
        primary_guest_id: guestId,
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        status: 'confirmed',
        source: form.source,
        rate_per_night_paise: ratePaise,
        total_amount_paise: totalPaise,
        num_adults: 1,
        num_children: 0,
        payment_status: 'pending',
        payment_method: null,
        special_requests: null,
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

    // ── Link guest ────────────────────────────────────────────────────────
    await supabase.from('booking_guests').insert({
      booking_id: booking.id,
      guest_id: guestId,
      is_primary: true,
    })

    // ── Notify owner via WhatsApp (fire-and-forget) ───────────────────────
    fetch('/api/bookings/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: booking.id, event: 'created' }),
    }).catch(() => {})  // never block the UI on notification failure

    setSubmitting(false)
    toast.success('Booking created')
    onCreated()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Quick Booking
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleBook} className="space-y-4">
          {errors.server && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {errors.server}
            </div>
          )}

          {/* Room */}
          <div className="space-y-1.5">
            <Label>Room <span className="text-red-500">*</span></Label>
            <Select value={form.room_id} onValueChange={(v) => { if (v) set('room_id', v) }}>
              <SelectTrigger className={errors.room_id ? 'border-red-300' : ''}>
                <SelectValue placeholder="Select room" />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((r) => (
                  <SelectItem key={r.id} value={r.id} label={r.name}>
                    <span className="flex items-center justify-between w-full gap-4">
                      <span>{r.name}</span>
                      <span className="text-gray-400 text-xs">
                        ₹{paiseToRupees(r.base_rate_paise).toLocaleString('en-IN')}/night
                      </span>
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
              <Label>Check-in</Label>
              <Input
                type="date"
                value={form.check_in_date}
                onChange={(e) => set('check_in_date', e.target.value)}
                className={errors.check_in_date ? 'border-red-300' : ''}
              />
              {errors.check_in_date && (
                <p className="text-xs text-red-500">{errors.check_in_date}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Check-out</Label>
              <Input
                type="date"
                value={form.check_out_date}
                min={form.check_in_date}
                onChange={(e) => set('check_out_date', e.target.value)}
                className={errors.check_out_date ? 'border-red-300' : ''}
              />
              {errors.check_out_date && (
                <p className="text-xs text-red-500">{errors.check_out_date}</p>
              )}
            </div>
          </div>
          {nights > 0 && (
            <p className="text-xs text-gray-500 -mt-2">
              {nights} night{nights !== 1 ? 's' : ''}
              {rateNum > 0 && ` · Total ₹${(rateNum * nights).toLocaleString('en-IN')}`}
            </p>
          )}

          {/* Guest name + phone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Guest Name <span className="text-red-500">*</span></Label>
              <Input
                value={form.guest_name}
                onChange={(e) => set('guest_name', e.target.value)}
                placeholder="Full name"
                className={errors.guest_name ? 'border-red-300' : ''}
              />
              {errors.guest_name && (
                <p className="text-xs text-red-500">{errors.guest_name}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                type="tel"
                inputMode="numeric"
                value={form.guest_phone}
                onChange={(e) => set('guest_phone', e.target.value)}
                placeholder="10-digit mobile"
                className={errors.guest_phone ? 'border-red-300' : ''}
              />
              {errors.guest_phone && (
                <p className="text-xs text-red-500">{errors.guest_phone}</p>
              )}
            </div>
          </div>

          {/* Rate + Source */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Rate/night (₹) <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                min={1}
                value={form.rate_per_night}
                onChange={(e) => set('rate_per_night', e.target.value)}
                placeholder="e.g. 2500"
                className={errors.rate_per_night ? 'border-red-300' : ''}
              />
              {errors.rate_per_night && (
                <p className="text-xs text-red-500">{errors.rate_per_night}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(v) => { if (v) set('source', v) }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOOKING_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SOURCE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full gap-2"
            disabled={submitting}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Booking…</>
            ) : (
              <><Zap className="w-4 h-4" />Book Now</>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
