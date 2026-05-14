const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886'
const META_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN
const META_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const META_GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? 'v23.0'

function isPlaceholder(value: string | undefined, kind: 'sid' | 'token') {
  const trimmed = value?.trim()
  if (!trimmed) return true
  if (kind === 'sid') return /^ACx{32}$/i.test(trimmed) || /^AC\[.+\]$/i.test(trimmed)
  return /^x{20,}$/i.test(trimmed) || /^\[.+\]$/i.test(trimmed)
}

function hasUsableTwilioConfig() {
  if (isPlaceholder(TWILIO_ACCOUNT_SID, 'sid') || isPlaceholder(TWILIO_AUTH_TOKEN, 'token')) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Invalid Twilio WhatsApp config: set real TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN, or remove both to disable Twilio.',
      )
    }
    return false
  }

  if (!/^AC[0-9a-f]{32}$/i.test(TWILIO_ACCOUNT_SID!)) {
    throw new Error('Invalid TWILIO_ACCOUNT_SID format: expected an Account SID that starts with AC followed by 32 hex characters.')
  }

  return true
}

// Returns provider message id when configured, undefined in dev (console) mode
export async function sendWhatsApp(to: string, body: string): Promise<string | undefined> {
  if (META_ACCESS_TOKEN || META_PHONE_NUMBER_ID) {
    return sendMetaWhatsApp(to, body)
  }

  if (!hasUsableTwilioConfig()) {
    console.log(`[whatsapp:dev] → ${to}\n${body}`)
    return undefined
  }

  const normalizedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`

  const params = new URLSearchParams({
    From: TWILIO_FROM,
    To: normalizedTo,
    Body: body,
  })

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    },
  )

  if (!res.ok) {
    throw new Error(`Twilio error ${res.status}: ${await res.text()}`)
  }

  const { sid } = await res.json() as { sid: string }
  return sid
}

async function sendMetaWhatsApp(to: string, body: string): Promise<string> {
  if (!META_ACCESS_TOKEN || !META_PHONE_NUMBER_ID) {
    throw new Error('WhatsApp Cloud API config missing: WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required')
  }

  const normalizedTo = to.replace(/\D/g, '')
  if (!normalizedTo) throw new Error('WhatsApp recipient phone is invalid')

  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${META_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizedTo,
        type: 'text',
        text: { body },
      }),
    },
  )

  const raw = await res.json().catch(() => null) as {
    messages?: Array<{ id?: string }>
    error?: { message?: string; type?: string; code?: number }
  } | null

  if (!res.ok) {
    const error = raw?.error
    throw new Error(
      `WhatsApp Cloud API error ${res.status}: ${error?.message ?? JSON.stringify(raw)}`
    )
  }

  const id = raw?.messages?.[0]?.id
  if (!id) throw new Error('WhatsApp Cloud API response did not include a message id')
  return id
}
