-- =============================================================================
-- StayFlow — Phase 2 Database Migrations
-- Run this entire file in Supabase SQL Editor (Dashboard → SQL Editor)
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS
-- =============================================================================


-- =============================================================================
-- 0. HELPER: updated_at trigger function
--    (CREATE OR REPLACE is safe if it already exists from Phase 1)
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 1. ALTER EXISTING TABLES
-- =============================================================================

-- 1a. properties — owner's WhatsApp number for command authentication
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS owner_phone VARCHAR(15);

COMMENT ON COLUMN properties.owner_phone
  IS 'Owner WhatsApp number (10 digits, no country code). '
     'Matched against incoming WhatsApp messages to identify the owner.';


-- 1b. rooms — secret token for secure iCal export URL
--     Format: /api/ical/[roomId]/[ical_export_token]
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS ical_export_token VARCHAR(32) UNIQUE;

-- Auto-fill for any existing rooms that don't have a token yet
UPDATE rooms
SET ical_export_token = substr(
  replace(replace(encode(gen_random_bytes(24), 'base64'), '+', 'A'), '/', 'B'),
  1, 32
)
WHERE ical_export_token IS NULL;

COMMENT ON COLUMN rooms.ical_export_token
  IS 'Secret token used in the iCal export URL. '
     'Prevents unauthorised access to booking availability data. '
     'Auto-generated; rotate by setting to NULL and running the trigger.';


