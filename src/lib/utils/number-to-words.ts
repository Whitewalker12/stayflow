/**
 * Convert a non-negative integer (rupees, whole number) to Indian English words.
 *
 * Uses the Indian numbering system: thousands, lakhs, crores.
 *
 * Examples:
 *   12350       → "Rupees Twelve Thousand Three Hundred and Fifty Only"
 *   100000      → "Rupees One Lakh Only"
 *   10012350    → "Rupees One Crore Twelve Thousand Three Hundred and Fifty Only"
 *   0           → "Rupees Zero Only"
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

/** Convert 0–99 to words */
function twoDigits(n: number): string {
  if (n === 0) return ''
  if (n < 20) return ONES[n]
  const tenPart = TENS[Math.floor(n / 10)]
  const onePart = ONES[n % 10]
  return onePart ? `${tenPart} ${onePart}` : tenPart
}

/** Convert 0–999 to words */
function threeDigits(n: number): string {
  if (n === 0) return ''
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`)
  if (rest) {
    // use "and" only when hundreds digit is present
    if (hundreds) parts.push('and')
    parts.push(twoDigits(rest))
  }
  return parts.join(' ')
}

/**
 * Convert a number (rupees) to Indian English words.
 * Paise are ignored (pass Math.floor(paise / 100) for invoice amounts).
 */
export function numberToWords(rupees: number): string {
  const n = Math.floor(Math.abs(rupees))
  if (n === 0) return 'Rupees Zero Only'

  // Indian numbering breakdown
  const crore    = Math.floor(n / 1_00_00_000)
  const lakh     = Math.floor((n % 1_00_00_000) / 1_00_000)
  const thousand = Math.floor((n % 1_00_000) / 1_000)
  const rest     = n % 1_000

  const parts: string[] = []

  if (crore) {
    parts.push(`${threeDigits(crore)} Crore`)
  }
  if (lakh) {
    parts.push(`${twoDigits(lakh)} Lakh`)
  }
  if (thousand) {
    parts.push(`${threeDigits(thousand)} Thousand`)
  }
  if (rest) {
    parts.push(threeDigits(rest))
  }

  return `Rupees ${parts.join(' ')} Only`
}

/**
 * Convenience: convert paise amount to words.
 * e.g. 1235000 paise → "Rupees Twelve Thousand Three Hundred and Fifty Only"
 */
export function paiseToWords(paise: number): string {
  return numberToWords(Math.floor(paise / 100))
}
