const RESEND_API_KEY = process.env.RESEND_API_KEY
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'meditrack <noreply@meditrack.app>'

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

// Returns Resend message ID when configured, undefined in dev (console) mode
export async function sendEmail(opts: SendEmailOptions): Promise<string | undefined> {
  if (!RESEND_API_KEY) {
    console.log(`[email:dev] → ${opts.to} | ${opts.subject}`)
    return undefined
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  })

  if (!res.ok) {
    throw new Error(`Resend error ${res.status}: ${await res.text()}`)
  }

  const { id } = await res.json() as { id: string }
  return id
}
