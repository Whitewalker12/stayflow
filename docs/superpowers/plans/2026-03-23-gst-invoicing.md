# GST Invoicing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete GST-compliant invoicing system: list page, generation from booking, PDF download, and all supporting utilities.

**Architecture:** Invoices are generated server-side via an API route (`POST /api/invoices/generate`) that snapshots booking+guest+property data into the `invoices` table. The PDF is rendered client-side using `@react-pdf/renderer` (dynamically imported with `ssr: false`). The invoice list page is a server component that passes data to a client filter/table component. Invoice detail shows all fields and a download button.

**Tech Stack:** Next.js 14 App Router, Supabase, `@react-pdf/renderer` v4, Zod v4, date-fns, Tailwind CSS, shadcn/ui

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/utils/gst.ts` | Create | Pure GST calculation: rate tier, CGST/SGST vs IGST split |
| `src/lib/utils/number-to-words.ts` | Create | Indian number-to-words (Rupees X Thousand Y Only) |
| `src/lib/validations/invoice.ts` | Create | Zod schemas for invoice generate + status update |
| `src/types/index.ts` | Modify | Add `InvoiceWithSnapshot` type with snapshot fields |
| `src/components/invoices/invoice-pdf.tsx` | Create | `@react-pdf/renderer` Document component |
| `src/components/invoices/invoice-download-button.tsx` | Create | Dynamic-imported client button wrapping PDFDownloadLink |
| `src/app/api/invoices/generate/route.ts` | Create | POST: snapshots booking data → inserts invoice row |
| `src/app/(dashboard)/invoices/page.tsx` | Replace | Server component: fetches invoices → `<InvoicesClient>` |
| `src/app/(dashboard)/invoices/_components/invoices-client.tsx` | Create | Client: filter bar, table, row click |
| `src/app/(dashboard)/invoices/[id]/page.tsx` | Create | Server: fetch single invoice → `<InvoiceDetail>` |
| `src/app/(dashboard)/invoices/[id]/invoice-detail.tsx` | Create | Client: detail view + status transitions + PDF button |
| `src/app/(dashboard)/bookings/_components/booking-detail-sheet.tsx` | Modify | Add "Generate Invoice" button on checked_out bookings |

---

## Task 1: GST Utility

**Files:**
- Create: `src/lib/utils/gst.ts`

- [ ] Create the file:

```typescript
/**
 * GST calculation for accommodation services (SAC 9963).
 *
 * Rate tiers (on per-night rate, not total):
 *   ≤ ₹7,500/night → 12% GST
 *   > ₹7,500/night → 18% GST
 *
 * Intra-state: CGST = half, SGST = half
 * Inter-state: IGST = full rate
 *
 * All inputs and outputs in PAISE (integers).
 */

export type GSTResult = {
  gstPercent: 12 | 18
  baseAmount: number   // paise — same as taxable amount
  cgstAmount: number   // paise (0 if inter-state)
  sgstAmount: number   // paise (0 if inter-state)
  igstAmount: number   // paise (0 if intra-state)
  totalAmount: number  // paise = base + cgst + sgst + igst
  isInterState: boolean
}

/** ₹7,500 expressed in paise */
const GST_RATE_THRESHOLD_PAISE = 750_000

export function calculateGST(
  ratePerNightPaise: number,
  propertyState: string,
  guestState: string | null | undefined,
): GSTResult {
  const gstPercent: 12 | 18 = ratePerNightPaise <= GST_RATE_THRESHOLD_PAISE ? 12 : 18

  // Inter-state when guest state is known AND different from property state
  const isInterState =
    !!guestState &&
    guestState.trim().toLowerCase() !== propertyState.trim().toLowerCase()

  // GST is levied on the BASE (taxable) amount only.
  // Note: for accommodation services, GST is on the tariff (room rate × nights),
  // i.e. the base_amount that was already passed in.
  // We receive base_amount as a parameter here.
  // Callers pass totalBaseAmountPaise = ratePerNightPaise * numNights.
  return _compute(gstPercent, isInterState)

  function _compute(pct: 12 | 18, interState: boolean) {
    // Placeholder — actual base amount comes from caller
    return { gstPercent: pct, isInterState: interState } as GSTResult
  }
}

