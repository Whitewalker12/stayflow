import { z } from 'zod'

// ── ID format regexes ────────────────────────────────────────────────────────
const AADHAAR_REGEX  = /^\d{12}$/
const PASSPORT_REGEX = /^[A-Z][0-9]{7}$/   // Indian: 1 letter + 7 digits
const VOTER_ID_REGEX = /^[A-Z]{3}\d{7}$/

// ── Main schema ──────────────────────────────────────────────────────────────

export const checkinSchema = z
  .object({
    // Step 1 — Personal info
    full_name: z.string().min(2, 'Full name must be at least 2 characters'),
    phone: z
      .string()
      .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
    email: z
      .string()
      .email('Enter a valid email address')
      .optional()
      .or(z.literal('')),

    // Step 2 — ID verification
    id_type: z.enum(['aadhaar', 'passport', 'driving_license', 'voter_id'], {
      error: 'Please select an ID type',
    }),
    id_number: z.string().min(1, 'ID number is required'),

    // Step 3 — Address
    address:  z.string().max(300).optional().or(z.literal('')),
    city:     z.string().max(100).optional().or(z.literal('')),
    state:    z.string().max(100).optional().or(z.literal('')),
    pincode:  z
      .string()
      .regex(/^\d{6}$/, 'Enter a valid 6-digit pincode')
      .optional()
      .or(z.literal('')),

    // Step 3 — Stay details
    num_adults: z.coerce
      .number({ error: 'Enter number of adults' })
      .int()
      .min(1, 'At least 1 adult required')
      .max(20),
    num_children: z.coerce.number().int().min(0).max(20).default(0),
    expected_arrival_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/, 'Enter a valid time (HH:MM)')
      .optional()
      .or(z.literal('')),
    special_requests: z.string().max(1000).optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    const num = data.id_number.trim().toUpperCase()
    switch (data.id_type) {
      case 'aadhaar':
        if (!AADHAAR_REGEX.test(num.replace(/\s/g, ''))) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['id_number'],
            message: 'Aadhaar must be exactly 12 digits',
          })
        }
        break
      case 'passport':
        if (!PASSPORT_REGEX.test(num)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['id_number'],
            message: 'Passport: 1 letter + 7 digits (e.g. A1234567)',
          })
        }
        break
      case 'voter_id':
        if (!VOTER_ID_REGEX.test(num)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['id_number'],
            message: 'Voter ID: 3 letters + 7 digits (e.g. ABC1234567)',
          })
        }
        break
      case 'driving_license':
        if (num.length < 8) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['id_number'],
            message: 'Enter a valid driving licence number',
          })
        }
        break
    }
  })

export type CheckinFormData = z.infer<typeof checkinSchema>

// ── Display helpers ──────────────────────────────────────────────────────────

export const ID_TYPE_LABELS: Record<string, string> = {
  aadhaar:         'Aadhaar Card',
  passport:        'Passport',
  driving_license: 'Driving Licence',
  voter_id:        'Voter ID',
}

export const ID_TYPE_PLACEHOLDERS: Record<string, string> = {
  aadhaar:         '1234 5678 9012',
  passport:        'A1234567',
  driving_license: 'MH02 20230012345',
  voter_id:        'ABC1234567',
}
