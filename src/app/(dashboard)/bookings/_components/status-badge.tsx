import { Badge } from '@/components/ui/badge'
import type { BookingStatus } from '@/types'

export const STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; className: string; calendarClass: string }
> = {
  pending: {
    label: 'Pending',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    calendarClass: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  confirmed: {
    label: 'Confirmed',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    calendarClass: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  checked_in: {
    label: 'Checked In',
    className: 'bg-green-50 text-green-700 border-green-200',
    calendarClass: 'bg-green-100 text-green-800 border-green-300',
  },
  checked_out: {
    label: 'Checked Out',
    className: 'bg-gray-50 text-gray-600 border-gray-200',
    calendarClass: 'bg-gray-100 text-gray-600 border-gray-300',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-red-50 text-red-600 border-red-200',
    calendarClass: 'bg-red-100 text-red-700 border-red-300',
  },
  no_show: {
    label: 'No Show',
    className: 'bg-orange-50 text-orange-700 border-orange-200',
    calendarClass: 'bg-orange-100 text-orange-800 border-orange-300',
  },
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { label, className } = STATUS_CONFIG[status]
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  )
}
