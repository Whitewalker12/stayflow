/**
 * POST /api/whatsapp/webhook
 *
 * Receives incoming WhatsApp messages from Gupshup.
 *
 * Security: Gupshup signs the request body with HMAC-SHA256 using the
 * webhook secret. We verify this before processing.
 *
 * Gupshup webhook payload shape:
 * {
 *   "type": "message",
 *   "payload": {
 *     "id": "...",
 *     "source": "919876543210",
 *     "type": "text",
 *     "payload": { "text": "TODAY" },
 *     "sender": {
 *       "phone": "919876543210",
 *       "name": "Rahul"
 *     }
 *   },
 *   "app": "HomeStayPMS",
 *   "timestamp": 1712345678901
 * }
 *
 * Phase 2 (Prompt 5) will add command parsing. For now:
 * - Verify signature
 * - Log the inbound message
 * - Reply "Message received" as a text message
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { logInboundMessage, sendTextMessage } from '@/lib/whatsapp/client'
import { createServiceClient } from '@/lib/supabase/service'

// ---------------------------------------------------------------------------
// Types for the Gupshup webhook payload
// ---------------------------------------------------------------------------

interface GupshupSender {
  phone: string
  name?: string
  country_code?: string
}

interface GupshupTextPayload {
  text: string
}

interface GupshupImagePayload {
  url: string
  caption?: string
}

interface GupshupMessagePayload {
  id: string
  source: string
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | string
  payload: GupshupTextPayload | GupshupImagePayload | Record<string, unknown>
  sender?: GupshupSender
}

interface GupshupWebhookBody {
  type: 'message' | 'message-event' | 'user-event' | string
  payload: GupshupMessagePayload
  app?: string
  timestamp?: number
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Gupshup sends the HMAC-SHA256 signature in the x-hub-signature header.
 * Format: "sha256=<hex_digest>"
 *
 * We compute HMAC of the raw request body and compare with timing-safe equality
 * to prevent timing attacks.
 */
async function verifySignature(request: NextRequest, rawBody: string): Promise<boolean> {
  const secret = process.env.GUPSHUP_WEBHOOK_SECRET
  if (!secret) {
    // If no secret is configured, skip verification (dev mode only)
    if (process.env.NODE_ENV === 'development') {
      console.warn('[WhatsApp Webhook] GUPSHUP_WEBHOOK_SECRET not set — skipping verification in dev')
      return true
    }
    console.error('[WhatsApp Webhook] GUPSHUP_WEBHOOK_SECRET is not configured')
    return false
  }

  const signatureHeader = request.headers.get('x-hub-signature')
  if (!signatureHeader) {
    console.warn('[WhatsApp Webhook] Missing x-hub-signature header')
    return false
  }

  const [algo, providedHex] = signatureHeader.split('=')
  if (algo !== 'sha256' || !providedHex) {
    console.warn('[WhatsApp Webhook] Unexpected signature format:', signatureHeader)
    return false
  }

  const expectedHex = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  // Timing-safe comparison to prevent length oracle attacks
  try {
    const expected = Buffer.from(expectedHex, 'hex')
    const provided = Buffer.from(providedHex, 'hex')
    if (expected.length !== provided.length) return false
    return timingSafeEqual(expected, provided)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Owner lookup — find the Supabase user linked to this phone number
// ---------------------------------------------------------------------------

async function findOwnerByPhone(phone: string): Promise<string | null> {
  try {
    const supabase = createServiceClient()
    // owner_phone is stored as 10 digits; incoming phone is E.164 (12 digits with 91 prefix)
    const localPhone = phone.startsWith('91') && phone.length === 12
      ? phone.slice(2)  // strip country code for matching
      : phone

    const { data } = await supabase
      .from('properties')
      .select('owner_id')
      .eq('owner_phone', localPhone)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    return data?.owner_id ?? null
  } catch (err) {
    console.error('[WhatsApp Webhook] Owner lookup failed:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Read raw body once (needed for signature verification AND JSON parsing)
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'Could not read request body' }, { status: 400 })
  }

  // Verify Gupshup signature
  const isValid = await verifySignature(request, rawBody)
  if (!isValid) {
    console.warn('[WhatsApp Webhook] Signature verification failed')
    // Return 200 to prevent Gupshup from retrying indefinitely
    // (a 4xx would cause repeated retries for a legit but misconfigured request)
    return NextResponse.json({ ok: false, reason: 'invalid_signature' }, { status: 200 })
  }

  // Parse JSON body
  let body: GupshupWebhookBody
  try {
    body = JSON.parse(rawBody) as GupshupWebhookBody
  } catch {
    console.error('[WhatsApp Webhook] Invalid JSON body')
    return NextResponse.json({ ok: false, reason: 'invalid_json' }, { status: 200 })
  }

  // We only handle inbound text messages for now
  // Status updates (message-event) are acknowledged but not processed
  if (body.type !== 'message') {
    return NextResponse.json({ ok: true, note: 'non-message event acknowledged' })
  }

  const msgPayload = body.payload
  const senderPhone = msgPayload.sender?.phone ?? msgPayload.source

  if (!senderPhone) {
    console.warn('[WhatsApp Webhook] Could not determine sender phone')
    return NextResponse.json({ ok: true })
  }

  // Extract text content
  const isTextMessage = msgPayload.type === 'text'
  const textContent = isTextMessage
    ? (msgPayload.payload as GupshupTextPayload).text ?? ''
    : `[${msgPayload.type} message]`

  const messageType = msgPayload.type === 'image' ? 'image' : 'text'

  // Look up which owner this phone belongs to
  const ownerId = await findOwnerByPhone(senderPhone)

  // Log the inbound message
  await logInboundMessage({
    phone: senderPhone,
    text: textContent,
    messageType,
    ownerId: ownerId ?? undefined,
  })

  // ── Command dispatch (Prompt 5 will expand this) ──────────────────────────
  //
  // For now: acknowledge with a simple text reply so the owner knows
  // the integration is working. When Prompt 5 adds command handling,
  // replace this block with the command router.
  //
  if (isTextMessage && ownerId) {
    try {
      await sendTextMessage({
        to: senderPhone,
        text: `✅ Message received! WhatsApp commands are coming soon.\n\nReply *HELP* once commands are ready.`,
        ownerId,
      })
    } catch (err) {
      // Reply failure should not cause a non-200 response
      console.error('[WhatsApp Webhook] Failed to send acknowledgement reply:', err)
    }
  } else if (isTextMessage && !ownerId) {
    // Unknown sender — do not reply (avoid spam replies to random numbers)
    console.info(`[WhatsApp Webhook] Message from unregistered number: ${senderPhone}`)
  }

  // Always return 200 to Gupshup — non-200 triggers retries
  return NextResponse.json({ ok: true })
}
