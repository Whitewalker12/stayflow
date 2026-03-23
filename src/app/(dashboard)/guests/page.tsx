'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Users, Plus, Search, Globe } from 'lucide-react'
import type { Guest } from '@/types'
import { format, parseISO } from 'date-fns'

type GuestWithVisits = Guest & {
  visit_count: number
  last_visit: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), 'd MMM yyyy')
  } catch {
    return '—'
  }
}

export default function GuestsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [guests, setGuests] = useState<GuestWithVisits[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchGuests = useCallback(async (search: string) => {
    setLoading(true)
    let q = supabase
      .from('guests')
      .select('*, booking_guests(booking_id, bookings(check_in_date))')
      .is('deleted_at', null)
      .order('full_name')
      .limit(100)

    if (search.trim()) {
      q = q.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`)
    }

    const { data } = await q
    const list: GuestWithVisits[] = (data ?? []).map((g) => {
      const bookingGuests = (g.booking_guests as { booking_id: string; bookings: { check_in_date: string } | null }[] | undefined) ?? []
      const visits = bookingGuests.filter((bg) => bg.bookings !== null)
      const dates = visits
        .map((bg) => bg.bookings?.check_in_date)
        .filter(Boolean) as string[]
      dates.sort((a, b) => b.localeCompare(a))

      return {
        ...g,
        visit_count: visits.length,
        last_visit: dates[0] ?? null,
      }
    })

    setGuests(list)
    setLoading(false)
  }, [supabase])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => fetchGuests(query), 300)
    return () => clearTimeout(t)
  }, [query, fetchGuests])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Guests</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? 'Loading…' : `${guests.length} guest${guests.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link href="/guests/new">
          <Button size="sm">
            <Plus className="w-3.5 h-3.5" />
            Add guest
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <Input
          placeholder="Search by name or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Table */}
      {!loading && guests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Users className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-900 font-medium mb-1">
            {query ? 'No guests found' : 'No guests yet'}
          </p>
          <p className="text-sm text-gray-500 mb-6 text-center max-w-xs">
            {query
              ? `No results for "${query}". Try a different name or phone number.`
              : 'Add your first guest to start building your registry.'}
          </p>
          {!query && (
            <Link href="/guests/new">
              <Button>
                <Plus className="w-4 h-4" />
                Add first guest
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Phone</TableHead>
                <TableHead className="hidden md:table-cell">Nationality</TableHead>
                <TableHead className="hidden sm:table-cell">Visits</TableHead>
                <TableHead className="hidden md:table-cell">Last visit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-gray-100 rounded animate-pulse w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : guests.map((guest) => (
                    <TableRow
                      key={guest.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/guests/${guest.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0">
                            {guest.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{guest.full_name}</p>
                            {guest.phone && (
                              <p className="text-xs text-gray-400 sm:hidden">{guest.phone}</p>
                            )}
                          </div>
                          {guest.is_foreign_national && (
                            <Globe className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-label="Foreign national" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-gray-600">
                        {guest.phone ?? '—'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {guest.is_foreign_national ? (
                          <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                            {guest.nationality}
                          </Badge>
                        ) : (
                          <span className="text-gray-600">{guest.nationality}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-gray-600">
                        {guest.visit_count > 0 ? (
                          <span className="font-medium text-gray-900">{guest.visit_count}</span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-gray-500">
                        {formatDate(guest.last_visit)}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
