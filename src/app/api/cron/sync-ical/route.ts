/**
 * Cron: Sync all active iCal feeds into external_blocks.
 *
 * Schedule: every 30 minutes — "every-30 * * * *" — in vercel.json
 *
 * Also callable manually from the Settings page (session auth).
 *
 * For each active ical_connection:
 *   1. Fetch the remote iCal feed URL
 *   2. Parse VEVENT blocks into ICalEvent[]
 *   3. Upsert into external_blocks (by ical_connection_id + external_uid)
 *   4. Delete stale blocks that are no longer in the feed
 *   5. Update last_synced_at (or sync_error on failure)
 */

import { type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseICal } from '@/lib/ical/parser'
import { verifyCronOrSession } from '@/lib/whatsapp/cron-helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Auth: cron secret OR dashboard session
  try {
    await verifyCronOrSession(request)
  } catch (resp) {
    return resp as Response
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  // Fetch all active iCal connections
  const { data: connections, error: connErr } = await supabase
    .from('ical_connections')
    .select('id, room_id, feed_url, name')
    .eq('is_active', true)

  if (connErr) {
    console.error('[iCal Sync] Failed to fetch connections:', connErr.message)
    return Response.json({ error: connErr.message }, { status: 500 })
  }

  const results: {
    id: string
    name: string
    status: 'ok' | 'error'
    count?: number
    error?: string
  }[] = []

  for (const conn of connections ?? []) {
    try {
      // Fetch iCal feed with 10s timeout
      const response = await fetch(conn.feed_url, {
        headers: { 'User-Agent': 'HomeStayPMS/1.0 (+https://homestaypms.com)' },
        signal: AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      const icalText = await response.text()
      const events = parseICal(icalText)

      if (events.length > 0) {
        // Upsert events — update dates/summary if UID already exists
        const blocks = events.map((e) => ({
          room_id: conn.room_id,
          ical_connection_id: conn.id,
          external_uid: e.uid,
          start_date: e.startDate,
          end_date: e.endDate,
          summary: e.summary,
          updated_at: now,
        }))

        const { error: upsertErr } = await supabase
          .from('external_blocks')
          .upsert(blocks, { onConflict: 'ical_connection_id,external_uid' })

        if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`)
      }

      // Delete stale blocks whose UIDs are no longer in the feed
      const { data: existing } = await supabase
        .from('external_blocks')
        .select('id, external_uid')
        .eq('ical_connection_id', conn.id)

      const newUidSet = new Set(events.map((e) => e.uid))
      const staleIds = (existing ?? [])
        .filter((b) => !newUidSet.has(b.external_uid))
        .map((b) => b.id)

      if (staleIds.length > 0) {
        await supabase.from('external_blocks').delete().in('id', staleIds)
        console.log(`[iCal Sync] Deleted ${staleIds.length} stale blocks for ${conn.name}`)
      }

      // Mark connection as synced
      await supabase
        .from('ical_connections')
        .update({ last_synced_at: now, sync_error: null, updated_at: now })
        .eq('id', conn.id)

      results.push({ id: conn.id, name: conn.name, status: 'ok', count: events.length })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[iCal Sync] Failed to sync ${conn.name}:`, msg)

      await supabase
        .from('ical_connections')
        .update({ sync_error: msg, updated_at: now })
        .eq('id', conn.id)

      results.push({ id: conn.id, name: conn.name, status: 'error', error: msg })
    }
  }

  return Response.json({
    ok: true,
    synced: results.length,
    results,
  })
}
