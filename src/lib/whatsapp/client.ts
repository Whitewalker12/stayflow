/**
 * Gupshup WhatsApp Business API client.
 *
 * Docs: https://docs.gupshup.io/docs/send-message
 *
 * Two message types:
 *   - Template messages: pre-approved by WhatsApp, can be sent any time (outbound)
 *   - Text messages:     free-form, only within a 24-hour session window (responses)
 *
 * All functions log to the whatsapp_messages table via the service role client.
 */

import { createServiceClient } from '@/lib/supabase/service'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GUPSHUP_API_BASE = 'https://api.gupshup.io/wa/api/v1'
const MAX_RETRIES = 3
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] // exponential backoff

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GupshupTemplatePayload {
  /** Phone number of the recipient in E.164 format without '+'. e.g. 919876543210 */
  to: string
  /** Gupshup template ID (must be pre-approved by WhatsApp) */
  templateId: string
  /** Positional params matching the {{1}}, {{2}}... placeholders in the template */
  params: string[]
  /** Optional owner_id to associate the log row with. Used for RLS-based history. */
  ownerId?: string
}

export interface GupshupTextPayload {
  /** Phone number of the recipient in E.164 format without '+'. e.g. 919876543210 */
  to: string
  /** Plain text message body (max 4096 chars) */
  text: string
  /** Optional owner_id to associate the log row with. */
  ownerId?: string
}

export class WhatsAppError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly gupshupResponse?: unknown,
  ) {
    super(message)
    this.name = 'WhatsAppError'
  }
}

// ---------------------------------------------------------------------------
// Env helpers (validated at call-time so Next.js build doesn't fail)
// ---------------------------------------------------------------------------

function getEnv() {
  const apiKey = process.env.GUPSHUP_API_KEY
  const appName = process.env.GUPSHUP_APP_NAME
  const sourceNumber = process.env.GUPSHUP_SOURCE_NUMBER

  if (!apiKey || !appName || !sourceNumber) {
    throw new WhatsAppError(
      'Missing WhatsApp env vars. Set GUPSHUP_API_KEY, GUPSHUP_APP_NAME, ' +
      'and GUPSHUP_SOURCE_NUMBER in your environment.'
    )
  }
  return { apiKey, appName, sourceNumber }
}

// ---------------------------------------------------------------------------
// Internal: retry with exponential backoff
// ---------------------------------------------------------------------------

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      // Don't retry on client errors (4xx) — they won't succeed on retry
      if (err instanceof WhatsAppError && err.statusCode && err.statusCode < 500) {
        throw err
      }
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS_MS[attempt] ?? 4_000
        console.warn(`[WhatsApp] ${label} failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms…`, err)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}

// ---------------------------------------------------------------------------
// Internal: log message to whatsapp_messages table
// ---------------------------------------------------------------------------

async function logMessage(params: {
  ownerId?: string
  direction: 'inbound' | 'outbound'
  phone: string
  messageType: 'text' | 'template' | 'image'
  content?: string
  templateId?: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  errorMessage?: string
}) {
  try {
    const supabase = createServiceClient()
    await supabase.from('whatsapp_messages').insert({
      owner_id: params.ownerId ?? null,
      direction: params.direction,
      phone: params.phone,
      message_type: params.messageType,
      content: params.content ?? null,
      template_id: params.templateId ?? null,
      status: params.status,
      error_message: params.errorMessage ?? null,
    })
  } catch (logErr) {
    // Logging failure must never break the calling flow
    console.error('[WhatsApp] Failed to log message to DB:', logErr)
  }
}

// ---------------------------------------------------------------------------
// sendTemplateMessage
// ---------------------------------------------------------------------------

/**
 * Send a pre-approved WhatsApp template message via Gupshup.
 *
 * Template params are positional: params[0] maps to {{1}}, params[1] to {{2}}, etc.
 *
 * Throws WhatsAppError on failure (after retries).
 */
export async function sendTemplateMessage(payload: GupshupTemplatePayload): Promise<void> {
  const { apiKey, sourceNumber } = getEnv()

  const templateBody = JSON.stringify({
    id: payload.templateId,
    params: payload.params,
  })

  await withRetry(`sendTemplateMessage(${payload.templateId} → ${payload.to})`, async () => {
    let response: Response
    try {
      response = await fetch(`${GUPSHUP_API_BASE}/template/msg`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          channel: 'whatsapp',
          source: sourceNumber,
          destination: payload.to,
          template: templateBody,
          'src.name': process.env.GUPSHUP_APP_NAME!,
        }),
      })
    } catch (fetchErr) {
      throw new WhatsAppError(`Network error sending template: ${String(fetchErr)}`)
    }

    if (!response.ok) {
      let body: unknown
      try { body = await response.json() } catch { body = await response.text() }
      throw new WhatsAppError(
        `Gupshup returned ${response.status} for template ${payload.templateId}`,
        response.status,
        body,
      )
    }
  })

  await logMessage({
    ownerId: payload.ownerId,
    direction: 'outbound',
    phone: payload.to,
    messageType: 'template',
    templateId: payload.templateId,
    content: JSON.stringify(payload.params),
    status: 'sent',
  })
}

// ---------------------------------------------------------------------------
// sendTextMessage
// ---------------------------------------------------------------------------

/**
 * Send a free-form text message via Gupshup.
 *
 * ⚠️  WhatsApp only allows free-form messages within a 24-hour session window
 * (i.e., the recipient must have messaged you first). For proactive messages,
 * use sendTemplateMessage instead.
 *
 * Throws WhatsAppError on failure (after retries).
 */
export async function sendTextMessage(payload: GupshupTextPayload): Promise<void> {
  const { apiKey, appName, sourceNumber } = getEnv()

  const messageBody = JSON.stringify({ type: 'text', text: payload.text })

  await withRetry(`sendTextMessage(→ ${payload.to})`, async () => {
    let response: Response
    try {
      response = await fetch(`${GUPSHUP_API_BASE}/msg`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          channel: 'whatsapp',
          source: sourceNumber,
          destination: payload.to,
          message: messageBody,
          'src.name': appName,
        }),
      })
    } catch (fetchErr) {
      throw new WhatsAppError(`Network error sending text: ${String(fetchErr)}`)
    }

    if (!response.ok) {
      let body: unknown
      try { body = await response.json() } catch { body = await response.text() }
      throw new WhatsAppError(
        `Gupshup returned ${response.status} for text message`,
        response.status,
        body,
      )
    }
  })

  await logMessage({
    ownerId: payload.ownerId,
    direction: 'outbound',
    phone: payload.to,
    messageType: 'text',
    content: payload.text,
    status: 'sent',
  })
}

// ---------------------------------------------------------------------------
// logInboundMessage (used by the webhook handler)
// ---------------------------------------------------------------------------

/**
 * Log an inbound WhatsApp message to the database.
 * Called by the webhook handler — no API call, just DB write.
 */
export async function logInboundMessage(params: {
  phone: string
  text: string
  messageType?: 'text' | 'image'
  ownerId?: string
}) {
  await logMessage({
    ownerId: params.ownerId,
    direction: 'inbound',
    phone: params.phone,
    messageType: params.messageType ?? 'text',
    content: params.text,
    status: 'delivered', // inbound messages are already delivered by definition
  })
}