/**
 * Full invoice GST computation.
 * @param baseAmountPaise   taxable amount (rate × nights), in paise
 * @param ratePerNightPaise used to determine 12% vs 18% tier
 * @param propertyState     property's registered state
 * @param guestState        guest's home state (null = treat as intra-state)
 */
export function computeInvoiceGST(
  baseAmountPaise: number,
  ratePerNightPaise: number,
  propertyState: string,
  guestState: string | null | undefined,
): GSTResult {
  const gstPercent: 12 | 18 = ratePerNightPaise <= GST_RATE_THRESHOLD_PAISE ? 12 : 18

  const isInterState =
    !!guestState &&
    guestState.trim().toLowerCase() !== propertyState.trim().toLowerCase()

  // Compute GST on base amount
  const gstAmount = Math.round((baseAmountPaise * gstPercent) / 100)

  let cgstAmount = 0
  let sgstAmount = 0
  let igstAmount = 0

  if (isInterState) {
    igstAmount = gstAmount
  } else {
    // Split equally; handle odd-paise rounding (give extra paise to CGST)
    sgstAmount = Math.floor(gstAmount / 2)
    cgstAmount = gstAmount - sgstAmount
  }

  const totalAmount = baseAmountPaise + cgstAmount + sgstAmount + igstAmount

  return {
    gstPercent,
    baseAmount: baseAmountPaise,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalAmount,
    isInterState,
  }
}
```

---

## Task 2: Number to Words Utility

**Files:**
- Create: `src/lib/utils/number-to-words.ts`

- [ ] Create the file — full Indian number system (lakhs, crores):

```typescript
/**
 * Convert a non-negative integer (rupees, no paise) to Indian English words.
 * e.g. 12350 → "Rupees Twelve Thousand Three Hundred and Fifty Only"
 * Max supported: 99,99,99,999 (≈ 99 crore)
 */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
]

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
  'Sixty', 'Seventy', 'Eighty', 'Ninety',
]

function twoDigits(n: number): string {
  if (n === 0) return ''
  if (n < 20) return ONES[n]
  const ten = TENS[Math.floor(n / 10)]
  const one = ONES[n % 10]
  return one ? `${ten} ${one}` : ten
}