-- =============================================================================
-- 2. NEW ENUM TYPES
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE expense_category AS ENUM (
    'cleaning',
    'maintenance',
    'utilities',
    'supplies',
    'staff',
    'ota_commission',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- already exists, skip
END $$;


-- =============================================================================
-- 3. NEW TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3a. checkin_tokens
--     One-time links sent to guests for self-check-in (no login required).
--     Token lives for 48 hours; completed_at is set when the guest submits.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkin_tokens (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  token         VARCHAR(12) NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '48 hours'),
  completed_at  TIMESTAMPTZ,                -- NULL = pending, set = guest submitted
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkin_tokens_token
  ON checkin_tokens (token);

CREATE INDEX IF NOT EXISTS idx_checkin_tokens_booking_id
  ON checkin_tokens (booking_id);

COMMENT ON TABLE checkin_tokens
  IS 'Short-lived tokens for the public guest self-check-in page (/checkin/[token]). '
     'Generated on booking confirmation; expires 48 hours after creation.';
COMMENT ON COLUMN checkin_tokens.token
  IS '12-character URL-safe alphanumeric token. Used as the path segment in the check-in URL.';
COMMENT ON COLUMN checkin_tokens.completed_at
  IS 'Timestamp when the guest successfully submitted the check-in form. NULL means not yet completed.';


-- ---------------------------------------------------------------------------
-- 3b. ical_connections
--     Stores the OTA iCal feed URL for a room (e.g. Airbnb calendar URL).
--     The sync cron job reads these every 30 minutes to import blocked dates.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ical_connections (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID         NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,         -- display label, e.g. "Airbnb"
  feed_url        TEXT         NOT NULL,          -- the .ics URL to fetch
  last_synced_at  TIMESTAMPTZ,                    -- NULL = never synced
  sync_error      TEXT,                           -- last error message, NULL = ok
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ical_connections_room_id
  ON ical_connections (room_id);

-- Partial index — cron job only queries active connections
CREATE INDEX IF NOT EXISTS idx_ical_connections_active
  ON ical_connections (room_id) WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_ical_connections_updated_at ON ical_connections;
CREATE TRIGGER trg_ical_connections_updated_at
  BEFORE UPDATE ON ical_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE ical_connections
  IS 'OTA iCal feed URLs per room. Synced every 30 min via cron to block unavailable dates.';
COMMENT ON COLUMN ical_connections.sync_error
  IS 'Stores the last sync failure message. Cleared to NULL on a successful sync.';


-- ---------------------------------------------------------------------------
-- 3c. external_blocks
--     Date ranges imported from OTA iCal feeds.
--     Shown as unavailable (grey/hatched) on the booking calendar.
--     Upserted on each sync; rows deleted if the UID disappears from the feed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS external_blocks (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id              UUID         NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  ical_connection_id   UUID         NOT NULL REFERENCES ical_connections(id) ON DELETE CASCADE,
  external_uid         VARCHAR(255) NOT NULL,   -- UID from iCal VEVENT (dedup key)
  start_date           DATE         NOT NULL,
  end_date             DATE         NOT NULL,
  summary              TEXT,                     -- SUMMARY from iCal (e.g. "Not available")
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT uq_external_blocks_connection_uid UNIQUE (ical_connection_id, external_uid),
  CONSTRAINT chk_external_blocks_dates CHECK (end_date > start_date)
);

-- Composite index for calendar availability queries
CREATE INDEX IF NOT EXISTS idx_external_blocks_room_dates
  ON external_blocks (room_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_external_blocks_connection_id
  ON external_blocks (ical_connection_id);

DROP TRIGGER IF EXISTS trg_external_blocks_updated_at ON external_blocks;
CREATE TRIGGER trg_external_blocks_updated_at
  BEFORE UPDATE ON external_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE external_blocks
  IS 'Blocked date ranges imported from OTA iCal feeds. '
     'Displayed on the booking calendar; prevent new bookings on these dates.';
COMMENT ON COLUMN external_blocks.external_uid
  IS 'The UID field from the iCal VEVENT. Used to upsert and detect deletions during sync.';


-- ---------------------------------------------------------------------------
-- 3d. expenses
--     Property-level expense tracking for profit/loss dashboards.
--     All amounts stored in paise (₹1 = 100 paise).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id            UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID              NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category      expense_category  NOT NULL,
  description   TEXT,
  amount_paise  INTEGER           NOT NULL CHECK (amount_paise > 0),
  expense_date  DATE              NOT NULL,
  receipt_url   TEXT,             -- Supabase Storage public URL (optional)
  created_at    TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ       NOT NULL DEFAULT now()
);

-- Primary query pattern: list expenses for a property, newest first
CREATE INDEX IF NOT EXISTS idx_expenses_property_date
  ON expenses (property_id, expense_date DESC);

-- For category-level aggregations in reports
CREATE INDEX IF NOT EXISTS idx_expenses_property_category
  ON expenses (property_id, category);

DROP TRIGGER IF EXISTS trg_expenses_updated_at ON expenses;
CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE expenses
  IS 'Property-level expenses (cleaning, maintenance, utilities, etc.) for P&L tracking.';
COMMENT ON COLUMN expenses.amount_paise
  IS 'Expense amount in paise. Display by dividing by 100 to get rupees.';
COMMENT ON COLUMN expenses.receipt_url
  IS 'Optional Supabase Storage URL for a receipt photo. Bucket: expense-receipts.';


-- ---------------------------------------------------------------------------
-- 3e. whatsapp_messages
--     Audit log of every WhatsApp message sent/received via Gupshup API.
--     Inbound messages from owners; outbound notifications/responses.
--     Insert is always done server-side (service role).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  direction      VARCHAR(10)  NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  phone          VARCHAR(15)  NOT NULL,   -- E.164 without '+', e.g. 919876543210
  message_type   VARCHAR(20)  NOT NULL DEFAULT 'text'
                   CHECK (message_type IN ('text', 'template', 'image')),
  content        TEXT,                    -- raw text or template params JSON
  template_id    VARCHAR(100),            -- Gupshup template ID (outbound only)
  status         VARCHAR(20)
                   CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  error_message  TEXT,                    -- populated when status = 'failed'
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Owner's message history view
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_owner_id
  ON whatsapp_messages (owner_id, created_at DESC);

-- Inbound lookup by phone (owner verification in webhook handler)
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone
  ON whatsapp_messages (phone, created_at DESC);

COMMENT ON TABLE whatsapp_messages
  IS 'Full audit log of all WhatsApp messages via Gupshup. '
     'Used for debugging, cost tracking, and conversation context.';
COMMENT ON COLUMN whatsapp_messages.phone
  IS 'Phone number in E.164 format without leading +. Example: 919876543210 for +91 98765 43210.';
COMMENT ON COLUMN whatsapp_messages.template_id
  IS 'Gupshup template ID for outbound template messages (required by WhatsApp Business API).';


-- =============================================================================
-- 4. HELPER FUNCTIONS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 4a. generate_checkin_token(booking_uuid)
--     Creates a unique 12-char URL-safe token for the given booking.
--     Called from server-side code after booking confirmation.
--     Returns the token string so the caller can embed it in the WhatsApp link.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_checkin_token(booking_uuid UUID)
RETURNS VARCHAR(12)
LANGUAGE plpgsql
SECURITY DEFINER  -- runs as owner so it can insert into checkin_tokens
SET search_path = public
AS $$
DECLARE
  new_token   VARCHAR(12);
  attempt     INT := 0;
  max_tries   CONSTANT INT := 20;
BEGIN
  LOOP
    attempt := attempt + 1;
    IF attempt > max_tries THEN
      RAISE EXCEPTION 'generate_checkin_token: could not produce a unique token after % attempts', max_tries;
    END IF;

    -- 9 random bytes → 12 base64 chars (no padding, since 9 is divisible by 3)
    -- Replace URL-unsafe chars: + → p, / → q
    new_token := translate(encode(gen_random_bytes(9), 'base64'), '+/', 'pq');

    -- Retry on collision (astronomically unlikely, but correct)
    BEGIN
      INSERT INTO checkin_tokens (booking_id, token, expires_at)
      VALUES (booking_uuid, new_token, now() + INTERVAL '48 hours');
      RETURN new_token;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION generate_checkin_token(UUID)
  IS 'Creates a unique 12-char alphanumeric check-in token for a booking. '
     'Inserts into checkin_tokens and returns the token for use in the WhatsApp link. '
     'Expires 48 hours from creation.';


-- ---------------------------------------------------------------------------
-- 4b. set_ical_export_token() — trigger function
--     Auto-generates a 32-char secret token for new rooms.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_ical_export_token()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ical_export_token IS NULL THEN
    -- 24 bytes → 32 base64 chars; replace URL-unsafe chars
    NEW.ical_export_token := translate(
      encode(gen_random_bytes(24), 'base64'),
      '+/=',
      'ABX'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rooms_set_ical_token ON rooms;
CREATE TRIGGER trg_rooms_set_ical_token
  BEFORE INSERT ON rooms
  FOR EACH ROW EXECUTE FUNCTION set_ical_export_token();

COMMENT ON FUNCTION set_ical_export_token()
  IS 'Trigger: auto-fills ical_export_token on new rooms if not provided.';


-- =============================================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- =============================================================================
-- Pattern (same as Phase 1):
--   Direct owner tables   → owner_id = auth.uid()
--   property_id tables    → property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid())
--   room_id tables        → room_id IN (SELECT r.id FROM rooms r JOIN properties p ... WHERE p.owner_id = auth.uid())
--   booking_id tables     → booking_id IN (SELECT b.id FROM bookings b JOIN properties p ... WHERE p.owner_id = auth.uid())
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 5a. checkin_tokens — owner access via booking → property → owner_id
--     Public check-in page uses service role server-side; no anon policy needed.
-- ---------------------------------------------------------------------------
ALTER TABLE checkin_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checkin_tokens: owner select"  ON checkin_tokens;
DROP POLICY IF EXISTS "checkin_tokens: owner insert"  ON checkin_tokens;
DROP POLICY IF EXISTS "checkin_tokens: owner update"  ON checkin_tokens;
DROP POLICY IF EXISTS "checkin_tokens: owner delete"  ON checkin_tokens;

CREATE POLICY "checkin_tokens: owner select" ON checkin_tokens
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN properties p ON p.id = b.property_id
      WHERE b.id = checkin_tokens.booking_id
        AND p.owner_id = auth.uid()
        AND b.deleted_at IS NULL
        AND p.deleted_at IS NULL
    )
  );

