'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'phone' | 'email'
type Step = 'details' | 'otp' | 'verify_email'

function formatPhone(digits: string): string {
  return `+91${digits}`
}

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<Mode>('phone')
  const [step, setStep] = useState<Step>('details')

  // Shared
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Phone OTP fields
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')

  // Email+password fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // ── Phone OTP flow ─────────────────────────────────────────────────────────

  async function handleSendOtp() {
    setError(null)
    if (!fullName.trim()) { setError('Enter your full name'); return }
    if (phone.length !== 10) { setError('Enter a valid 10-digit mobile number'); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      phone: formatPhone(phone),
      options: { data: { full_name: fullName.trim() } },
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setStep('otp')
  }

  async function handleVerifyOtp() {
    setError(null)
    if (otp.length !== 6) { setError('Enter the 6-digit OTP'); return }
    setLoading(true)
    const { data, error } = await supabase.auth.verifyOtp({
      phone: formatPhone(phone),
      token: otp,
      type: 'sms',
    })
    if (error) { setLoading(false); setError(error.message); return }
    if (data.user) {
      await supabase.auth.updateUser({ data: { full_name: fullName.trim() } })
    }
    setLoading(false)
    router.push('/properties/new')
    router.refresh()
  }

  // ── Email + password flow ──────────────────────────────────────────────────

  async function handleEmailSignup() {
    setError(null)
    if (!fullName.trim()) { setError('Enter your full name'); return }
    if (!email.trim()) { setError('Enter your email address'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirmPassword) { setError('Passwords do not match'); return }

    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    })
    setLoading(false)

    if (error) { setError(error.message); return }

    // If email confirmation is disabled in Supabase, user is immediately signed in
    if (data.session) {
      router.push('/properties/new')
      router.refresh()
      return
    }

    // Otherwise show "check your email" message
    setStep('verify_email')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  // Email confirmation sent screen
  if (step === 'verify_email') {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Check your email</h2>
        <p className="text-sm text-gray-500 mb-6">
          We sent a confirmation link to <span className="font-medium text-gray-800">{email}</span>.
          Click it to activate your account.
        </p>
        <Link href="/login" className="text-sm text-blue-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        {step === 'otp' ? 'Verify your number' : 'Create account'}
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        {step === 'otp'
          ? `OTP sent to +91 ${phone}`
          : mode === 'phone'
          ? "We'll send an OTP to your phone"
          : 'Sign up with your email and password'}
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Phone OTP — Step 1 ─────────────────────────────────────────────── */}
      {mode === 'phone' && step === 'details' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Nandini Sharma"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Mobile number</Label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-sm text-gray-500 select-none">
                +91
              </span>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                maxLength={10}
                className="rounded-l-none"
              />
            </div>
          </div>
          <Button
            className="w-full"
            onClick={handleSendOtp}
            disabled={loading || !fullName.trim() || phone.length !== 10}
          >
            {loading ? 'Sending OTP…' : 'Send OTP'}
          </Button>
        </div>
      )}

      {/* ── Phone OTP — Step 2 ─────────────────────────────────────────────── */}
      {mode === 'phone' && step === 'otp' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="otp">6-digit OTP</Label>
            <Input
              id="otp"
              type="tel"
              inputMode="numeric"
              placeholder="••••••"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              className="tracking-[0.5em] text-center text-lg"
              autoFocus
            />
          </div>
          <Button
            className="w-full"
            onClick={handleVerifyOtp}
            disabled={loading || otp.length !== 6}
          >
            {loading ? 'Verifying…' : 'Verify & continue'}
          </Button>
          <button
            type="button"
            className="w-full text-sm text-gray-500 hover:text-gray-700"
            onClick={() => { setStep('details'); setOtp(''); setError(null) }}
          >
            ← Change number
          </button>
        </div>
      )}

      {/* ── Email + Password ───────────────────────────────────────────────── */}
      {mode === 'email' && step === 'details' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name-email">Full name</Label>
            <Input
              id="name-email"
              type="text"
              placeholder="Nandini Sharma"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleEmailSignup()}
            />
          </div>
          <Button
            className="w-full"
            onClick={handleEmailSignup}
            disabled={loading || !fullName.trim() || !email.trim() || password.length < 8}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </div>
      )}

      {/* ── Mode toggle ────────────────────────────────────────────────────── */}
      {step === 'details' && (
        <div className="mt-5 pt-4 border-t border-gray-100 text-center">
          <button
            type="button"
            className="text-sm text-gray-500 hover:text-gray-800"
            onClick={() => { setMode(mode === 'phone' ? 'email' : 'phone'); setError(null) }}
          >
            {mode === 'phone' ? 'Use email instead →' : '← Use phone instead'}
          </button>
        </div>
      )}

      <p className="mt-4 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-gray-900 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
