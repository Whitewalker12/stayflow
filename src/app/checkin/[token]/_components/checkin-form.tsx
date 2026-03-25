'use client'

import { useState, useRef, useCallback } from 'react'
import { CheckCircle2, Camera, Upload, X, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react'
import { checkinSchema, ID_TYPE_LABELS, ID_TYPE_PLACEHOLDERS } from '@/lib/validations/checkin'
import type { IdDocumentType } from '@/types'

// ── Types ────────────────────────────────────────────────────────────────────

interface PropertyInfo {
  name: string
  address: string
  phone: string | null
  ownerPhone: string | null
}

interface Prefill {
  full_name: string
  phone: string
  email: string
  num_adults: number
  num_children: number
  special_requests: string
  id_type?: IdDocumentType
  id_number: string
  address: string
  city: string
  state: string
  pincode: string
}

interface Props {
  token: string
  bookingId: string
  property: PropertyInfo
  room: { name: string }
  checkInDate: string    // YYYY-MM-DD
  checkOutDate: string   // YYYY-MM-DD
  prefill: Prefill
  guestId: string | null
}

// ── Image compression ─────────────────────────────────────────────────────────

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const canvas = document.createElement('canvas')
      const MAX_DIM = 1600
      let { width, height } = img
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = Math.min(MAX_DIM / width, MAX_DIM / height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Canvas toBlob failed'))
        },
        'image/jpeg',
        0.80,
      )
    }
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = objectUrl
  })
}

// ── Date formatter ────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>Step {step} of {total}</span>
        <span>{Math.round((step / total) * 100)}%</span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gray-900 rounded-full transition-all duration-300"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
    </div>
  )
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null
  return <p className="text-xs text-red-600 mt-1">{error}</p>
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

const inputCls =
  'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-50'

const selectCls =
  'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent'

// ── Main component ────────────────────────────────────────────────────────────

