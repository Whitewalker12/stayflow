import { z } from 'zod'

export const generateInvoiceSchema = z.object({
  booking_id: z.string().uuid('Invalid booking ID'),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD)'),
  notes: z.string().max(500, 'Notes too long').optional().or(z.literal('')),
})

export type GenerateInvoiceInput = z.infer<typeof generateInvoiceSchema>

export const updateInvoiceStatusSchema = z.object({
  status: z.enum(['draft', 'sent', 'paid', 'cancelled']),
})

export type UpdateInvoiceStatusInput = z.infer<typeof updateInvoiceStatusSchema>

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft:     'Draft',
  sent:      'Sent',
  paid:      'Paid',
  cancelled: 'Cancelled',
}

export const INVOICE_STATUS_STYLES: Record<string, string> = {
  draft:     'bg-gray-50 text-gray-600 border-gray-200',
  sent:      'bg-blue-50 text-blue-700 border-blue-200',
  paid:      'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
}

/** Status transitions: what's allowed from each state */
export const INVOICE_STATUS_TRANSITIONS: Partial<
  Record<string, { label: string; next: string }[]>
> = {
  draft:     [{ label: 'Mark as Sent', next: 'sent' }],
  sent:      [{ label: 'Mark as Paid', next: 'paid' }],
}
