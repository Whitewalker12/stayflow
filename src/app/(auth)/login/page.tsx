'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'phone' | 'email'
type Step = 'credentials' | 'otp'

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`
  if (digits.length === 10) return `+91${digits}`
  return `+${digits}`
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') ?? '/dashboard'
  const supabase = createClient()

  const [mode, setMode] = useState<Mode>('email')
  const [step, setStep] = useState<Step>('credentials')

  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSendOtp() {
    setError(null)
    const formatted = formatPhone(phone)
    if (!/^\+91\d{10}$/.test(formatted)) {
      setError('Enter a valid 10-digit Indian mobile number')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setStep('otp')
  }

  async function handleVerifyOtp() {
    setError(null)
    if (otp.length !== 6) {
      setError('Enter the 6-digit OTP')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      phone: formatPhone(phone),
      token: otp,
      type: 'sms',
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    router.push(redirectTo)
    router.refresh()
  }

  async function handleEmailLogin() {
    setError(null)
    if (!email || !password) {
      setError('Enter your email and password')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    router.push(redirectTo)
    router.refresh()
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        {step === 'otp' ? 'Enter OTP' : 'Sign in'}
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        {step === 'otp'
          ? `OTP sent to +91 ${phone}`
          : mode === 'phone'
          ? "We'll send an OTP to your phone"
          : 'Sign in with your email and password'}
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Phone OTP — Step 1 */}
      {mode === 'phone' && step === 'credentials' && (
        <div className="space-y-4">
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
                autoFocus
              />
            </div>
          </div>
          <Button
            className="w-full"
            onClick={handleSendOtp}
            disabled={loading || phone.length !== 10}
          >
            {loading ? 'Sending…' : 'Send OTP'}
          </Button>
        </div>
      )}

      {/* Phone OTP — Step 2 */}
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
            {loading ? 'Verifying…' : 'Verify OTP'}
          </Button>
          <button
            type="button"
            className="w-full text-sm text-gray-500 hover:text-gray-700"
            onClick={() => {
              setStep('credentials')
              setOtp('')
              setError(null)
            }}
          >
            ← Change number
          </button>
        </div>
      )}

      {/* Email + Password */}
      {mode === 'email' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleEmailLogin()}
            />
          </div>
          <Button className="w-full" onClick={handleEmailLogin} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      )}

      {/* Mode toggle */}
      <div className="mt-5 pt-4 border-t border-gray-100 text-center">
        {step !== 'otp' && (
          <button
            type="button"
            className="text-sm text-gray-500 hover:text-gray-800"
            onClick={() => {
              setMode(mode === 'phone' ? 'email' : 'phone')
              setError(null)
            }}
          >
            {mode === 'email' ? '← Use phone instead' : 'Use email instead →'}
          </button>
        )}
      </div>

      <p className="mt-4 text-center text-sm text-gray-500">
        No account?{' '}
        <Link href="/signup" className="font-medium text-gray-900 hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  )
}

export const metadata = {
  title: 'Sign In',
  description: 'Sign in to your HomeStayPMS account to manage bookings, guests and invoices.',
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
