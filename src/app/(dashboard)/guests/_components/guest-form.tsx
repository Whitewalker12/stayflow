'use client'

/**
 * Supabase Storage setup required:
 * 1. Go to Supabase Dashboard → Storage
 * 2. Create a new bucket named "guest-documents"
 * 3. Set bucket to private (not public)
 * 4. Add RLS policy: authenticated users can INSERT/SELECT their own files
 *    Policy name: "Owner access"
 *    INSERT: (auth.uid() IS NOT NULL)
 *    SELECT: (auth.uid() IS NOT NULL)
 * 5. Files are accessed via signed URLs generated server-side
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  guestSchema,
  type GuestFormData,
  ID_DOCUMENT_LABELS,
  ID_DOCUMENT_PLACEHOLDERS,
} from '@/lib/validations/guest'
import { INDIAN_STATES } from '@/lib/constants/india'
import type { Guest, IdDocumentType } from '@/types'

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
import { ArrowLeft, Upload, AlertTriangle, X } from 'lucide-react'
import Link from 'next/link'

const NATIONALITIES = [
  'Indian',
  'American',
  'British',
  'Australian',
  'Canadian',
  'Chinese',
  'French',
  'German',
  'Israeli',
  'Japanese',
  'Russian',
  'Other',
]

const INITIAL: GuestFormData = {
  full_name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  nationality: 'Indian',
  is_foreign_national: false,
  id_document_type: undefined,
  id_document_number: '',
  notes: '',
}

function fromGuest(guest: Guest): GuestFormData {
  return {
    full_name: guest.full_name,
    phone: guest.phone ?? '',
    email: guest.email ?? '',
    address: guest.address ?? '',
    city: guest.city ?? '',
    state: guest.state ?? '',
    pincode: guest.pincode ?? '',
    nationality: guest.nationality,
    is_foreign_national: guest.is_foreign_national,
    id_document_type: guest.id_document_type ?? undefined,
    id_document_number: guest.id_document_number ?? '',
    notes: guest.notes ?? '',
  }
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="text-xs text-red-600 mt-1">{msg}</p>
}

export function GuestForm({ guest, onSaved }: { guest?: Guest; onSaved?: () => void }) {
  const router = useRouter()
  const supabase = createClient()
  const isEdit = !!guest

  const [form, setForm] = useState<GuestFormData>(guest ? fromGuest(guest) : INITIAL)
  const [errors, setErrors] = useState<Partial<Record<keyof GuestFormData, string>>>({})
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    guest?.id_document_photo_url ?? null
  )
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  function set<K extends keyof GuestFormData>(field: K, value: GuestFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({
        ...prev,
        id_document_number: 'Photo must be under 5 MB',
      }))
      return
    }
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function uploadPhoto(guestId: string): Promise<string | null> {
    if (!photoFile) return guest?.id_document_photo_url ?? null
    setUploadingPhoto(true)
    const ext = photoFile.name.split('.').pop() ?? 'jpg'
    const path = `${guestId}/id-document.${ext}`
    const { error } = await supabase.storage
      .from('guest-documents')
      .upload(path, photoFile, { upsert: true })
    setUploadingPhoto(false)
    if (error) {
      setServerError(`Photo upload failed: ${error.message}`)
      return null
    }
    // Return storage path — use signed URL when displaying
    return path
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setServerError(null)

    const result = guestSchema.safeParse(form)
    if (!result.success) {
      const errs: Partial<Record<keyof GuestFormData, string>> = {}
      result.error.issues.forEach((issue) => {
        const k = issue.path[0] as keyof GuestFormData
        if (!errs[k]) errs[k] = issue.message
      })
      setErrors(errs)
      return
    }

    setLoading(true)

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setServerError('Not authenticated. Please log in again.')
      setLoading(false)
      return
    }

    const payload = {
      owner_id: userData.user.id,
      full_name: form.full_name,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      pincode: form.pincode || null,
      nationality: form.nationality,
      is_foreign_national: form.is_foreign_national,
      id_document_type: form.id_document_type ?? null,
      id_document_number: form.id_document_number
        ? form.id_document_number.trim().toUpperCase()
        : null,
      notes: form.notes || null,
    }

    if (isEdit && guest) {
      const photoPath = await uploadPhoto(guest.id)
      const { error } = await supabase
        .from('guests')
        .update({
          ...payload,
          id_document_photo_url: photoPath,
          updated_at: new Date().toISOString(),
        })
        .eq('id', guest.id)

      setLoading(false)
      if (error) {
        if (error.code === '23505') {
          setErrors((prev) => ({ ...prev, phone: 'A guest with this phone number already exists' }))
        } else {
          setServerError(error.message)
        }
        return
      }
      if (onSaved) { onSaved() } else { router.refresh() }
    } else {
      const { data, error } = await supabase
        .from('guests')
        .insert(payload)
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          setErrors((prev) => ({ ...prev, phone: 'A guest with this phone number already exists' }))
        } else {
          setServerError(error.message)
        }
        setLoading(false)
        return
      }

      // Upload photo now that we have the guest ID
      if (photoFile && data?.id) {
        const photoPath = await uploadPhoto(data.id)
        if (photoPath) {
          await supabase
            .from('guests')
            .update({ id_document_photo_url: photoPath })
            .eq('id', data.id)
        }
      }

      setLoading(false)
      router.push(`/guests/${data.id}`)
    }
  }

  const docLabel = form.id_document_type
    ? ID_DOCUMENT_LABELS[form.id_document_type]
    : 'document'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back */}
      <Link
        href={isEdit ? '#' : '/guests'}
        onClick={isEdit ? (e) => { e.preventDefault(); router.back() } : undefined}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="w-4 h-4" />
        {isEdit ? 'Back' : 'Guests'}
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          {isEdit ? 'Edit guest' : 'Add guest'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isEdit ? 'Update guest profile.' : 'Register a new guest.'}
        </p>
      </div>

      {/* Foreign national banner */}
      {form.is_foreign_national && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Form C required for foreign nationals</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Police reporting is mandatory. Submit Form C to the local police station within 24 hours of check-in.
            </p>
          </div>
        </div>
      )}

      {serverError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal info */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-medium text-gray-900">Personal info</h2>

          <div className="space-y-1.5">
            <Label htmlFor="full_name">Full name *</Label>
            <Input
              id="full_name"
              placeholder="e.g. Priya Sharma"
              value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
              aria-invalid={!!errors.full_name}
            />
            <FieldError msg={errors.full_name} />
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
                  value={form.phone ?? ''}
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
                placeholder="guest@example.com"
                value={form.email ?? ''}
                onChange={(e) => set('email', e.target.value)}
                aria-invalid={!!errors.email}
              />
              <FieldError msg={errors.email} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="nationality">Nationality</Label>
              <Select
                value={form.nationality}
                onValueChange={(v) => {
                  const nationality = v ?? 'Indian'
                  const isForeign = nationality !== 'Indian' && nationality.trim() !== ''
                  setForm((prev) => ({ ...prev, nationality, is_foreign_national: isForeign }))
                  if (errors.nationality) setErrors((prev) => ({ ...prev, nationality: undefined }))
                }}
              >
                <SelectTrigger id="nationality" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NATIONALITIES.map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Foreign national</Label>
              <div className="flex items-center gap-3 h-8">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.is_foreign_national}
                  onClick={() => set('is_foreign_national', !form.is_foreign_national)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                    form.is_foreign_national ? 'bg-amber-500' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      form.is_foreign_national ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-600">
                  {form.is_foreign_national ? 'Yes' : 'No'}
                </span>
                {form.is_foreign_national && (
                  <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-xs">
                    Form C required
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Address */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-medium text-gray-900">Address</h2>

          <div className="space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              placeholder="House / flat no., street, area"
              value={form.address ?? ''}
              onChange={(e) => set('address', e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="g-city">City</Label>
              <Input
                id="g-city"
                placeholder="e.g. Mumbai"
                value={form.city ?? ''}
                onChange={(e) => set('city', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-pincode">Pincode</Label>
              <Input
                id="g-pincode"
                type="text"
                inputMode="numeric"
                placeholder="400001"
                value={form.pincode ?? ''}
                onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                aria-invalid={!!errors.pincode}
              />
              <FieldError msg={errors.pincode} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="g-state">State</Label>
            <Select value={form.state} onValueChange={(v) => set('state', v ?? '')}>
              <SelectTrigger id="g-state" className="w-full">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {INDIAN_STATES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        {/* ID document */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-medium text-gray-900">ID document</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="doc-type">Document type</Label>
              <Select
                value={form.id_document_type ?? ''}
                onValueChange={(v) => {
                  set('id_document_type', (v || undefined) as IdDocumentType | undefined)
                  set('id_document_number', '')
                }}
              >
                <SelectTrigger id="doc-type" className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ID_DOCUMENT_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-number">
                {form.id_document_type ? ID_DOCUMENT_LABELS[form.id_document_type] : 'Document'} number
              </Label>
              <Input
                id="doc-number"
                placeholder={
                  form.id_document_type
                    ? ID_DOCUMENT_PLACEHOLDERS[form.id_document_type]
                    : 'Select a document type first'
                }
                value={form.id_document_number ?? ''}
                onChange={(e) => set('id_document_number', e.target.value)}
                disabled={!form.id_document_type}
                className="font-mono"
                aria-invalid={!!errors.id_document_number}
              />
              <FieldError msg={errors.id_document_number} />
            </div>
          </div>

          {/* Photo upload */}
          <div className="space-y-2">
            <Label>
              {docLabel.charAt(0).toUpperCase() + docLabel.slice(1)} photo
            </Label>
            {photoPreview ? (
              <div className="relative w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreview}
                  alt="ID document"
                  className="h-32 w-auto rounded-lg border border-gray-200 object-cover"
                />
                <button
                  type="button"
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-gray-900 text-white rounded-full flex items-center justify-center hover:bg-gray-700"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 h-28 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors">
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-500">Click to upload photo</span>
                <span className="text-xs text-gray-400">JPG, PNG, PDF — max 5 MB</span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="sr-only"
                  onChange={handlePhotoChange}
                />
              </label>
            )}
          </div>
        </section>

        {/* Notes */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-medium text-gray-900">Notes</h2>
          <Textarea
            placeholder="Dietary preferences, special requests, anything to remember…"
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
          />
          <FieldError msg={errors.notes} />
        </section>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading || uploadingPhoto}>
            {loading || uploadingPhoto
              ? isEdit ? 'Saving…' : 'Adding guest…'
              : isEdit ? 'Save changes' : 'Add guest →'}
          </Button>
        </div>
      </form>
    </div>
  )
}