function threeDigits(n: number): string {
  if (n === 0) return ''
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`)
  if (rest) parts.push(twoDigits(rest))
  return parts.join(' and ')
}

export function numberToWords(rupees: number): string {
  const n = Math.floor(rupees) // ignore paise
  if (n === 0) return 'Rupees Zero Only'
  if (n < 0) return 'Negative amount'

  const crore = Math.floor(n / 1_00_00_000)
  const lakh  = Math.floor((n % 1_00_00_000) / 1_00_000)
  const thou  = Math.floor((n % 1_00_000) / 1_000)
  const rest  = n % 1_000

  const parts: string[] = []
  if (crore) parts.push(`${threeDigits(crore)} Crore`)
  if (lakh)  parts.push(`${twoDigits(lakh)} Lakh`)
  if (thou)  parts.push(`${threeDigits(thou)} Thousand`)
  if (rest)  parts.push(threeDigits(rest))

  return `Rupees ${parts.join(' ')} Only`
}
```

---

## Task 3: Invoice Zod Validation Schema

**Files:**
- Create: `src/lib/validations/invoice.ts`

- [ ] Create the file:

```typescript
import { z } from 'zod'

export const generateInvoiceSchema = z.object({
  booking_id: z.string().uuid('Invalid booking ID'),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  notes: z.string().max(500).optional().or(z.literal('')),
})

export type GenerateInvoiceInput = z.infer<typeof generateInvoiceSchema>

export const updateInvoiceStatusSchema = z.object({
  status: z.enum(['draft', 'sent', 'paid', 'cancelled']),
})

export type UpdateInvoiceStatusInput = z.infer<typeof updateInvoiceStatusSchema>

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

export const INVOICE_STATUS_STYLES: Record<string, string> = {
  draft:     'bg-gray-50 text-gray-600 border-gray-200',
  sent:      'bg-blue-50 text-blue-700 border-blue-200',
  paid:      'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
}
```

---

## Task 4: Update Types — InvoiceWithSnapshot

**Files:**
- Modify: `src/types/index.ts`

The DB `invoices` table stores snapshot fields (guest name, addresses, etc.) so the PDF can be regenerated without live joins. Add the extended type:

- [ ] Append to `src/types/index.ts`:

```typescript
/** Extended invoice with all snapshot fields stored at generation time */
export type InvoiceWithSnapshot = Invoice & {
  // Guest snapshot
  guest_name: string
  guest_address: string | null
  guest_city: string | null
  guest_state: string | null
  guest_gstin: string | null     // for B2B invoices

  // Property snapshot
  property_name: string
  property_address: string
  property_city: string
  property_state: string
  property_gstin: string | null

  // Booking snapshot
  room_name: string
  num_nights: number
  rate_per_night_paise: number   // matches booking column
  notes: string | null
}
```

---

## Task 5: Invoice Generate API Route

**Files:**
- Create: `src/app/api/invoices/generate/route.ts`

This route fetches all booking data, computes GST, generates the invoice number, and inserts the invoice row with snapshots.

- [ ] Create the route:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateInvoiceSchema } from '@/lib/validations/invoice'
import { computeInvoiceGST } from '@/lib/utils/gst'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = generateInvoiceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { booking_id, invoice_date, notes } = parsed.data

  // ── Fetch booking with all related data ──────────────────────────────────
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select(`
      id, property_id, room_id, check_in_date, check_out_date,
      rate_per_night_paise, total_amount_paise, num_nights,
      num_adults, num_children, status,
      rooms ( id, name, room_type ),
      properties ( id, name, address_line1, address_line2, city, state, pincode, gstin ),
      booking_guests (
        is_primary,
        guests ( id, full_name, address, city, state, pincode, email, phone )
      )
    `)
    .eq('id', booking_id)
    .is('deleted_at', null)
    .single()

  if (bErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  // Ownership check — property must belong to this user
  const { data: propOwner } = await supabase
    .from('properties')
    .select('owner_id')
    .eq('id', booking.property_id)
    .single()
  if (propOwner?.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Check no duplicate invoice for this booking
  const { data: existing } = await supabase
    .from('invoices')
    .select('id')
    .eq('booking_id', booking_id)
    .is('deleted_at', null)
    .not('status', 'eq', 'cancelled')
    .limit(1)
    .single()
  if (existing) {
    return NextResponse.json({ error: 'Invoice already exists for this booking', invoice_id: existing.id }, { status: 409 })
  }

  // ── Extract snapshot data ────────────────────────────────────────────────
  const property = booking.properties as {
    id: string; name: string; address_line1: string; address_line2: string | null
    city: string; state: string; pincode: string; gstin: string | null
  } | null
  const room = booking.rooms as { id: string; name: string; room_type: string } | null
  const bookingGuests = (booking.booking_guests ?? []) as {
    is_primary: boolean
    guests: {
      id: string; full_name: string; address: string | null; city: string | null
      state: string | null; pincode: string | null; email: string | null; phone: string | null
    } | null
  }[]
  const primaryGuest = bookingGuests.find(bg => bg.is_primary)?.guests ?? bookingGuests[0]?.guests

  if (!property || !room || !primaryGuest) {
    return NextResponse.json({ error: 'Incomplete booking data' }, { status: 422 })
  }

  // ── GST calculation ──────────────────────────────────────────────────────
  const baseAmountPaise = booking.rate_per_night_paise * booking.num_nights
  const gst = computeInvoiceGST(
    baseAmountPaise,
    booking.rate_per_night_paise,
    property.state,
    primaryGuest.state,
  )

  // ── Invoice number ───────────────────────────────────────────────────────
  // Financial year: Apr–Mar. If month >= 4 → FY starts this year, else last year.
  const invDate = new Date(invoice_date)
  const fyStartYear = invDate.getMonth() >= 3 // 0-indexed, so 3 = April
    ? invDate.getFullYear()
    : invDate.getFullYear() - 1
  const fyLabel = `${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`

  // Count existing invoices this FY for this owner (across all properties)
  const fyStart = `${fyStartYear}-04-01`
  const fyEnd   = `${fyStartYear + 1}-03-31`
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .gte('invoice_date', fyStart)
    .lte('invoice_date', fyEnd)
    .eq('property_id', booking.property_id) // scope to property for simplicity

  const seq = String((count ?? 0) + 1).padStart(4, '0')
  const invoiceNumber = `INV-${fyLabel}-${seq}`

  // ── Insert invoice ───────────────────────────────────────────────────────
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      booking_id,
      property_id: booking.property_id,
      invoice_number: invoiceNumber,
      invoice_date,
      status: 'draft',
      base_amount: gst.baseAmount,
      cgst_amount: gst.cgstAmount,
      sgst_amount: gst.sgstAmount,
      igst_amount: gst.igstAmount,
      total_amount: gst.totalAmount,
      is_inter_state: gst.isInterState,
      gst_percent: gst.gstPercent,
      // Snapshot fields
      guest_name: primaryGuest.full_name,
      guest_address: primaryGuest.address,
      guest_city: primaryGuest.city,
      guest_state: primaryGuest.state,
      guest_gstin: null,
      property_name: property.name,
      property_address: [property.address_line1, property.address_line2].filter(Boolean).join(', '),
      property_city: property.city,
      property_state: property.state,
      property_gstin: property.gstin,
      room_name: room.name,
      num_nights: booking.num_nights,
      rate_per_night_paise: booking.rate_per_night_paise,
      notes: notes || null,
    })
    .select('id')
    .single()

  if (invErr || !invoice) {
    return NextResponse.json({ error: invErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({ invoice_id: invoice.id, invoice_number: invoiceNumber }, { status: 201 })
}
```

---

## Task 6: Invoice PDF Component

**Files:**
- Create: `src/components/invoices/invoice-pdf.tsx`

Uses `@react-pdf/renderer` primitives — NO Tailwind, NO HTML elements. Must use only: `Document`, `Page`, `View`, `Text`, `StyleSheet` from `@react-pdf/renderer`.

- [ ] Create the PDF component:

```typescript
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { numberToWords } from '@/lib/utils/number-to-words'
import type { InvoiceWithSnapshot } from '@/types'

// Indian number formatting for PDF (Intl not available in PDF renderer environment)
function fmtINR(paise: number): string {
  const rupees = Math.floor(paise / 100)
  // Format with Indian comma system: XX,XX,XXX
  const s = rupees.toString()
  if (s.length <= 3) return `Rs.${s}`
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `Rs.${formatted},${last3}`
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    color: '#1a1a1a',
  },
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  propertyBlock: { flex: 1 },
  propertyName: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#1a1a1a', marginBottom: 2 },
  propertyAddress: { fontSize: 9, color: '#555', lineHeight: 1.5 },
  invoiceLabel: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#2563eb', textAlign: 'right' },
  // Meta row
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  metaBlock: { flex: 1 },
  metaTitle: { fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  metaValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  // Divider
  divider: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginBottom: 16 },
  // Bill to
  billSection: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  billBlock: { flex: 1 },
  billTitle: { fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  billName: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  billAddress: { fontSize: 9, color: '#555', lineHeight: 1.5 },
  // Table
  table: { marginBottom: 20 },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#f3f4f6',
    paddingVertical: 6, paddingHorizontal: 8,
    borderTopWidth: 1, borderTopColor: '#e5e7eb',
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  tableRow: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  col_sno:  { width: '6%', fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#555' },
  col_desc: { width: '36%', fontSize: 9, color: '#555', fontFamily: 'Helvetica-Bold' },
  col_sac:  { width: '12%', textAlign: 'center', fontSize: 9, color: '#555', fontFamily: 'Helvetica-Bold' },
  col_nights: { width: '12%', textAlign: 'center', fontSize: 9, color: '#555', fontFamily: 'Helvetica-Bold' },
  col_rate: { width: '17%', textAlign: 'right', fontSize: 9, color: '#555', fontFamily: 'Helvetica-Bold' },
  col_amt:  { width: '17%', textAlign: 'right', fontSize: 9, color: '#555', fontFamily: 'Helvetica-Bold' },
  // Value versions (non-bold)
  col_sno_v:    { width: '6%' },
  col_desc_v:   { width: '36%' },
  col_sac_v:    { width: '12%', textAlign: 'center' },
  col_nights_v: { width: '12%', textAlign: 'center' },
  col_rate_v:   { width: '17%', textAlign: 'right' },
  col_amt_v:    { width: '17%', textAlign: 'right' },
  // Totals
  totalsSection: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 },
  totalsTable: { width: 240 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingHorizontal: 4 },
  totalLabel: { fontSize: 9, color: '#555' },
  totalValue: { fontSize: 9, textAlign: 'right', minWidth: 80 },
  grandTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, paddingHorizontal: 4,
    backgroundColor: '#1e3a5f', borderRadius: 4, marginTop: 4,
  },
  grandTotalLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  grandTotalValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#ffffff', textAlign: 'right', minWidth: 80 },
  // Amount in words
  amountWords: {
    fontSize: 9, color: '#374151', backgroundColor: '#f9fafb',
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 4,
    padding: 8, marginBottom: 20,
  },
  // Notes
  notesSection: { marginBottom: 20 },
  notesTitle: { fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  notesText: { fontSize: 9, color: '#555', lineHeight: 1.5 },
  // Footer
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40 },
  footerDivider: { borderTopWidth: 1, borderTopColor: '#e5e7eb', marginBottom: 8 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: '#9ca3af' },
  signatureLine: { borderTopWidth: 1, borderTopColor: '#374151', paddingTop: 4, marginTop: 24, width: 120 },
  signatureLabel: { fontSize: 8, color: '#6b7280' },
})

