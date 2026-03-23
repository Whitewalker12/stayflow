'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePropertyStore } from '@/stores/property-store'
import { propertySchema, type PropertyFormData } from '@/lib/validations/property'
import { INDIAN_STATES } from '@/lib/constants/india'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { TimeSelect } from '@/components/shared/time-select'

const INITIAL: PropertyFormData = {
  name: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  pincode: '',
  phone: '',
  email: '',
  gstin: '',
  default_checkin_time: '14:00',
  default_checkout_time: '11:00',
  cancellation_policy: '',
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="text-xs text-red-600 mt-1">{msg}</p>
}

export default function NewPropertyPage() {
  const router = useRouter()
  const supabase = createClient()
  const fetchProperties = usePropertyStore((s) => s.fetchProperties)
  const setActiveProperty = usePropertyStore((s) => s.setActiveProperty)

  const [form, setForm] = useState<PropertyFormData>(INITIAL)
  const [errors, setErrors] = useState<Partial<Record<keyof PropertyFormData, string>>>({})
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  function set(field: keyof PropertyFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    // Clear field error on change
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setServerError(null)

    // Validate
    const result = propertySchema.safeParse(form)
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof PropertyFormData, string>> = {}
      result.error.issues.forEach((issue) => {
        const key = issue.path[0] as keyof PropertyFormData
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      })
      setErrors(fieldErrors)
      return
    }

    setLoading(true)

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setServerError('Not authenticated. Please log in again.')
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('properties')
      .insert({
        owner_id: userData.user.id,
        name: form.name,
        address_line1: form.address_line1,
        address_line2: form.address_line2 || null,
        city: form.city,
        pincode: form.pincode,
        state: form.state,
        phone: form.phone || null,
        email: form.email || null,
        gstin: form.gstin || null,
        default_checkin_time: form.default_checkin_time,
        default_checkout_time: form.default_checkout_time,
        cancellation_policy: form.cancellation_policy || null,
      })
      .select()
      .single()

    if (error) {
      // 23505 = unique constraint violation (duplicate property name)
      if (error.code === '23505') {
        setErrors({ name: 'A property with this name already exists' })
      } else {
        setServerError(error.message)
      }
      setLoading(false)
      return
    }

    // Refresh store so sidebar switcher updates
    await fetchProperties(supabase)
    if (data?.id) setActiveProperty(data.id)

    router.push(`/properties/${data.id}?tab=rooms`)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back */}
      <Link
        href="/properties"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="w-4 h-4" />
        Properties
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Add property</h1>
        <p className="text-sm text-gray-500 mt-0.5">Set up a new property and its details.</p>
      </div>

      {serverError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-medium text-gray-900">Basic info</h2>

          <div className="space-y-1.5">
            <Label htmlFor="name">Property name *</Label>
            <Input
              id="name"
              placeholder="e.g. Mountain View Homestay"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              aria-invalid={!!errors.name}
            />
            <FieldError msg={errors.name} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-sm text-gray-500 select-none">
                  +91
                </span>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="98765 43210"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="rounded-l-none"
                  aria-invalid={!!errors.phone}
                />
              </div>
              <FieldError msg={errors.phone} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="property@example.com"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                aria-invalid={!!errors.email}
              />
              <FieldError msg={errors.email} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gstin">GSTIN (optional)</Label>
            <Input
              id="gstin"
              placeholder="27AABCU9603R1ZX"
              value={form.gstin}
              onChange={(e) => set('gstin', e.target.value.toUpperCase().slice(0, 15))}
              className="font-mono tracking-wide"
              aria-invalid={!!errors.gstin}
            />
            <FieldError msg={errors.gstin} />
          </div>
        </section>

        {/* Address */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-medium text-gray-900">Address</h2>

          <div className="space-y-1.5">
            <Label htmlFor="address_line1">Address line 1 *</Label>
            <Input
              id="address_line1"
              placeholder="House / flat no., street name"
              value={form.address_line1}
              onChange={(e) => set('address_line1', e.target.value)}
              aria-invalid={!!errors.address_line1}
            />
            <FieldError msg={errors.address_line1} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address_line2">Address line 2</Label>
            <Input
              id="address_line2"
              placeholder="Landmark, area (optional)"
              value={form.address_line2}
              onChange={(e) => set('address_line2', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                placeholder="e.g. Manali"
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                aria-invalid={!!errors.city}
              />
              <FieldError msg={errors.city} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pincode">Pincode *</Label>
              <Input
                id="pincode"
                type="text"
                inputMode="numeric"
                placeholder="175131"
                value={form.pincode}
                onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                aria-invalid={!!errors.pincode}
              />
              <FieldError msg={errors.pincode} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="state">State *</Label>
            <Select value={form.state} onValueChange={(v) => set('state', v ?? '')}>
              <SelectTrigger id="state" className="w-full" aria-invalid={!!errors.state}>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {INDIAN_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError msg={errors.state} />
          </div>
        </section>

        {/* Check-in / check-out */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-medium text-gray-900">Check-in &amp; check-out</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="default_checkin_time">Default check-in time</Label>
              <TimeSelect
                id="default_checkin_time"
                value={form.default_checkin_time}
                onChange={(v) => set('default_checkin_time', v)}
              />
              <FieldError msg={errors.default_checkin_time} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="default_checkout_time">Default check-out time</Label>
              <TimeSelect
                id="default_checkout_time"
                value={form.default_checkout_time}
                onChange={(v) => set('default_checkout_time', v)}
              />
              <FieldError msg={errors.default_checkout_time} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cancellation_policy">Cancellation policy</Label>
            <Textarea
              id="cancellation_policy"
              placeholder="e.g. Full refund if cancelled 48 hours before check-in."
              value={form.cancellation_policy}
              onChange={(e) => set('cancellation_policy', e.target.value)}
              rows={3}
            />
          </div>
        </section>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <Link href="/properties">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create property →'}
          </Button>
        </div>
      </form>
    </div>
  )
}
