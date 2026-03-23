import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/bookings/check-availability
 *
 * Query params:
 *   room_id          - UUID of the room to check
 *   check_in_date    - YYYY-MM-DD
 *   check_out_date   - YYYY-MM-DD
 *   exclude_booking_id  - (optional) UUID to exclude (for edits)
 *
 * Response:
 *   { available: boolean, conflicting_bookings: Array<{ id, check_in_date, check_out_date, status }> }
 *
 * Conflict logic: existing booking overlaps when:
 *   existing.check_in_date < new check_out_date  AND  existing.check_out_date > new check_in_date
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const room_id = searchParams.get('room_id')
  const check_in_date = searchParams.get('check_in_date')
  const check_out_date = searchParams.get('check_out_date')
  const exclude_booking_id = searchParams.get('exclude_booking_id')

  if (!room_id || !check_in_date || !check_out_date) {
    return NextResponse.json(
      { error: 'Missing required params: room_id, check_in_date, check_out_date' },
      { status: 400 }
    )
  }

  // Basic date format validation
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(check_in_date) || !dateRegex.test(check_out_date)) {
    return NextResponse.json(
      { error: 'Dates must be in YYYY-MM-DD format' },
      { status: 400 }
    )
  }

  if (check_out_date <= check_in_date) {
    return NextResponse.json(
      { error: 'check_out_date must be after check_in_date' },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  // Verify auth
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let query = supabase
    .from('bookings')
    .select('id, check_in_date, check_out_date, status')
    .eq('room_id', room_id)
    .is('deleted_at', null)
    // Exclude terminal statuses that don't block availability
    .not('status', 'in', '("cancelled","no_show")')
    // Overlap condition: existing starts before new ends AND existing ends after new starts
    .lt('check_in_date', check_out_date)
    .gt('check_out_date', check_in_date)

  if (exclude_booking_id) {
    query = query.neq('id', exclude_booking_id)
  }

  const { data: conflicting, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    available: (conflicting ?? []).length === 0,
    conflicting_bookings: conflicting ?? [],
  })
}
