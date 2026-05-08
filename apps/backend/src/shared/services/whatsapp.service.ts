const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886'

// Returns Twilio message SID when configured, undefined in dev (console) mode
export async function sendWhatsApp(to: string, body: string): Promise<string | undefined> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
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
