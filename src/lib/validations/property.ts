import { z } from 'zod'

// GSTIN format: 2-digit state code + 5-char PAN + 4-digit + 1 alpha + 1 alpha/num + Z + 1 alphanumeric
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

export const propertySchema = z.object({
  name: z.string().min(2, 'Property name must be at least 2 characters'),
  address_line1: z.string().min(3, 'Address line 1 is required'),
  address_line2: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode'),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
    .optional()
    .or(z.literal('')),
  email: z.string().email('Enter a valid email address').optional().or(z.literal('')),
  gstin: z
    .string()
    .regex(GSTIN_REGEX, 'Enter a valid GSTIN (e.g. 27AABCU9603R1ZX)')
    .optional()
    .or(z.literal('')),
  default_checkin_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Use HH:MM format'),
  default_checkout_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Use HH:MM format'),
  cancellation_policy: z.string().optional(),
})

export type PropertyFormData = z.infer<typeof propertySchema>

/** Format separate address columns for display */
export function formatAddress(parts: {
  address_line1: string
  address_line2?: string | null
  city: string
  pincode: string
  state?: string
}): string {
  return [parts.address_line1, parts.address_line2, parts.city, parts.pincode, parts.state]
    .filter(Boolean)
    .join(', ')
}
