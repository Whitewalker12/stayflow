/**
 * Minimal iCal (RFC 5545) parser.
 * Handles line folding, DATE-only and DATETIME formats, property parameters.
 */

export interface ICalEvent {
  uid: string
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
  summary: string
}

/**
 * Unfold RFC 5545 line continuations:
 * CRLF + single whitespace = continuation of previous line.
 */
function unfold(text: string): string {
  return text.replace(/\r?\n[ \t]/g, '')
}

/**
 * Extract YYYY-MM-DD from a DTSTART or DTEND property line.
 * Handles all common formats:
 *   DTSTART;VALUE=DATE:20250415
 *   DTSTART:20250415T140000Z
 *   DTSTART;TZID=Asia/Kolkata:20250415T140000
 */
function parseDateLine(line: string): string {
  const colonIdx = line.indexOf(':')
  if (colonIdx < 0) throw new Error(`No colon in date line: ${line}`)

  const value = line.slice(colonIdx + 1).trim()
  const match = value.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!match) throw new Error(`Cannot parse date from: ${value}`)

  return `${match[1]}-${match[2]}-${match[3]}`
}

export function parseICal(icalText: string): ICalEvent[] {
  const unfolded = unfold(icalText)
  const lines = unfolded.split(/\r?\n/)
  const events: ICalEvent[] = []

  let current: Partial<ICalEvent> | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (line === 'BEGIN:VEVENT') {
      current = {}
    } else if (line === 'END:VEVENT') {
      if (current?.uid && current.startDate && current.endDate) {
        events.push({
          uid: current.uid,
          startDate: current.startDate,
          endDate: current.endDate,
          summary: current.summary ?? 'Blocked',
        })
      }
      current = null
    } else if (current !== null) {
      if (line.startsWith('UID:')) {
        current.uid = line.slice(4).trim()
      } else if (line.startsWith('DTSTART')) {
        try { current.startDate = parseDateLine(line) } catch (_) { /* ignore bad dates */ }
      } else if (line.startsWith('DTEND')) {
        try { current.endDate = parseDateLine(line) } catch (_) { /* ignore bad dates */ }
      } else if (line.startsWith('SUMMARY:')) {
        current.summary = line.slice(8).trim()
      }
    }
  }

  return events
}
