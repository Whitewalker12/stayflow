/**
 * Format paise (integer) to a human-readable INR string.
 * e.g. 250000 → "₹2,500"
 */
export function formatCurrency(paise: number): string {
  const rupees = paise / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(rupees)
}

/** Convert rupees (user input) to paise for storage */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100)
}

/** Convert paise to rupees for display in form inputs */
export function paiseToRupees(paise: number): number {
  return paise / 100
}
