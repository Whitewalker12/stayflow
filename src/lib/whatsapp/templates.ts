/**
 * WhatsApp template definitions for StayFlow.
 *
 * Each template matches a pre-approved WhatsApp Business message template
 * submitted via the Gupshup dashboard.
 *
 * IMPORTANT: Template IDs here must exactly match the IDs in your Gupshup account.
 * Update them once your templates are approved.
 *
 * Templates use positional params: {{1}}, {{2}}, etc.
 * The builders here accept named fields and return the ordered string[] Gupshup expects.
 *
 * Template approval status reference:
 * ┌─────────────────────────┬──────────────────────────────────────────────┐
 * │ Template ID             │ Purpose                                      │
 * ├─────────────────────────┼──────────────────────────────────────────────┤
 * │ booking_confirmation    │ Sent to owner when a new booking is created  │
 * │ arrivals_summary        │ 8 AM digest of today's check-ins             │
 * │ departures_summary      │ 9 AM digest of today's check-outs            │
 * │ payment_reminder        │ Pending payment alert to owner               │
 * │ checkin_text_welcome    │ Self-check-in link sent to guest             │
 * │ checkout_thankyou_bye   │ Thank-you + invoice link sent to guest       │
 * └─────────────────────────┴──────────────────────────────────────────────┘
 */

// ---------------------------------------------------------------------------
// Template IDs — update once approved in Gupshup
// ---------------------------------------------------------------------------

export const TEMPLATE_IDS = {
  bookingConfirmation: 'booking_confirmation',
  dailyArrivals:       'arrivals_summary',
  dailyDepartures:     'departures_summary',
  paymentReminder:     'payment_reminder',
  guestCheckinLink:    'checkin_text_welcome',
  checkoutThankYou:    'checkout_thankyou_bye',
} as const

export type TemplateId = (typeof TEMPLATE_IDS)[keyof typeof TEMPLATE_IDS]

// ---------------------------------------------------------------------------
// Template: booking_confirmation
//
// Body (submit this to Gupshup):
//   🏠 New Booking Confirmed!
//
//   Guest: {{1}}
//   Room: {{2}}
//   Check-in: {{3}}
//   Check-out: {{4}}
//   Amount: ₹{{5}}
//   Source: {{6}}
//
//   Reply DETAILS for more info.
// ---------------------------------------------------------------------------

export interface BookingConfirmationParams {
  guestName: string
  roomName: string
  checkInDate: string     // "15 Apr 2025"
  checkOutDate: string    // "18 Apr 2025"
  amountRupees: string    // "12,500"
  source: string          // "Airbnb", "Direct", etc.
}

export function buildBookingConfirmationParams(p: BookingConfirmationParams): string[] {
  return [p.guestName, p.roomName, p.checkInDate, p.checkOutDate, p.amountRupees, p.source]
}

// ---------------------------------------------------------------------------
// Template: arrivals_summary
//
// Body:
//   ☀️ Good morning! Today's arrivals ({{1}}):
//
//   {{2}}
//
//   {{3}} check-in(s) today. Reply A1, A2... for details.
// ---------------------------------------------------------------------------

export interface DailyArrivalsParams {
  date: string           // "Tue, 15 Apr"
  arrivalsList: string   // "• Rahul Sharma → Sunset Room (2:00 PM)\n• Priya Kapoor → Garden View (4:00 PM)"
  arrivalCount: string   // "2"
}

export function buildDailyArrivalsParams(p: DailyArrivalsParams): string[] {
  return [p.date, p.arrivalsList, p.arrivalCount]
}

// ---------------------------------------------------------------------------
// Template: departures_summary
//
// Body:
//   📤 Today's departures ({{1}}):
//
//   {{2}}
//
//   {{3}} check-out(s) today. Reply D1, D2... for invoice.
// ---------------------------------------------------------------------------

export interface DailyDeparturesParams {
  date: string             // "Tue, 15 Apr"
  departuresList: string   // "• Rahul Sharma → Sunset Room | ₹2,500 pending\n• ..."
  departureCount: string   // "2"
}

export function buildDailyDeparturesParams(p: DailyDeparturesParams): string[] {
  return [p.date, p.departuresList, p.departureCount]
}

// ---------------------------------------------------------------------------
// Template: payment_reminder
//
// Body:
//   💰 Payment Reminder
//
//   Booking: {{1}} ({{2}})
//   Total: ₹{{3}}
//   Paid: ₹{{4}}
//   Pending: ₹{{5}}
//
//   Due: {{6}}
// ---------------------------------------------------------------------------

export interface PaymentReminderParams {
  guestName: string       // "Rahul Sharma"
  roomName: string        // "Sunset Room"
  totalAmount: string     // "12,500"
  paidAmount: string      // "5,000"
  pendingAmount: string   // "7,500"
  dueDate: string         // "15 Apr 2025 (check-in day)"
}

export function buildPaymentReminderParams(p: PaymentReminderParams): string[] {
  return [p.guestName, p.roomName, p.totalAmount, p.paidAmount, p.pendingAmount, p.dueDate]
}

// ---------------------------------------------------------------------------
// Template: checkin_text_welcome
//
// Body:
//   🙏 Welcome to {{1}}!
//
//   Please complete your check-in:
//   {{2}}
//
//   This helps us serve you better.
//   — {{3}}
// ---------------------------------------------------------------------------

export interface GuestCheckinLinkParams {
  propertyName: string   // "Nandini's Homestay"
  checkinLink: string    // "https://stayflow.in/checkin/abc123xyz"
  ownerName: string      // "Nandini"
}

export function buildGuestCheckinLinkParams(p: GuestCheckinLinkParams): string[] {
  return [p.propertyName, p.checkinLink, p.ownerName]
}

// ---------------------------------------------------------------------------
// Template: checkout_thankyou_bye
//
// Body:
//   🙏 Thank you for staying at {{1}}!
//
//   We hope you had a wonderful stay.
//   Your invoice: {{2}}
//
//   See you again soon!
// ---------------------------------------------------------------------------

export interface CheckoutThankYouParams {
  propertyName: string   // "Nandini's Homestay"
  invoiceLink: string    // "https://stayflow.in/invoices/inv-2025-0042"
}

export function buildCheckoutThankYouParams(p: CheckoutThankYouParams): string[] {
  return [p.propertyName, p.invoiceLink]
}

// ---------------------------------------------------------------------------
// Formatting helpers shared by send.ts
// ---------------------------------------------------------------------------

/** Format a Date to "Tue, 15 Apr" (IST display) */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  })
}

/** Format a Date to "15 Apr 2025" (IST display) */
export function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

/** Format a YYYY-MM-DD string to "15 Apr 2025" */
export function formatDateStr(dateStr: string): string {
  return formatLongDate(new Date(dateStr + 'T00:00:00'))
}

/** Format paise to a plain rupee string with commas. e.g. 1250000 → "12,500" */
export function formatRupees(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

/** Convert booking source enum to display label */
export function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    airbnb: 'Airbnb',
    makemytrip: 'MakeMyTrip',
    booking_com: 'Booking.com',
    goibibo: 'Goibibo',
    direct: 'Direct',
    walk_in: 'Walk-in',
    phone: 'Phone',
    referral: 'Referral',
  }
  return labels[source] ?? source
}
