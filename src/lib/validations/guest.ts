import { z } from 'zod'

// Document-specific validators
const AADHAAR_REGEX = /^\d{12}$/
const PASSPORT_REGEX = /^[A-Z][0-9]{7}$/   // Indian passport format: 1 letter + 7 digits
const DL_REGEX = /^[A-Z]{2}\d{2}\s?\d{4}\d{7}$/  // e.g. MH0220230012345 (loose check)
const VOTER_ID_REGEX = /^[A-Z]{3}\d{7}$/

export const guestSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),

  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')
    .optional()
    .or(z.literal('')),

  email: z.string().email('Enter a valid email address').optional().or(z.literal('')),

  address: z.string().max(300, 'Address too long').optional().or(z.literal('')),

  city: z.string().max(100).optional().or(z.literal('')),

  state: z.string().max(100).optional().or(z.literal('')),

  pincode: z
    .string()
    .regex(/^\d{6}$/, 'Enter a valid 6-digit pincode')
    .optional()
    .or(z.literal('')),

  nationality: z.string().min(2, 'Nationality is required').default('Indian'),

  is_foreign_national: z.boolean().default(false),

  id_document_type: z
    .enum(['aadhaar', 'passport', 'driving_license', 'voter_id'])
    .optional(),

  id_document_number: z.string().optional().or(z.literal('')),

  notes: z.string().max(1000, 'Notes too long').optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  // Validate document number format based on type
  if (data.id_document_type && data.id_document_number) {
    const num = data.id_document_number.trim().toUpperCase()
    switch (data.id_document_type) {
      case 'aadhaar':
        if (!AADHAAR_REGEX.test(num)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['id_document_number'],
            message: 'Aadhaar number must be exactly 12 digits',
          })
        }
        break
      case 'passport':
        if (!PASSPORT_REGEX.test(num)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['id_document_number'],
            message: 'Enter a valid Indian passport number (e.g. A1234567)',
          })
        }
        break
      case 'voter_id':
        if (!VOTER_ID_REGEX.test(num)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['id_document_number'],
            message: 'Enter a valid Voter ID (e.g. ABC1234567)',
          })
        }
        break
      // driving_license formats vary by state — light validation only
      case 'driving_license':
        if (num.length < 8) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['id_document_number'],
            message: 'Enter a valid driving licence number',
          })
        }
        break
    }
  }
})

export type GuestFormData = z.infer<typeof guestSchema>

export const ID_DOCUMENT_LABELS: Record<string, string> = {
  aadhaar: 'Aadhaar Card',
  passport: 'Passport',
  driving_license: 'Driving Licence',
  voter_id: 'Voter ID',
}

export const ID_DOCUMENT_PLACEHOLDERS: Record<string, string> = {
  aadhaar: '1234 5678 9012',
  passport: 'A1234567',
  driving_license: 'MH02 20230012345',
  voter_id: 'ABC1234567',
}
