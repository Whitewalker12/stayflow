// ── Indian States (for GST intra/inter-state detection) ───────────────────────

export const INDIAN_STATES: { value: string; label: string }[] = [
  { value: 'Andhra Pradesh', label: 'Andhra Pradesh' },
  { value: 'Arunachal Pradesh', label: 'Arunachal Pradesh' },
  { value: 'Assam', label: 'Assam' },
  { value: 'Bihar', label: 'Bihar' },
  { value: 'Chhattisgarh', label: 'Chhattisgarh' },
  { value: 'Goa', label: 'Goa' },
  { value: 'Gujarat', label: 'Gujarat' },
  { value: 'Haryana', label: 'Haryana' },
  { value: 'Himachal Pradesh', label: 'Himachal Pradesh' },
  { value: 'Jharkhand', label: 'Jharkhand' },
  { value: 'Karnataka', label: 'Karnataka' },
  { value: 'Kerala', label: 'Kerala' },
  { value: 'Madhya Pradesh', label: 'Madhya Pradesh' },
  { value: 'Maharashtra', label: 'Maharashtra' },
  { value: 'Manipur', label: 'Manipur' },
  { value: 'Meghalaya', label: 'Meghalaya' },
  { value: 'Mizoram', label: 'Mizoram' },
  { value: 'Nagaland', label: 'Nagaland' },
  { value: 'Odisha', label: 'Odisha' },
  { value: 'Punjab', label: 'Punjab' },
  { value: 'Rajasthan', label: 'Rajasthan' },
  { value: 'Sikkim', label: 'Sikkim' },
  { value: 'Tamil Nadu', label: 'Tamil Nadu' },
  { value: 'Telangana', label: 'Telangana' },
  { value: 'Tripura', label: 'Tripura' },
  { value: 'Uttar Pradesh', label: 'Uttar Pradesh' },
  { value: 'Uttarakhand', label: 'Uttarakhand' },
  { value: 'West Bengal', label: 'West Bengal' },
  // Union Territories
  { value: 'Andaman and Nicobar Islands', label: 'Andaman & Nicobar Islands' },
  { value: 'Chandigarh', label: 'Chandigarh' },
  { value: 'Dadra and Nagar Haveli and Daman and Diu', label: 'Dadra, NH & Daman and Diu' },
  { value: 'Delhi', label: 'Delhi' },
  { value: 'Jammu and Kashmir', label: 'Jammu & Kashmir' },
  { value: 'Ladakh', label: 'Ladakh' },
  { value: 'Lakshadweep', label: 'Lakshadweep' },
  { value: 'Puducherry', label: 'Puducherry' },
]

export const INDIAN_STATE_VALUES = INDIAN_STATES.map((s) => s.value)

// ── Room Amenities ─────────────────────────────────────────────────────────────

export const ROOM_AMENITIES = [
  'Air Conditioning',
  'Heating',
  'Wi-Fi',
  'TV',
  'Minibar',
  'Safe',
  'Desk',
  'Wardrobe',
  'Attached Bathroom',
  'Hot Water',
  'Geyser',
  'Balcony',
  'Mountain View',
  'Garden View',
  'Pool View',
  'Sea View',
  'King Bed',
  'Queen Bed',
  'Twin Beds',
  'Bunk Bed',
  'Sofa Bed',
  'Kitchenette',
  'Refrigerator',
  'Microwave',
  'Kettle',
  'Room Service',
  'Housekeeping',
  'Laundry Service',
  'Parking',
  'Wheelchair Accessible',
  'Non-Smoking',
  'Smoking Allowed',
  'Pet Friendly',
] as const

export type RoomAmenity = (typeof ROOM_AMENITIES)[number]

// ── Booking Sources ────────────────────────────────────────────────────────────

export const BOOKING_SOURCE_LABELS: Record<string, string> = {
  airbnb: 'Airbnb',
  makemytrip: 'MakeMyTrip',
  booking_com: 'Booking.com',
  goibibo: 'Goibibo',
  direct: 'Direct',
  walk_in: 'Walk-in',
  phone: 'Phone',
  referral: 'Referral',
}

export const BOOKING_SOURCES = Object.keys(BOOKING_SOURCE_LABELS)

// ── Payment Methods ────────────────────────────────────────────────────────────

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  upi: 'UPI',
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  card: 'Card',
  ota_collected: 'OTA Collected',
}

export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS)

// ── Booking Status ─────────────────────────────────────────────────────────────

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  checked_out: 'Checked Out',
  cancelled: 'Cancelled',
  no_show: 'No Show',
}

// ── GST ────────────────────────────────────────────────────────────────────────

/** Rooms priced at or below this threshold use 12% GST; above → 18% */
export const GST_THRESHOLD_RUPEES = 7500
export const GST_THRESHOLD_PAISE = 750_000

export const GST_RATE_LOW = 12   // % for ≤ ₹7,500/night
export const GST_RATE_HIGH = 18  // % for > ₹7,500/night

/** SAC Code for accommodation services */
export const SAC_CODE_ACCOMMODATION = '9963'

// ── Room Types ─────────────────────────────────────────────────────────────────

export const ROOM_TYPE_LABELS: Record<string, string> = {
  standard: 'Standard',
  deluxe: 'Deluxe',
  suite: 'Suite',
  dormitory: 'Dormitory',
}

// ── Invoice Status ─────────────────────────────────────────────────────────────

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

// ── Property types ─────────────────────────────────────────────────────────────

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  homestay: 'Homestay',
  guesthouse: 'Guest House',
  boutique_hotel: 'Boutique Hotel',
  villa: 'Villa',
  farmstay: 'Farmstay',
  hostel: 'Hostel',
}

// ── ID Document Types ──────────────────────────────────────────────────────────

export const ID_DOCUMENT_LABELS: Record<string, string> = {
  aadhaar: 'Aadhaar Card',
  passport: 'Passport',
  driving_license: 'Driving License',
  voter_id: 'Voter ID',
  pan: 'PAN Card',
}

// ── Nationality ────────────────────────────────────────────────────────────────

export const NATIONALITIES = [
  'Indian',
  'American',
  'British',
  'Australian',
  'Canadian',
  'French',
  'German',
  'Italian',
  'Japanese',
  'Chinese',
  'Russian',
  'Brazilian',
  'South African',
  'Singaporean',
  'UAE',
  'Other',
]

// ── Date & Time ────────────────────────────────────────────────────────────────

export const IST_TIMEZONE = 'Asia/Kolkata'

export const DEFAULT_CHECKIN_TIME = '14:00'
export const DEFAULT_CHECKOUT_TIME = '11:00'