interface InvoicePDFProps {
  invoice: InvoiceWithSnapshot
}

export function InvoicePDF({ invoice }: InvoicePDFProps) {
  const gstLabel = invoice.gst_percent === 12 ? '12%' : '18%'
  const halfGst  = invoice.gst_percent / 2

  const totalRupees = Math.floor(invoice.total_amount / 100)
  const amountWords = numberToWords(totalRupees)

  const propertyAddress = [
    invoice.property_address,
    invoice.property_city,
    invoice.property_state,
  ].filter(Boolean).join(', ')

  const guestAddress = [
    invoice.guest_address,
    invoice.guest_city,
    invoice.guest_state,
  ].filter(Boolean).join(', ')

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.propertyBlock}>
            <Text style={styles.propertyName}>{invoice.property_name}</Text>
            <Text style={styles.propertyAddress}>{propertyAddress}</Text>
            {invoice.property_gstin && (
              <Text style={styles.propertyAddress}>GSTIN: {invoice.property_gstin}</Text>
            )}
          </View>
          <Text style={styles.invoiceLabel}>TAX INVOICE</Text>
        </View>

        {/* ── Invoice meta ── */}
        <View style={styles.divider} />
        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaTitle}>Invoice Number</Text>
            <Text style={styles.metaValue}>{invoice.invoice_number}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaTitle}>Invoice Date</Text>
            <Text style={styles.metaValue}>{invoice.invoice_date}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaTitle}>SAC Code</Text>
            <Text style={styles.metaValue}>9963</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaTitle}>Place of Supply</Text>
            <Text style={styles.metaValue}>{invoice.property_state}</Text>
          </View>
        </View>
        <View style={styles.divider} />

        {/* ── Bill To ── */}
        <View style={styles.billSection}>
          <View style={styles.billBlock}>
            <Text style={styles.billTitle}>Bill To</Text>
            <Text style={styles.billName}>{invoice.guest_name}</Text>
            {guestAddress ? <Text style={styles.billAddress}>{guestAddress}</Text> : null}
            {invoice.guest_gstin ? (
              <Text style={styles.billAddress}>GSTIN: {invoice.guest_gstin}</Text>
            ) : null}
          </View>
          <View style={styles.billBlock}>
            <Text style={styles.billTitle}>Stay Details</Text>
            <Text style={styles.billAddress}>{invoice.room_name}</Text>
            <Text style={styles.billAddress}>
              {invoice.num_nights} night{invoice.num_nights !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* ── Line items table ── */}
        <View style={styles.table}>
          {/* Header row */}
          <View style={styles.tableHeader}>
            <Text style={styles.col_sno}>S.No</Text>
            <Text style={styles.col_desc}>Description</Text>
            <Text style={styles.col_sac}>SAC</Text>
            <Text style={styles.col_nights}>Nights</Text>
            <Text style={styles.col_rate}>Rate (₹)</Text>
            <Text style={styles.col_amt}>Amount (₹)</Text>
          </View>
          {/* Data row */}
          <View style={styles.tableRow}>
            <Text style={styles.col_sno_v}>1</Text>
            <Text style={styles.col_desc_v}>
              Accommodation — {invoice.room_name}{'\n'}
              ({invoice.guest_name})
            </Text>
            <Text style={styles.col_sac_v}>9963</Text>
            <Text style={styles.col_nights_v}>{invoice.num_nights}</Text>
            <Text style={styles.col_rate_v}>{fmtINR(invoice.rate_per_night_paise)}</Text>
            <Text style={styles.col_amt_v}>{fmtINR(invoice.base_amount)}</Text>
          </View>
        </View>

        {/* ── Totals ── */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsTable}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{fmtINR(invoice.base_amount)}</Text>
            </View>

            {invoice.is_inter_state ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>IGST @ {gstLabel}</Text>
                <Text style={styles.totalValue}>{fmtINR(invoice.igst_amount)}</Text>
              </View>
            ) : (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>CGST @ {halfGst}%</Text>
                  <Text style={styles.totalValue}>{fmtINR(invoice.cgst_amount)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>SGST @ {halfGst}%</Text>
                  <Text style={styles.totalValue}>{fmtINR(invoice.sgst_amount)}</Text>
                </View>
              </>
            )}

            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Grand Total</Text>
              <Text style={styles.grandTotalValue}>{fmtINR(invoice.total_amount)}</Text>
            </View>
          </View>
        </View>

        {/* ── Amount in words ── */}
        <View style={styles.amountWords}>
          <Text>{amountWords}</Text>
        </View>

        {/* ── Notes ── */}
        {invoice.notes ? (
          <View style={styles.notesSection}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        ) : null}

        {/* ── Footer ── */}
        <View style={styles.footer} fixed>
          <View style={styles.footerDivider} />
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>
              This is a computer-generated invoice. No signature required.
            </Text>
            <View>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Authorised Signatory</Text>
            </View>
          </View>
          <Text style={[styles.footerText, { textAlign: 'center', marginTop: 4 }]}>
            {invoice.property_name} · {invoice.property_state}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
