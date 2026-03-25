export type Property = {
  id: string
  owner_id: string
  name: string
  address_line1: string
  address_line2: string | null
  city: string
  pincode: string
  state: string
  phone: string | null
  email: string | null
  default_checkin_time: string  // "14:00"
  default_checkout_time: string // "11:00"
  cancellation_policy: string | null
  gstin: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type RoomType = 'standard' | 'deluxe' | 'suite' | 'dormitory'
export type RoomStatus = 'available' | 'occupied' | 'maintenance' | 'blocked'

export type Room = {
  id: string
  property_id: string
  name: string
  room_type: RoomType    // DB column: room_type
  status: RoomStatus
  base_rate_paise: number  // DB column: base_rate_paise (stored in paise)
  max_occupancy: number
  amenities: string[]
  floor_number: number | null  // DB column: floor_number
  description: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type BookingSource =
  | 'airbnb'
  | 'makemytrip'
  | 'booking_com'
  | 'goibibo'
  | 'direct'
  | 'walk_in'
  | 'phone'
  | 'referral'

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'no_show'

export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded'

export type PaymentMethod = 'upi' | 'cash' | 'bank_transfer' | 'card' | 'ota_collected'

export type Booking = {
  id: string
  property_id: string
  room_id: string
  check_in_date: string    // DB column: check_in_date
  check_out_date: string   // DB column: check_out_date
  status: BookingStatus
  source: BookingSource
  rate_per_night_paise: number   // DB column: rate_per_night_paise
  total_amount_paise: number     // DB column: total_amount_paise
  payment_status: PaymentStatus
  payment_method: PaymentMethod | null
  special_requests: string | null  // DB column: special_requests
  num_adults: number
  num_children: number
  num_nights: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type IdDocumentType = 'aadhaar' | 'passport' | 'driving_license' | 'voter_id'

export type Guest = {
  id: string
  full_name: string        // DB column: full_name
  phone: string | null
  email: string | null
  address: string | null   // DB column: address (single free-text field)
  city: string | null
  state: string | null
  pincode: string | null
  nationality: string      // default 'Indian'
  is_foreign_national: boolean
  id_document_type: IdDocumentType | null
  id_document_number: string | null
  id_document_photo_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type BookingGuest = {
  id: string
  booking_id: string
  guest_id: string
  is_primary: boolean
  created_at: string
}

// ─── iCal Sync ───────────────────────────────────────────────────────────────

export type ICalConnection = {
  id: string
  room_id: string
  name: string          // e.g. "Airbnb", "Booking.com"
  feed_url: string
  last_synced_at: string | null
  sync_error: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ExternalBlock = {
  id: string
  room_id: string
  ical_connection_id: string
  external_uid: string
  start_date: string    // YYYY-MM-DD
  end_date: string      // YYYY-MM-DD
  summary: string
  created_at: string
  updated_at: string
}

// ─── Invoices ────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled'

/** Line item stored inside the `line_items` JSONB column */
export type InvoiceLineItem = {
  description: string
  sac_code: string   // always "9963" for accommodation
  qty: number        // nights
  rate_paise: number
  amount_paise: number
}

/**
 * Extra snapshot data stored in `line_items` JSONB.
 * Includes per-item array + top-level snapshot fields.
 */
export type InvoiceLineItemsData = {
  items: InvoiceLineItem[]
  // Snapshot fields stored alongside items (no dedicated columns in DB)
  room_name: string
  num_nights: number
  rate_per_night_paise: number
  guest_state: string | null
  property_state: string
}

export type Invoice = {
  id: string
  booking_id: string
  property_id: string
  invoice_number: string
  invoice_date: string
  status: InvoiceStatus
  // Tax amounts — actual DB column names
  subtotal_paise: number        // DB: subtotal_paise
  cgst_amount_paise: number     // DB: cgst_amount_paise
  sgst_amount_paise: number     // DB: sgst_amount_paise
  igst_amount_paise: number     // DB: igst_amount_paise
  total_paise: number           // DB: total_paise
  // Tax rates (e.g. 6 for 6%, 0 for not applicable)
  cgst_rate: number             // DB: cgst_rate
  sgst_rate: number             // DB: sgst_rate
  igst_rate: number             // DB: igst_rate
  // Snapshot fields
  guest_name: string
  guest_address: string | null
  guest_gstin: string | null
  property_name: string
  property_address: string
  property_gstin: string | null
  notes: string | null
  // JSONB: stores line items + state snapshot for PDF
  line_items: InvoiceLineItemsData | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
