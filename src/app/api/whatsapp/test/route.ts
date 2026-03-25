/**
 * GET /api/whatsapp/test?phone=919876543210&type=template_name
 *
 * Development-only route for testing WhatsApp message delivery.
 * Blocked in production.
 *
 * Query params:
 *   phone  - E.164 number without '+' (required)
 *   type   - Which message to send (optional, default: "text")
 *
 * Supported types:
 *   text                - Plain text "Hello from HomeStayPMS!"
 *   booking_confirmation
 *   daily_arrivals
 *   daily_departures
 *   payment_reminder
 *   guest_checkin_link
 *   checkout_thankyou
 *
 * Usage (local dev):
 *   curl "http://localhost:3000/api/whatsapp/test?phone=919876543210&type=booking_confirmation"
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendTextMessage } from '@/lib/whatsapp/client'
import {
  sendBookingConfirmation,
  sendDailyArrivals,
  sendDailyDepartures,
  sendPaymentReminder,
  sendGuestCheckinLink,
  sendCheckoutThankYou,
} from '@/lib/whatsapp/send'

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Hard block in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'This route is only available in development' },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const phone = searchParams.get('phone')
  const type = searchParams.get('type') ?? 'text'

  if (!phone) {
    return NextResponse.json(
      { error: 'Missing required query param: phone (e.g. ?phone=919876543210)' },
      { status: 400 }
    )
  }

  // Validate phone format loosely
  if (!/^\d{10,15}$/.test(phone)) {
    return NextResponse.json(
      { error: 'phone must be digits only, 10-15 chars (E.164 without +). e.g. 919876543210' },
      { status: 400 }
    )
  }

  try {
    switch (type) {
      // ── Plain text ────────────────────────────────────────────────────────
      case 'text': {
        await sendTextMessage({
          to: phone,
          text: '👋 Hello from HomeStayPMS! WhatsApp integration is working correctly.',
        })
        break
      }

      // ── booking_confirmation ──────────────────────────────────────────────
      case 'booking_confirmation': {
        await sendBookingConfirmation({
          ownerPhone: phone,
          guestName: 'Rahul Sharma',
          roomName: 'Sunset Room',
          checkInDate: '2025-04-15',
          checkOutDate: '2025-04-18',
          totalAmountPaise: 1_250_000,   // ₹12,500
          source: 'airbnb',
        })
        break
      }

      // ── daily_arrivals ────────────────────────────────────────────────────
      case 'daily_arrivals': {
        await sendDailyArrivals({
          ownerPhone: phone,
          date: new Date(),
          arrivals: [
            { guestName: 'Rahul Sharma', roomName: 'Sunset Room', checkInTime: '2:00 PM' },
            { guestName: 'Priya Kapoor', roomName: 'Garden View', checkInTime: '4:30 PM' },
          ],
        })
        break
      }

      // ── daily_departures ──────────────────────────────────────────────────
      case 'daily_departures': {
        await sendDailyDepartures({
          ownerPhone: phone,
          date: new Date(),
          departures: [
            { guestName: 'Ankit Gupta', roomName: 'Hilltop Suite', pendingAmountPaise: 250_000 },
            { guestName: 'Sneha Reddy', roomName: 'Cozy Corner', pendingAmountPaise: 0 },
          ],
        })
        break
      }

      // ── payment_reminder ──────────────────────────────────────────────────
      case 'payment_reminder': {
        await sendPaymentReminder({
          ownerPhone: phone,
          guestName: 'Vikram Singh',
          roomName: 'Sunset Room',
          totalAmountPaise: 900_000,    // ₹9,000
          paidAmountPaise: 300_000,     // ₹3,000
          dueLabel: '15 Apr 2025 (check-in day)',
        })
        break
      }

      // ── guest_checkin_link ────────────────────────────────────────────────
      case 'guest_checkin_link': {
        await sendGuestCheckinLink({
          guestPhone: phone,
          propertyName: "Nandini's Homestay",
          checkinToken: 'testtoken123',
          ownerName: 'Nandini',
        })
        break
      }

      // ── checkout_thankyou ─────────────────────────────────────────────────
      case 'checkout_thankyou': {
        await sendCheckoutThankYou({
          guestPhone: phone,
          propertyName: "Nandini's Homestay",
          invoiceId: 'INV-2025-26-0001',
        })
        break
      }

      default: {
        return NextResponse.json(
          {
            error: `Unknown type: "${type}"`,
            supported: [
              'text',
              'booking_confirmation',
              'daily_arrivals',
              'daily_departures',
              'payment_reminder',
              'guest_checkin_link',
              'checkout_thankyou',
            ],
          },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Test message (${type}) sent to ${phone}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[WhatsApp Test] Failed to send ${type} to ${phone}:`, err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