```

---

## Task 7: PDF Download Button (Dynamic Import)

**Files:**
- Create: `src/components/invoices/invoice-download-button.tsx`

`@react-pdf/renderer` requires browser environment. Use Next.js dynamic import.

- [ ] Create the button (this is a standalone client component that imports PDF renderer dynamically):

```typescript
'use client'

import dynamic from 'next/dynamic'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { InvoiceWithSnapshot } from '@/types'

// Dynamically import PDFDownloadLink — no SSR
const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then((mod) => mod.PDFDownloadLink),
  {
    ssr: false,
    loading: () => (
      <Button disabled size="sm" variant="outline">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Preparing PDF…
      </Button>
    ),
  }
)

// Dynamically import the PDF document component — no SSR
const InvoicePDF = dynamic(
  () => import('./invoice-pdf').then((mod) => mod.InvoicePDF),
  { ssr: false }
)

interface InvoiceDownloadButtonProps {
  invoice: InvoiceWithSnapshot
}

export function InvoiceDownloadButton({ invoice }: InvoiceDownloadButtonProps) {
  const fileName = `${invoice.invoice_number}.pdf`

  return (
    <PDFDownloadLink
      document={<InvoicePDF invoice={invoice} />}
      fileName={fileName}
    >
      {({ loading }) =>
        loading ? (
          <Button disabled size="sm" variant="outline">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Generating…
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="gap-1.5">
            <Download className="w-4 h-4" />
            Download PDF
          </Button>
        )
      }
    </PDFDownloadLink>
  )
}
```

---

## Task 8: Invoices List Page

**Files:**
- Replace: `src/app/(dashboard)/invoices/page.tsx`
- Create: `src/app/(dashboard)/invoices/_components/invoices-client.tsx`

- [ ] Replace `page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { InvoicesClient } from './_components/invoices-client'
import { usePropertyStore } from '@/stores/property-store'
import type { InvoiceWithSnapshot } from '@/types'

