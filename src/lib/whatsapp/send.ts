/**
 * High-level WhatsApp send functions for StayFlow.
 *
 * Each function maps a business event to a specific template and formats
 * the data into template params. Callers only deal with domain objects;
 * the template param ordering is encapsulated here.
 *
 * All functions are fire-and-forget safe: they catch and log errors so
 * a WhatsApp failure never breaks the main booking/checkout flow.
 */

import { sendTemplateMessage } from './client'
import {
  TEMPLATE_IDS,
  buildBookingConfirmationParams,
  buildDailyArrivalsParams,
  buildDailyDeparturesParams,
  buildPaymentReminderParams,
  buildGuestCheckinLinkParams,
  buildCheckoutThankYouParams,
  formatShortDate,
  formatDateStr,
  formatRupees,
  sourceLabel,
} from './templates'

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface BookingConfirmationData {
  ownerPhone: string
  ownerId?: string
  guestName: string
  roomName: string
  checkInDate: string    // YYYY-MM-DD
  checkOutDate: string   // YYYY-MM-DD
  totalAmountPaise: number
  source: string
}

export interface DailyArrival {
  guestName: string
  roomName: string
  /** Expected check-in time, e.g. "2:00 PM". Pass empty string if unknown. */
  checkInTime: string
}

export interface DailyArrivalsData {
  ownerPhone: string
  ownerId?: string
  date: Date
  arrivals: DailyArrival[]
}

export interface DailyDeparture {
  guestName: string
  roomName: string
  pendingAmountPaise: number
}

export interface DailyDeparturesData {
  ownerPhone: string
  ownerId?: string
  date: Date
  departures: DailyDeparture[]
}

export interface PaymentReminderData {
  ownerPhone: string
  ownerId?: string
  guestName: string
  roomName: string
  totalAmountPaise: number
  paidAmountPaise: number
  /** Human-readable due date, e.g. "15 Apr 2025 (check-in day)" */
  dueLabel: string
}

export interface GuestCheckinLinkData {
  /** Guest's phone in E.164 without '+'. e.g. 919876543210 */
  guestPhone: string
  propertyName: string
  checkinToken: string
  ownerName: string
}

export interface CheckoutThankYouData {
  /** Guest's phone in E.164 without '+'. e.g. 919876543210 */
  guestPhone: string
  propertyName: string
  invoiceId: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise an Indian phone to E.164 without '+'. Adds 91 prefix if needed. */
export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('91') && digits.length === 12) return digits
  if (digits.length === 10) return `91${digits}`
  return digits // pass-through for already-normalised numbers
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://stayflow.in'
}

// ---------------------------------------------------------------------------
// sendBookingConfirmation
// Sent to the OWNER when a new booking is created.
// ---------------------------------------------------------------------------

export async function sendBookingConfirmation(data: BookingConfirmationData): Promise<void> {
  try {
    const phone = normalisePhone(data.ownerPhone)
    const params = buildBookingConfirmationParams({
      guestName: data.guestName,
      roomName: data.roomName,
      checkInDate: formatDateStr(data.checkInDate),
      checkOutDate: formatDateStr(data.checkOutDate),
      amountRupees: formatRupees(data.totalAmountPaise),
      source: sourceLabel(data.source),
    })

    await sendTemplateMessage({
      to: phone,
      templateId: TEMPLATE_IDS.bookingConfirmation,
      params,
      ownerId: data.ownerId,
    })
  } catch (err) {
    console.error('[WhatsApp] sendBookingConfirmation failed:', err)
  }
}

// ---------------------------------------------------------------------------
// sendDailyArrivals
// 8 AM IST digest of today's check-ins. Sent to the owner.
// ---------------------------------------------------------------------------

export async function sendDailyArrivals(data: DailyArrivalsData): Promise<void> {
  if (data.arrivals.length === 0) return  // nothing to send

  try {
    const phone = normalisePhone(data.ownerPhone)

    // Build the numbered arrival list text
    // e.g. "A1. Rahul Sharma → Sunset Room (2:00 PM)\nA2. Priya Kapoor → Garden View"
    const arrivalsList = data.arrivals
      .map((a, i) => {
        const time = a.checkInTime ? ` (${a.checkInTime})` : ''
        return `A${i + 1}. ${a.guestName} → ${a.roomName}${time}`
      })
      .join('\n')

    const params = buildDailyArrivalsParams({
      date: formatShortDate(data.date),
      arrivalsList,
      arrivalCount: String(data.arrivals.length),
    })

    await sendTemplateMessage({
      to: phone,
      templateId: TEMPLATE_IDS.dailyArrivals,
      params,
      ownerId: data.ownerId,
    })
  } catch (err) {
    console.error('[WhatsApp] sendDailyArrivals failed:', err)
  }
}

