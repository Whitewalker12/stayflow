/**
 * GST calculation for accommodation services (SAC 9963).
 *
 * Rate tiers (based on per-night rate, NOT total):
 *   ≤ ₹7,500/night  →  12% GST  (CGST 6% + SGST 6%  OR  IGST 12%)
 *   > ₹7,500/night  →  18% GST  (CGST 9% + SGST 9%  OR  IGST 18%)
 *
 * Place of supply:
 *   Intra-state (same state): CGST + SGST (each = gstPercent / 2)
 *   Inter-state (different):  IGST (full gstPercent)
 *
 * All monetary values in PAISE (integers).
 */

/** ₹7,500 in paise */
const TIER_THRESHOLD_PAISE = 750_000

export type GSTBreakdown = {
  gstPercent: 12 | 18     // total GST rate
  cgstRate: number         // e.g. 6 (for 6%) — 0 if inter-state
  sgstRate: number         // e.g. 6 (for 6%) — 0 if inter-state
  igstRate: number         // e.g. 12 (for 12%) — 0 if intra-state
  subtotalPaise: number    // base taxable amount (rate × nights)
  cgstAmountPaise: number  // 0 if inter-state
  sgstAmountPaise: number  // 0 if inter-state
  igstAmountPaise: number  // 0 if intra-state
  totalPaise: number       // subtotal + all tax
  isInterState: boolean
}

/**
 * Compute GST for an invoice line item.
 *
 * @param ratePerNightPaise  Room rate per night in paise — determines 12% vs 18% tier
 * @param numNights          Number of nights — determines base amount
 * @param propertyState      Property's registered state (Place of Supply)
 * @param guestState         Guest's home state (null/empty = treat as intra-state)
 */
export function computeInvoiceGST(
  ratePerNightPaise: number,
  numNights: number,
  propertyState: string,
  guestState: string | null | undefined,
): GSTBreakdown {
  const gstPercent: 12 | 18 = ratePerNightPaise <= TIER_THRESHOLD_PAISE ? 12 : 18
  const halfRate = gstPercent / 2  // 6 or 9

  const subtotalPaise = ratePerNightPaise * numNights

  // Inter-state when guest state is known, non-empty, and different from property state
  const normaliseState = (s: string | null | undefined) =>
    (s ?? '').trim().toLowerCase()

  const isInterState =
    !!guestState &&
    normaliseState(guestState) !== '' &&
    normaliseState(guestState) !== normaliseState(propertyState)

  // Compute tax
  const totalGSTPaise = Math.round((subtotalPaise * gstPercent) / 100)

  let cgstAmountPaise = 0
  let sgstAmountPaise = 0
  let igstAmountPaise = 0
  let cgstRate = 0
  let sgstRate = 0
  let igstRate = 0

  if (isInterState) {
    igstAmountPaise = totalGSTPaise
    igstRate = gstPercent
  } else {
    // Split equally; odd-paise remainder goes to CGST
    sgstAmountPaise = Math.floor(totalGSTPaise / 2)
    cgstAmountPaise = totalGSTPaise - sgstAmountPaise
    cgstRate = halfRate
    sgstRate = halfRate
  }

  return {
    gstPercent,
    cgstRate,
    sgstRate,
    igstRate,
    subtotalPaise,
    cgstAmountPaise,
    sgstAmountPaise,
    igstAmountPaise,
    totalPaise: subtotalPaise + cgstAmountPaise + sgstAmountPaise + igstAmountPaise,
    isInterState,
  }
}
