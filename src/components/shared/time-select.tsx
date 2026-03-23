'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** Generate HH:MM slots every 30 minutes from 00:00 to 23:30 */
function makeSlots() {
  const slots: { value: string; label: string }[] = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      const value = `${hh}:${mm}`

      // 12-hour display
      const period = h < 12 ? 'AM' : 'PM'
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
      const label = `${hour12}:${mm} ${period}`

      slots.push({ value, label })
    }
  }
  return slots
}

const TIME_SLOTS = makeSlots()

interface TimeSelectProps {
  value: string
  onChange: (value: string) => void
  id?: string
  className?: string
  disabled?: boolean
}

/**
 * Dropdown time picker with 30-minute intervals.
 * Stores values in HH:MM (24-hour) format — matching DB column type.
 */
export function TimeSelect({ value, onChange, id, className, disabled }: TimeSelectProps) {
  // Find label for the current value (for display in trigger)
  const selectedLabel =
    TIME_SLOTS.find((s) => s.value === value)?.label ??
    // Fallback: show raw value if it's not in the list (e.g. legacy data)
    value

  return (
    <Select value={value} onValueChange={(v) => { if (v) onChange(v) }} disabled={disabled}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder="Select time">
          {selectedLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {TIME_SLOTS.map((slot) => (
          <SelectItem key={slot.value} value={slot.value} label={slot.label}>
            <span className="tabular-nums">{slot.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
