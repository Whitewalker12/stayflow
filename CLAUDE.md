# StayFlow — Homestay Property Management System

## Project Overview

StayFlow is a SaaS PMS built specifically for Indian homestay operators managing 1-15 rooms across multiple properties. The MVP serves as a daily operational tool for homestay owners — booking management, guest registry, GST invoicing, and revenue dashboards.

**Design partner**: Nandini — operates 2 properties (4 rooms + 2 rooms = 6 rooms total). Every feature must work for her use case first.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 14 (App Router) | `/app` directory, server components by default |
| Database | Supabase (PostgreSQL) | RLS enabled, multi-tenant by `property_id` |
| Auth | Supabase Auth | Email + phone OTP (Indian users prefer phone) |
| UI | shadcn/ui + Tailwind CSS | Consistent component library |
| State | Zustand | Client-side state for UI, minimal usage |
| Data fetching | TanStack React Query | Server state, caching, optimistic updates |
| Payments | Razorpay | UPI, cards, netbanking — Indian payment methods |
| WhatsApp | Gupshup WhatsApp Business API | Phase 2 — notifications and guest comms |
| Email | Resend | Transactional emails, invoice delivery |
| Hosting | Vercel | Edge functions, ISR where needed |
| PDF | @react-pdf/renderer | GST invoice generation |

---

## Architecture Principles

### Multi-Tenancy
- Every table with user data MUST have an `owner_id` column (references `auth.users.id`)
- Properties belong to an owner: `properties.owner_id`
- All child data (rooms, bookings, guests, invoices) links to a `property_id`
- RLS policies enforce: users can ONLY access data where `property_id` belongs to their `owner_id`
- Never use `service_role` key in client code

### Database Conventions
- All tables use `snake_case`
- Primary keys: `id UUID DEFAULT gen_random_uuid()`
- Timestamps: `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ DEFAULT now()`
- Soft deletes: `deleted_at TIMESTAMPTZ` (nullable, null = active)
- Enums: use PostgreSQL enums, not string columns
- All monetary values stored as `INTEGER` (paise, not rupees) — display conversion in UI

### Code Conventions
- File naming: `kebab-case` for files, `PascalCase` for components
- Colocation: keep component, its types, and its hooks in the same directory
- Server components by default; add `'use client'` only when needed
- API routes in `/app/api/` — use route handlers, not pages
- Zod for all input validation (API routes AND forms)
- Never trust client data — validate server-side always

### Directory Structure
```
src/
├── app/
│   ├── (auth)/           # Login, signup, forgot password
│   ├── (dashboard)/      # Authenticated layout
│   │   ├── properties/   # Property + room management
│   │   ├── bookings/     # Booking CRUD, calendar view
│   │   ├── guests/       # Guest registry
│   │   ├── invoices/     # GST invoice generation
│   │   └── dashboard/    # Overview, metrics, today view
│   └── api/              # API route handlers
├── components/
│   ├── ui/               # shadcn/ui components
│   └── shared/           # App-specific shared components
├── lib/
│   ├── supabase/         # Client, server, middleware helpers
│   ├── validations/      # Zod schemas
│   ├── utils/            # Formatters, calculators, helpers
│   └── constants/        # Enums, config, GST rates
├── hooks/                # Custom React hooks
├── stores/               # Zustand stores
└── types/                # TypeScript type definitions
```

---

## Sprint 1 — Core PMS (MVP)

### Feature: Property & Room Setup
**What it does**: Owner creates properties and defines rooms within each.

- Create/edit/delete properties (name, address, state, type, check-in/out times)
- Create/edit/delete rooms within a property (name, type, base rate, max occupancy, amenities)
- Room types: `standard`, `deluxe`, `suite`, `dormitory`
- Room status: `available`, `occupied`, `maintenance`, `blocked`
- Property-level settings: default check-in time (2 PM), check-out time (11 AM), cancellation policy

**Nandini's test**: She should be able to set up her 2 properties with 4+2 rooms in under 5 minutes.

### Feature: Booking Management
**What it does**: Full booking lifecycle — create, confirm, check-in, check-out, cancel.

- Create booking: select property → room → dates → guest → rate → source
- Booking sources: `airbnb`, `makemytrip`, `booking_com`, `goibibo`, `direct`, `walk_in`, `phone`, `referral`
- Booking statuses: `pending` → `confirmed` → `checked_in` → `checked_out` | `cancelled` | `no_show`
- Calendar view: visual grid showing room availability across dates (this is the PRIMARY view)
- Availability check: prevent double bookings (enforce at DB level with exclusion constraint)
- Rate override per booking (base rate from room, but owner can adjust)
- Payment tracking: `pending`, `partial`, `paid`, `refunded`
- Payment methods: `upi`, `cash`, `bank_transfer`, `card`, `ota_collected`
- Notes field for special requests

**Nandini's test**: She should be able to log a phone booking in under 60 seconds.