export function CheckinForm({
  token,
  property,
  room,
  checkInDate,
  checkOutDate,
  prefill,
  guestId,
}: Props) {
  const TOTAL_STEPS = 3

  // Form values
  const [values, setValues] = useState({
    full_name: prefill.full_name,
    phone: prefill.phone,
    email: prefill.email,
    id_type: prefill.id_type ?? '',
    id_number: prefill.id_number,
    address: prefill.address,
    city: prefill.city,
    state: prefill.state,
    pincode: prefill.pincode,
    num_adults: String(prefill.num_adults || 1),
    num_children: String(prefill.num_children || 0),
    expected_arrival_time: '',
    special_requests: prefill.special_requests,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [step, setStep] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  // Photo state
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function set(field: string, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => { const e = { ...prev }; delete e[field]; return e })
  }

  // ── Validation per step ───────────────────────────────────────────────────

  function validateStep(s: number): boolean {
    const newErrors: Record<string, string> = {}

    if (s === 1) {
      if (!values.full_name.trim() || values.full_name.trim().length < 2) {
        newErrors.full_name = 'Full name must be at least 2 characters'
      }
      if (!/^[6-9]\d{9}$/.test(values.phone.trim())) {
        newErrors.phone = 'Enter a valid 10-digit mobile number'
      }
      if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
        newErrors.email = 'Enter a valid email address'
      }
    }

    if (s === 2) {
      if (!values.id_type) {
        newErrors.id_type = 'Please select an ID type'
      }
      if (!values.id_number.trim()) {
        newErrors.id_number = 'ID number is required'
      } else {
        const num = values.id_number.trim().toUpperCase()
        if (values.id_type === 'aadhaar' && !/^\d{12}$/.test(num.replace(/\s/g, ''))) {
          newErrors.id_number = 'Aadhaar must be exactly 12 digits'
        } else if (values.id_type === 'passport' && !/^[A-Z][0-9]{7}$/.test(num)) {
          newErrors.id_number = 'Passport: 1 letter + 7 digits (e.g. A1234567)'
        } else if (values.id_type === 'voter_id' && !/^[A-Z]{3}\d{7}$/.test(num)) {
          newErrors.id_number = 'Voter ID: 3 letters + 7 digits (e.g. ABC1234567)'
        } else if (values.id_type === 'driving_license' && num.length < 8) {
          newErrors.id_number = 'Enter a valid driving licence number'
        }
      }
    }

    if (s === 3) {
      const adults = parseInt(values.num_adults)
      if (isNaN(adults) || adults < 1) {
        newErrors.num_adults = 'At least 1 adult required'
      }
      if (values.pincode && !/^\d{6}$/.test(values.pincode)) {
        newErrors.pincode = 'Enter a valid 6-digit pincode'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleNext() {
    if (validateStep(step)) setStep((s) => s + 1)
  }

  function handleBack() {
    setErrors({})
    setStep((s) => s - 1)
  }

  // ── Photo handling ────────────────────────────────────────────────────────

  const handlePhotoChange = useCallback(async (file: File) => {
    // Show original preview immediately
    const previewUrl = URL.createObjectURL(file)
    setPhotoPreview(previewUrl)

    try {
      const compressed = await compressImage(file)
      // If > 1MB after compression, try harder at lower quality
      const finalFile = new File(
        [compressed],
        file.name.replace(/\.[^.]+$/, '.jpg'),
        { type: 'image/jpeg' },
      )
      setPhotoFile(finalFile)
    } catch {
      // Fall back to original if compression fails
      setPhotoFile(file)
    }
  }, [])

  function clearPhoto() {
    setPhotoFile(null)
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!validateStep(3)) return

    // Final full validation
    const parsed = checkinSchema.safeParse({
      ...values,
      id_type: values.id_type,
      num_adults: values.num_adults,
      num_children: values.num_children,
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0] as string
        if (!fieldErrors[key]) fieldErrors[key] = issue.message
      })
      setErrors(fieldErrors)
      return
    }

    setSubmitting(true)
    setServerError(null)

    try {
      const formData = new FormData()
      formData.append('full_name', values.full_name.trim())
      formData.append('phone', values.phone.trim())
      formData.append('email', values.email.trim())
      formData.append('id_type', values.id_type)
      formData.append('id_number', values.id_number.trim().toUpperCase())
      formData.append('address', values.address.trim())
      formData.append('city', values.city.trim())
      formData.append('state', values.state.trim())
      formData.append('pincode', values.pincode.trim())
      formData.append('num_adults', values.num_adults)
      formData.append('num_children', values.num_children)
      formData.append('expected_arrival_time', values.expected_arrival_time)
      formData.append('special_requests', values.special_requests.trim())
      if (guestId) formData.append('guest_id', guestId)
      if (photoFile) formData.append('id_photo', photoFile)

      const res = await fetch(`/api/checkin/${token}`, {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        setSubmitted(true)
      } else {
        const json = await res.json().catch(() => ({}))
        setServerError(
          typeof json.error === 'string' ? json.error : 'Submission failed. Please try again.',
        )
      }
    } catch {
      setServerError('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Thank-you screen ──────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full space-y-6 text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">You're all set!</h1>
            <p className="text-gray-600">
              Your check-in details have been submitted to {property.name}.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5 text-left space-y-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Property</p>
              <p className="text-gray-900 font-medium mt-0.5">{property.name}</p>
              {property.address && (
                <p className="text-sm text-gray-500 mt-0.5">{property.address}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Check-in</p>
                <p className="text-sm text-gray-900 font-medium mt-0.5">{fmtDate(checkInDate)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Room</p>
                <p className="text-sm text-gray-900 font-medium mt-0.5">{room.name}</p>
              </div>
            </div>
            {property.phone && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Contact</p>
                <a
                  href={`tel:${property.phone}`}
                  className="text-sm text-blue-600 font-medium mt-0.5 block"
                >
                  {property.phone}
                </a>
              </div>
            )}
          </div>
          <p className="text-sm text-gray-500">See you on {fmtDate(checkInDate)}! 🎉</p>
        </div>
      </div>
    )
  }

  // ── Form layout ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-xs">S</span>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{property.name}</p>
              <p className="text-xs text-gray-500">
                {room.name} · {fmtDate(checkInDate)} → {fmtDate(checkOutDate)}
              </p>
            </div>
          </div>
          <ProgressBar step={step} total={TOTAL_STEPS} />
        </div>
      </div>

      {/* Form body */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* ── STEP 1: Personal info ── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Personal Details</h2>
              <p className="text-sm text-gray-500 mt-1">We need a few details before your arrival.</p>
            </div>

            <div>
              <Label required>Full Name</Label>
              <input
                type="text"
                className={inputCls}
                placeholder="As on your ID"
                value={values.full_name}
                onChange={(e) => set('full_name', e.target.value)}
                autoComplete="name"
                autoFocus
              />
              <FieldError error={errors.full_name} />
            </div>

            <div>
              <Label required>Mobile Number</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-base select-none">
                  +91
                </span>
                <input
                  type="tel"
                  className={`${inputCls} pl-14`}
                  placeholder="9876543210"
                  maxLength={10}
                  value={values.phone}
                  onChange={(e) => set('phone', e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  autoComplete="tel"
                />
              </div>
              <FieldError error={errors.phone} />
            </div>

            <div>
              <Label>Email Address</Label>
              <input
                type="email"
                className={inputCls}
                placeholder="you@example.com (optional)"
                value={values.email}
                onChange={(e) => set('email', e.target.value)}
                autoComplete="email"
              />
              <FieldError error={errors.email} />
            </div>
          </div>
        )}

        {/* ── STEP 2: ID Verification ── */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">ID Verification</h2>
              <p className="text-sm text-gray-500 mt-1">Required for all guests per government regulations.</p>
            </div>

            <div>
              <Label required>ID Type</Label>
              <select
                className={selectCls}
                value={values.id_type}
                onChange={(e) => {
                  set('id_type', e.target.value)
                  set('id_number', '')
                }}
              >
                <option value="">Select ID type</option>
                {Object.entries(ID_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <FieldError error={errors.id_type} />
            </div>

            {values.id_type && (
              <div>
                <Label required>{ID_TYPE_LABELS[values.id_type]} Number</Label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder={ID_TYPE_PLACEHOLDERS[values.id_type]}
                  value={values.id_number}
                  onChange={(e) => set('id_number', e.target.value)}
                  inputMode={values.id_type === 'aadhaar' ? 'numeric' : 'text'}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <FieldError error={errors.id_number} />
              </div>
            )}

            {/* Photo upload */}
            <div>
              <Label>ID Photo</Label>
              <p className="text-xs text-gray-500 mb-3">
                Take a clear photo of your ID document (front side).
              </p>

              {photoPreview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreview}
                    alt="ID preview"
                    className="w-full max-h-52 object-cover rounded-2xl border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={clearPhoto}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {/* Camera — opens camera directly on mobile */}
                  <button
                    type="button"
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.setAttribute('capture', 'environment')
                        fileInputRef.current.click()
                      }
                    }}
                    className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 py-6 text-sm text-gray-600 hover:border-gray-400 hover:bg-gray-50 active:bg-gray-100"
                  >
                    <Camera className="w-6 h-6 text-gray-400" />
                    <span>Take Photo</span>
                  </button>

                  {/* File picker */}
                  <button
                    type="button"
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.removeAttribute('capture')
                        fileInputRef.current.click()
                      }
                    }}
                    className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 py-6 text-sm text-gray-600 hover:border-gray-400 hover:bg-gray-50 active:bg-gray-100"
                  >
                    <Upload className="w-6 h-6 text-gray-400" />
                    <span>Upload File</span>
                  </button>
                </div>
              )}

              {/* Hidden input used by both buttons */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handlePhotoChange(file)
                }}
              />
            </div>
          </div>
        )}

        {/* ── STEP 3: Stay Details ── */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Stay Details</h2>
              <p className="text-sm text-gray-500 mt-1">A few more details to prepare for your arrival.</p>
            </div>

            {/* Address */}
            <div>
              <Label>Home Address</Label>
              <input
                type="text"
                className={inputCls}
                placeholder="Street / Locality"
                value={values.address}
                onChange={(e) => set('address', e.target.value)}
                autoComplete="street-address"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>City</Label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Mumbai"
                  value={values.city}
                  onChange={(e) => set('city', e.target.value)}
                  autoComplete="address-level2"
                />
              </div>
              <div>
                <Label>State</Label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Maharashtra"
                  value={values.state}
                  onChange={(e) => set('state', e.target.value)}
                  autoComplete="address-level1"
                />
              </div>
            </div>

            <div>
              <Label>Pincode</Label>
              <input
                type="text"
                className={inputCls}
                placeholder="400001"
                maxLength={6}
                value={values.pincode}
                onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                autoComplete="postal-code"
              />
              <FieldError error={errors.pincode} />
            </div>

            {/* Guest count */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label required>Adults</Label>
                <input
                  type="number"
                  className={inputCls}
                  min={1}
                  max={20}
                  value={values.num_adults}
                  onChange={(e) => set('num_adults', e.target.value)}
                  inputMode="numeric"
                />
                <FieldError error={errors.num_adults} />
              </div>
              <div>
                <Label>Children</Label>
                <input
                  type="number"
                  className={inputCls}
                  min={0}
                  max={20}
                  value={values.num_children}
                  onChange={(e) => set('num_children', e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>

            {/* Arrival time */}
            <div>
              <Label>Expected Arrival Time</Label>
              <input
                type="time"
                className={inputCls}
                value={values.expected_arrival_time}
                onChange={(e) => set('expected_arrival_time', e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Helps the property prepare for your arrival.
              </p>
            </div>

            {/* Special requests */}
            <div>
              <Label>Special Requests</Label>
              <textarea
                className={`${inputCls} resize-none`}
                rows={3}
                placeholder="Early check-in, late checkout, dietary requirements…"
                value={values.special_requests}
                onChange={(e) => set('special_requests', e.target.value)}
              />
            </div>

            {serverError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {serverError}
              </div>
            )}
          </div>
        )}

        {/* ── Navigation buttons ── */}
        <div className="flex gap-3 pt-2 pb-8">
          {step > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-gray-300 bg-white py-4 text-base font-medium text-gray-700 active:bg-gray-50"
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </button>
          )}

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gray-900 py-4 text-base font-medium text-white active:bg-gray-800"
            >
              Next
              <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gray-900 py-4 text-base font-medium text-white active:bg-gray-800 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  Complete Check-in
                  <CheckCircle2 className="w-5 h-5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
