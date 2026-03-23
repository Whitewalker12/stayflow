import { z } from 'zod'

export const bookingSchema = z.object({
  property_id: z.string().uuid('Select a property'),
  room_id: z.string().uuid('Select a room'),
  check_in_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid check-in date'),
  check_out_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid check-out date'),
  guest_id: z.string().uuid('Select a guest'),
  num_adults: z.number().int().min(1, 'At least 1 adult required'),
  num_children: z.number().int().min(0).default(0),
  rate_per_night: z.number().positive('Rate must be positive'), // rupees; converted to paise before save
  source: z.enum([
    'airbnb', 'makemytrip', 'booking_com', 'goibibo',
    'direct', 'walk_in', 'phone', 'referral',
  ]),
  payment_method: z
    .enum(['upi', 'cash', 'bank_transfer', 'card', 'ota_collected'])
    .optional(),
  amount_paid: z.number().min(0).default(0), // rupees
  ota_booking_id: z.string().optional().or(z.literal('')),
  special_requests: z.string().max(1000).optional().or(z.literal('')),
  internal_notes: z.string().max(1000).optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  if (data.check_out_date <= data.check_in_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['check_out_date'],
      message: 'Check-out must be after check-in',
    })
  }
})

export type BookingFormData = z.infer<typeof bookingSchema>

export const quickBookingSchema = z.object({
  room_id: z.string().uuid('Select a room'),
  check_in_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  check_out_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  guest_name: z.string().min(2, 'Enter guest name'),
  guest_phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Enter valid 10-digit mobile')
    .optional()
    .or(z.literal('')),
  rate_per_night: z.number().positive('Rate must be positive'),
  source: z.enum([
    'airbnb', 'makemytrip', 'booking_com', 'goibibo',
    'direct', 'walk_in', 'phone', 'referral',
  ]).default('direct'),
}).superRefine((data, ctx) => {
  if (data.check_out_date <= data.check_in_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['check_out_date'],
      message: 'Check-out must be after check-in',
    })
  }
})

export type QuickBookingFormData = z.infer<typeof quickBookingSchema>

export const SOURCE_LABELS: Record<string, string> = {
  airbnb: 'Airbnb',
  makemytrip: 'MakeMyTrip',
  booking_com: 'Booking.com',
  goibibo: 'Goibibo',
  direct: 'Direct',
  walk_in: 'Walk-in',
  phone: 'Phone',
  referral: 'Referral',
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  upi: 'UPI',
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  card: 'Card',
  ota_collected: 'OTA Collected',
}

export const BOOKING_SOURCES = [
  'airbnb', 'makemytrip', 'booking_com', 'goibibo',
  'direct', 'walk_in', 'phone', 'referral',
] as const

export const PAYMENT_METHODS = [
  'upi', 'cash', 'bank_transfer', 'card', 'ota_collected',
] as const