export default async function InvoicesPage() {
  const supabase = await createClient()

  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .is('deleted_at', null)
    .order('invoice_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  return <InvoicesClient invoices={(invoices ?? []) as InvoiceWithSnapshot[]} />
}
```

- [ ] Create `invoices-client.tsx` — filter bar (status, property) + sortable table:

```typescript
'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
// ... filter UI + table rendering
// Columns: Invoice #, Date, Guest, Property, Base, GST, Total, Status
// Filters: status (All/Draft/Sent/Paid/Cancelled), date range (this month / last month / all)
// Click row → /invoices/[id]
```

---

## Task 9: Invoice Detail Page

**Files:**
- Create: `src/app/(dashboard)/invoices/[id]/page.tsx`
- Create: `src/app/(dashboard)/invoices/[id]/invoice-detail.tsx`

The detail page shows all invoice fields and the download button.

- [ ] Create `page.tsx` (server):

```typescript
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InvoiceDetail } from './invoice-detail'
import type { InvoiceWithSnapshot } from '@/types'

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !invoice) notFound()

  return <InvoiceDetail invoice={invoice as InvoiceWithSnapshot} />
}
```

- [ ] Create `invoice-detail.tsx` (client):

```typescript
'use client'
// Shows: header (back link), invoice number + status badge
// Property info block, Bill To block, line items table, tax breakdown, grand total
// Status transition buttons: Draft → Mark Sent, Sent → Mark Paid, any → Cancel
// InvoiceDownloadButton (dynamic import)
// Dynamically imported InvoicePDFPreview (optional preview using BlobProvider)
```

---

## Task 10: Wire Booking Detail — Generate Invoice Button

**Files:**
- Modify: `src/app/(dashboard)/bookings/_components/booking-detail-sheet.tsx`

Add a "Generate Invoice" button that appears on `checked_out` bookings, calls `POST /api/invoices/generate`, then navigates to the new invoice.

- [ ] Add to the sheet, after the status transitions section:

```typescript
// When booking.status === 'checked_out' and no invoice exists yet:
// Show: <Button onClick={generateInvoice}>Generate Invoice</Button>
// On success: router.push(`/invoices/${invoiceId}`)
```
