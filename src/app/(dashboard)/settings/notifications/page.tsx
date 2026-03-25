'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BellRing,
  Sunrise,
  Sunset,
  CreditCard,
  Loader2,
  CheckCircle2,
  XCircle,
  Info,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TriggerType = 'daily-arrivals' | 'daily-departures' | 'payment-reminders' | 'sync-ical'

type TriggerState = {
  loading: boolean
  result: { ok: boolean; message: string } | null
}

const INITIAL_STATE: TriggerState = { loading: false, result: null }

// ---------------------------------------------------------------------------
// Notification card
// ---------------------------------------------------------------------------

function NotificationCard({
  icon: Icon,
  title,
  description,
  cronSchedule,
  state,
  onTrigger,
}: {
  icon: React.ElementType
  title: string
  description: string
  cronSchedule: string
  state: TriggerState
  onTrigger: () => void
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="w-4 h-4 text-gray-500" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-600">{description}</p>
        <p className="text-xs text-gray-400 font-mono bg-gray-50 rounded px-2 py-1 inline-block">
          Cron: {cronSchedule} (IST)
        </p>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={onTrigger}
            disabled={state.loading}
            className="gap-1.5"
          >
            {state.loading ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending…</>
            ) : (
              'Send Test'
            )}
          </Button>

          {state.result && (
            <span className={`flex items-center gap-1 text-sm ${state.result.ok ? 'text-green-600' : 'text-red-600'}`}>
              {state.result.ok
                ? <CheckCircle2 className="w-4 h-4" />
                : <XCircle className="w-4 h-4" />
              }
              {state.result.message}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NotificationsSettingsPage() {
  const [states, setStates] = useState<Record<TriggerType, TriggerState>>({
    'daily-arrivals':    { ...INITIAL_STATE },
    'daily-departures':  { ...INITIAL_STATE },
    'payment-reminders': { ...INITIAL_STATE },
    'sync-ical':         { ...INITIAL_STATE },
  })

  function setLoading(type: TriggerType, loading: boolean) {
    setStates((prev) => ({ ...prev, [type]: { ...prev[type], loading } }))
  }

  function setResult(type: TriggerType, result: TriggerState['result']) {
    setStates((prev) => ({ ...prev, [type]: { loading: false, result } }))
  }

  async function trigger(type: TriggerType) {
    setLoading(type, true)
    setStates((prev) => ({ ...prev, [type]: { ...prev[type], loading: true, result: null } }))

    try {
      const res = await fetch(`/api/cron/${type}`, { method: 'GET' })
      const json = await res.json() as Record<string, unknown>

      if (res.ok && json.ok) {
        const count =
          type === 'daily-arrivals'    ? `${json.totalArrivals ?? 0} arrival(s)` :
          type === 'daily-departures'  ? `${json.totalDepartures ?? 0} departure(s)` :
          type === 'sync-ical'         ? `${json.synced ?? 0} feed(s) synced` :
          `${json.remindersSent ?? 0} reminder(s) sent`

        setResult(type, { ok: true, message: `Sent! ${count}` })
        toast.success(`${type} triggered`, { description: count })
      } else {
        const msg = typeof json.error === 'string' ? json.error : 'Failed'
        setResult(type, { ok: false, message: msg })
        toast.error(`Failed to trigger ${type}`)
      }
    } catch {
      setResult(type, { ok: false, message: 'Network error' })
      toast.error('Network error')
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">WhatsApp Notifications</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage automated WhatsApp messages sent to you each morning.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <strong>Setup required:</strong> Add your WhatsApp number in{' '}
          <strong>Properties → Edit</strong> (owner phone field) to receive notifications.
          Also ensure your Gupshup templates are approved before sending.
        </div>
      </div>

      <div className="space-y-4">
        <NotificationCard
          icon={Sunrise}
          title="Daily Arrivals"
          description="Sent at 8:00 AM IST with a numbered list of today's check-ins. Reply A1, A2… to see details."
          cronSchedule="8:00 AM daily"
          state={states['daily-arrivals']}
          onTrigger={() => trigger('daily-arrivals')}
        />

        <NotificationCard
          icon={Sunset}
          title="Daily Departures"
          description="Sent at 9:00 AM IST with today's check-outs and any pending payment amounts."
          cronSchedule="9:00 AM daily"
          state={states['daily-departures']}
          onTrigger={() => trigger('daily-departures')}
        />

        <NotificationCard
          icon={CreditCard}
          title="Payment Reminders"
          description="Sent at 9:30 AM IST for bookings with pending payments: 2 days before check-in, on check-in day, and 1 day after checkout."
          cronSchedule="9:30 AM daily"
          state={states['payment-reminders']}
          onTrigger={() => trigger('payment-reminders')}
        />
      </div>

      <NotificationCard
          icon={RefreshCw}
          title="iCal Sync"
          description="Syncs all connected OTA calendar feeds (Airbnb, Booking.com) every 30 minutes. Blocked dates appear in grey on your calendar."
          cronSchedule="Every 30 minutes"
          state={states['sync-ical']}
          onTrigger={() => trigger('sync-ical')}
        />

      {/* Booking confirmation note */}
      <Card className="border-dashed">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <BellRing className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
            <div className="text-sm text-gray-600">
              <strong className="text-gray-800">Booking confirmations</strong> are sent automatically
              within seconds of every new booking — no manual trigger needed.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