CREATE POLICY "checkin_tokens: owner insert" ON checkin_tokens
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN properties p ON p.id = b.property_id
      WHERE b.id = booking_id
        AND p.owner_id = auth.uid()
        AND b.deleted_at IS NULL
        AND p.deleted_at IS NULL
    )
  );

CREATE POLICY "checkin_tokens: owner update" ON checkin_tokens
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN properties p ON p.id = b.property_id
      WHERE b.id = checkin_tokens.booking_id
        AND p.owner_id = auth.uid()
        AND b.deleted_at IS NULL
        AND p.deleted_at IS NULL
    )
  );

CREATE POLICY "checkin_tokens: owner delete" ON checkin_tokens
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN properties p ON p.id = b.property_id
      WHERE b.id = checkin_tokens.booking_id
        AND p.owner_id = auth.uid()
        AND b.deleted_at IS NULL
        AND p.deleted_at IS NULL
    )
  );


-- ---------------------------------------------------------------------------
-- 5b. ical_connections — owner access via room → property → owner_id
-- ---------------------------------------------------------------------------
ALTER TABLE ical_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ical_connections: owner all" ON ical_connections;

CREATE POLICY "ical_connections: owner all" ON ical_connections
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rooms r
      JOIN properties p ON p.id = r.property_id
      WHERE r.id = ical_connections.room_id
        AND p.owner_id = auth.uid()
        AND r.deleted_at IS NULL
        AND p.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rooms r
      JOIN properties p ON p.id = r.property_id
      WHERE r.id = room_id
        AND p.owner_id = auth.uid()
        AND r.deleted_at IS NULL
        AND p.deleted_at IS NULL
    )
  );


