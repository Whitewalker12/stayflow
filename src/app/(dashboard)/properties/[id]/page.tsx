import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PropertyDetail } from './property-detail'

export default async function PropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams
  const supabase = await createClient()

  const [{ data: property }, { data: rooms }] = await Promise.all([
    supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('rooms')
      .select('*')
      .eq('property_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
  ])

  if (!property) notFound()

  return (
    <PropertyDetail
      property={property}
      initialRooms={rooms ?? []}
      initialTab={tab === 'rooms' ? 'rooms' : tab === 'ical' ? 'ical' : 'details'}
    />
  )
}
