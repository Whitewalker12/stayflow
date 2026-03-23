import { createClient } from '@/lib/supabase/server'
import { InvoicesClient } from './_components/invoices-client'
import type { Invoice, Property } from '@/types'

export default async function InvoicesPage() {
  const supabase = await createClient()

  const [invoicesRes, propertiesRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('*')
      .is('deleted_at', null)
      .order('invoice_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500),

    supabase
      .from('properties')
      .select('id, name, state')
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
  ])

  return (
    <InvoicesClient
      invoices={(invoicesRes.data ?? []) as Invoice[]}
      properties={(propertiesRes.data ?? []) as Property[]}
    />
  )
}