### Feature: Guest Registry
**What it does**: Store guest information, ID documents, and visit history.

- Guest profile: name, phone, email, address, nationality
- ID document: type (Aadhaar, passport, driving license, voter ID), number, photo upload
- Visit history: all bookings linked to this guest
- Returning guest detection: auto-suggest when phone number matches
- Foreign guest flag: triggers Form C requirement (police reporting)
- Guest count per booking (adults, children)

**Nandini's test**: Check-in flow should capture guest ID in under 2 minutes.

### Feature: GST Invoicing
**What it does**: Auto-generate GST-compliant invoices for each booking.

- GST rates: 12% for rooms ≤ ₹7,500/night, 18% for rooms > ₹7,500/night
- Auto-calculate: base amount, GST (CGST + SGST for intra-state, IGST for inter-state)
- Invoice fields: invoice number (auto-sequential), date, guest details, property GSTIN, SAC code (9963), line items, tax breakdown, total
- PDF generation and download
- Invoice status: `draft`, `sent`, `paid`, `cancelled`
- Credit notes for cancellations/refunds

**Nandini's test**: Generate and send an invoice within 30 seconds of checkout.

### Feature: Dashboard
**What it does**: At-a-glance overview of today's operations and key metrics.

- Today's view: arrivals, departures, in-house guests, available rooms
- This week/month: occupancy rate, revenue, ADR (average daily rate), RevPAR
- Revenue by source (pie chart: Airbnb vs MMT vs direct vs walk-in)
- Property switcher: toggle between properties or see aggregate
- Quick actions: new booking, check-in guest, generate invoice

**Nandini's test**: Open app in the morning, immediately know what's happening today.

---

## Database Schema (Key Tables)

See `schema.sql` for full schema. Key relationships:

```
owners (auth.users)
  └── properties
        ├── rooms
        ├── bookings
        │     ├── booking_guests (junction)
        │     └── invoices
        └── (settings)

guests (global, linked via booking_guests)
```

---

## GST Calculation Rules

```typescript
// GST is calculated on the per-night rate, not total
function calculateGST(perNightRate: number, isInterState: boolean) {
  const rateInRupees = perNightRate / 100; // stored in paise
  const gstPercent = rateInRupees <= 7500 ? 12 : 18;

  if (isInterState) {
    return { igst: gstPercent, cgst: 0, sgst: 0 };
  }
  return { igst: 0, cgst: gstPercent / 2, sgst: gstPercent / 2 };
}

// SAC Code for accommodation: 9963
// HSN not applicable for services
```

---

## UI/UX Principles

- **Mobile-first**: Most homestay owners manage from their phone. Every view must work on 375px width.
- **Hindi + English**: UI labels in English, but support Hindi content in guest names, addresses, notes.
- **WhatsApp-native**: Actions should feel like WhatsApp — quick replies, status updates, minimal friction.
- **Calendar is king**: The booking calendar is the most-used view. It must load fast and be touch-friendly.
- **Sensible defaults**: Pre-fill check-in (2 PM), check-out (11 AM), GST rate, payment method (UPI). Reduce clicks.
- **Offline-aware**: Show last-synced data if connection drops. Queue actions for sync (Phase 2).

---

## Decision Log

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | PostgreSQL enums over string columns | Type safety, prevents invalid states, self-documenting | Sprint 1 |
| 2 | Money in paise (INTEGER) | Avoids floating point issues, standard practice | Sprint 1 |
| 3 | Supabase Auth with phone OTP | Indian users prefer phone auth, Supabase supports it natively | Sprint 1 |
| 4 | Calendar view as primary booking UI | Homestay owners think in "which room is free on which date" | Sprint 1 |
| 5 | Soft deletes everywhere | Audit trail, undo capability, data recovery | Sprint 1 |
| 6 | No channel manager in MVP | Complexity too high for sprint 1, manual entry is fine for 6 rooms | Sprint 1 |
| 7 | Exclusion constraint for availability | DB-level double-booking prevention, not just app-level | Sprint 1 |

---

## Changelog Format

```
## [version] - YYYY-MM-DD

### Added
- Feature description

### Changed
- What changed and why

### Fixed
- Bug description and resolution
```

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Razorpay (Phase 1 — payment tracking only, gateway in Phase 2)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

# Resend
RESEND_API_KEY=

# App
NEXT_PUBLIC_APP_URL=
```

---

## Important Notes

- This is a REAL product for a REAL user (Nandini). Every feature must be tested against her 2-property, 6-room setup.
- Do NOT over-engineer. No microservices, no event sourcing, no CQRS. Simple CRUD with good UX wins.
- Indian context matters: UPI > cards, WhatsApp > email, phone OTP > password, Hindi support > i18n framework.
- The calendar view is the most important screen. Get it right.
- All dates in IST (Asia/Kolkata). Store as UTC, display as IST.
