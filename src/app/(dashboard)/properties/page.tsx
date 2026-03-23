import Link from 'next/link'
import { Building2, Plus, BedDouble } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatAddress } from '@/lib/validations/property'

export default async function PropertiesPage() {
  const supabase = await createClient()

  // Fetch properties with room counts
  const { data: properties } = await supabase
    .from('properties')
    .select('*, rooms(count)')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  const list = properties ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Properties</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {list.length === 0
              ? 'Add your first property to get started'
              : `${list.length} propert${list.length === 1 ? 'y' : 'ies'}`}
          </p>
        </div>
        <Link href="/properties/new">
          <Button size="sm">
            <Plus className="w-3.5 h-3.5" />
            Add property
          </Button>
        </Link>
      </div>

      {/* List */}
      {list.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((property) => {
            const roomCount =
              (property.rooms as unknown as { count: number }[] | undefined)?.[0]?.count ?? 0

            return (
              <Link
                key={property.id}
                href={`/properties/${property.id}`}
                className="group block bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                {/* Icon + badge */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-gray-200 transition-colors">
                    <Building2 className="w-5 h-5 text-gray-500" />
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    <BedDouble className="w-3 h-3 mr-1" />
                    {roomCount} {roomCount === 1 ? 'room' : 'rooms'}
                  </Badge>
                </div>

                {/* Name + address */}
                <h3 className="font-semibold text-gray-900 truncate group-hover:text-gray-700">
                  {property.name}
                </h3>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                  {formatAddress(property)}
                </p>

                {/* Check-in / out */}
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs text-gray-400">
                    <span className="font-medium text-gray-600">Check-in</span>{' '}
                    {property.default_checkin_time}
                  </div>
                  <div className="text-xs text-gray-400">
                    <span className="font-medium text-gray-600">Check-out</span>{' '}
                    {property.default_checkout_time}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Building2 className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-900 font-medium mb-1">No properties yet</p>
          <p className="text-sm text-gray-500 mb-6 text-center max-w-xs">
            Set up your properties and rooms to start managing bookings.
          </p>
          <Link href="/properties/new">
            <Button>
              <Plus className="w-4 h-4" />
              Add your first property
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