// ---------------------------------------------------------------------------
// sendDailyDepartures
// 9 AM IST digest of today's check-outs. Sent to the owner.
// ---------------------------------------------------------------------------

export async function sendDailyDepartures(data: DailyDeparturesData): Promise<void> {
  if (data.departures.length === 0) return

  try {
    const phone = normalisePhone(data.ownerPhone)

    // e.g. "D1. Rahul Sharma → Sunset Room | ₹2,500 pending\nD2. ..."
    const departuresList = data.departures
      .map((d, i) => {
        const pending = d.pendingAmountPaise > 0
          ? ` | ₹${formatRupees(d.pendingAmountPaise)} pending`
          : ' | Paid ✓'
        return `D${i + 1}. ${d.guestName} → ${d.roomName}${pending}`
      })
      .join('\n')

    const params = buildDailyDeparturesParams({
      date: formatShortDate(data.date),
      departuresList,
      departureCount: String(data.departures.length),
    })

    await sendTemplateMessage({
      to: phone,
      templateId: TEMPLATE_IDS.dailyDepartures,
      params,
      ownerId: data.ownerId,
    })
  } catch (err) {
    console.error('[WhatsApp] sendDailyDepartures failed:', err)
  }
}

// ---------------------------------------------------------------------------
// sendPaymentReminder
// Sent to the OWNER when a booking has a pending payment.
// ---------------------------------------------------------------------------

export async function sendPaymentReminder(data: PaymentReminderData): Promise<void> {
  try {
    const phone = normalisePhone(data.ownerPhone)
    const pendingPaise = data.totalAmountPaise - data.paidAmountPaise

    if (pendingPaise <= 0) return  // fully paid, nothing to remind

    const params = buildPaymentReminderParams({
      guestName: data.guestName,
      roomName: data.roomName,
      totalAmount: formatRupees(data.totalAmountPaise),
      paidAmount: formatRupees(data.paidAmountPaise),
      pendingAmount: formatRupees(pendingPaise),
      dueDate: data.dueLabel,
    })

    await sendTemplateMessage({
      to: phone,
      templateId: TEMPLATE_IDS.paymentReminder,
      params,
      ownerId: data.ownerId,
    })
  } catch (err) {
    console.error('[WhatsApp] sendPaymentReminder failed:', err)
  }
}

// ---------------------------------------------------------------------------
// sendGuestCheckinLink
// Sent to the GUEST after booking confirmation.
// ---------------------------------------------------------------------------

export async function sendGuestCheckinLink(data: GuestCheckinLinkData): Promise<void> {
  try {
    const phone = normalisePhone(data.guestPhone)
    const checkinLink = `${appUrl()}/checkin/${data.checkinToken}`

    const params = buildGuestCheckinLinkParams({
      propertyName: data.propertyName,
      checkinLink,
      ownerName: data.ownerName,
    })

    await sendTemplateMessage({
      to: phone,
      templateId: TEMPLATE_IDS.guestCheckinLink,
      params,
      // No ownerId here — this message is to the guest, not the owner
    })
  } catch (err) {
    console.error('[WhatsApp] sendGuestCheckinLink failed:', err)
  }
}

// ---------------------------------------------------------------------------
// sendCheckoutThankYou
// Sent to the GUEST after checkout is marked complete.
// ---------------------------------------------------------------------------

export async function sendCheckoutThankYou(data: CheckoutThankYouData): Promise<void> {
  try {
    const phone = normalisePhone(data.guestPhone)
    const invoiceLink = `${appUrl()}/invoices/${data.invoiceId}`

    const params = buildCheckoutThankYouParams({
      propertyName: data.propertyName,
      invoiceLink,
    })

    await sendTemplateMessage({
      to: phone,
      templateId: TEMPLATE_IDS.checkoutThankYou,
      params,
    })
  } catch (err) {
    console.error('[WhatsApp] sendCheckoutThankYou failed:', err)
  }
}