-- ---------------------------------------------------------------------------
-- 5c. external_blocks — owner access via room → property → owner_id
-- ---------------------------------------------------------------------------
ALTER TABLE external_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "external_blocks: owner all" ON external_blocks;

CREATE POLICY "external_blocks: owner all" ON external_blocks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rooms r
      JOIN properties p ON p.id = r.property_id
      WHERE r.id = external_blocks.room_id
        AND p.owner_id = auth.uid()
        AND r.deleted_at IS NULL
        AND p.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rooms r
      JOIN properties p ON p.id = r.property_id
      WHERE r.id = room_id
        AND p.owner_id = auth.uid()
        AND r.deleted_at IS NULL
        AND p.deleted_at IS NULL
    )
  );


-- ---------------------------------------------------------------------------
-- 5d. expenses — owner access via property → owner_id (direct)
-- ---------------------------------------------------------------------------
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses: owner all" ON expenses;

CREATE POLICY "expenses: owner all" ON expenses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = expenses.property_id
        AND p.owner_id = auth.uid()
        AND p.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_id
        AND p.owner_id = auth.uid()
        AND p.deleted_at IS NULL
    )
  );


-- ---------------------------------------------------------------------------
-- 5e. whatsapp_messages — owner can read their own messages
--     Inserts are always done server-side via service role; no insert policy needed.
-- ---------------------------------------------------------------------------
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_messages: owner select" ON whatsapp_messages;

CREATE POLICY "whatsapp_messages: owner select" ON whatsapp_messages
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());


-- =============================================================================
-- 6. STORAGE BUCKETS
-- =============================================================================
-- Run these separately in Supabase Dashboard → Storage, OR via the Management API.
-- Supabase SQL Editor does not support storage bucket DDL directly.
-- Instructions:
--
-- Bucket 1: "checkin-documents"
--   - Public: false (private)
--   - Allowed MIME types: image/jpeg, image/png, image/webp, application/pdf
--   - Max file size: 5MB
--   - Path pattern for guest ID photos: {booking_id}/{guest_id}.{ext}
--
-- Bucket 2: "expense-receipts"
--   - Public: false (private)
--   - Allowed MIME types: image/jpeg, image/png, image/webp, application/pdf
--   - Max file size: 5MB
--   - Path pattern: {property_id}/{expense_id}.{ext}
--
-- RLS policies for both buckets (Storage → Policies):
--   SELECT: auth.uid() is owner of the property linked to the file
--   INSERT: same
--   (Use service role on server for simplicity, then add policies later)
-- =============================================================================


-- =============================================================================
-- DONE
-- =============================================================================
-- Summary of changes:
--   ALTER  properties     → added owner_phone VARCHAR(15)
--   ALTER  rooms          → added ical_export_token VARCHAR(32) UNIQUE
--   CREATE expense_category ENUM
--   CREATE checkin_tokens         (+ RLS + indexes)
--   CREATE ical_connections       (+ RLS + indexes + updated_at trigger)
--   CREATE external_blocks        (+ RLS + indexes + updated_at trigger)
--   CREATE expenses               (+ RLS + indexes + updated_at trigger)
--   CREATE whatsapp_messages      (+ RLS + indexes)
--   CREATE FUNCTION generate_checkin_token(UUID)
--   CREATE FUNCTION set_ical_export_token()  [trigger on rooms INSERT]
-- =============================================================================
