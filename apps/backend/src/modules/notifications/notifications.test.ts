import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  chooseDoseReminderChannels,
  doseReminderHtml,
  magicLinkHtml,
  nextRetryAt,
  pinHtml,
} from './notifications.service.ts'

// ─── Email template tests (pure functions, no DB or network needed) ───────────

describe('magicLinkHtml', () => {
  it('includes the patient first name', () => {
    const html = magicLinkHtml('María', 'https://app.test/portal?token=abc', '15 de enero de 2026')
    expect(html).toContain('María')
  })

  it('includes the access URL as an href', () => {
    const url = 'https://app.test/portal?token=abc123'
    const html = magicLinkHtml('Ana', url, '1 de febrero de 2026')
    expect(html).toContain(`href="${url}"`)
  })

  it('includes the expiry date', () => {
    const html = magicLinkHtml('Juan', 'https://app.test', '20 de marzo de 2026')
    expect(html).toContain('20 de marzo de 2026')
  })
})

describe('pinHtml', () => {
  it('displays the PIN prominently', () => {
    const html = pinHtml('Carlos', '847291', 'https://app.test/portal/auth')
    expect(html).toContain('847291')
  })

  it('includes the portal URL', () => {
    const portalUrl = 'https://app.test/portal/auth'
    const html = pinHtml('Rosa', '123456', portalUrl)
    expect(html).toContain(`href="${portalUrl}"`)
  })
})

describe('doseReminderHtml', () => {
  it('includes drug name and dose', () => {
    const html = doseReminderHtml('Pedro', 'Metformina', '500 mg', '08:00', 'https://app.test/portal')
    expect(html).toContain('Metformina')
    expect(html).toContain('500 mg')
  })

  it('includes scheduled time', () => {
    const html = doseReminderHtml('Luisa', 'Enalapril', '10 mg', '14:30', 'https://app.test/portal')
    expect(html).toContain('14:30')
  })

  it('includes the portal link', () => {
    const portal = 'https://app.test/portal'
    const html = doseReminderHtml('Mario', 'Atorvastatina', '20 mg', '20:00', portal)
    expect(html).toContain(`href="${portal}"`)
  })
})

describe('notification orchestration helpers', () => {
  it('prioritizes email and falls back to whatsapp for dose reminders', () => {
    expect(chooseDoseReminderChannels({
      id: 'patient-1',
      first_name: 'Ana',
      email: 'ana@example.com',
      phone: '+50255555555',
    })).toEqual(['email', 'whatsapp'])
  })

  it('uses whatsapp when email is absent', () => {
    expect(chooseDoseReminderChannels({
      id: 'patient-1',
      first_name: 'Ana',
      email: null,
      phone: '+50255555555',
    })).toEqual(['whatsapp'])
  })

  it('does not schedule retry after max attempts', () => {
    expect(nextRetryAt(3)).toBeNull()
  })

  it('schedules retry after a failed early attempt', () => {
    const now = new Date('2026-01-01T12:00:00.000Z')
    expect(nextRetryAt(1, now)?.getTime()).toBeGreaterThan(now.getTime())
  })
})

// ─── Email service console fallback ──────────────────────────────────────────

describe('sendEmail console fallback', () => {
  it('logs to console and returns undefined when RESEND_API_KEY is not set', async () => {
    // RESEND_API_KEY is intentionally absent in test-setup.ts
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Dynamic import so the module reads env at call time
    const { sendEmail } = await import('../../shared/services/email.service.ts')
    const result = await sendEmail({
      to: 'patient@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    })

    expect(result).toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('email:dev'))

    consoleSpy.mockRestore()
  })
})

describe('sendWhatsApp console fallback', () => {
  beforeEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN
    vi.resetModules()
  })

  it('logs to console and returns undefined when Twilio creds are not set', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { sendWhatsApp } = await import('../../shared/services/whatsapp.service.ts')
    const result = await sendWhatsApp('+5491112345678', 'Mensaje de prueba')

    expect(result).toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('whatsapp:dev'))

    consoleSpy.mockRestore()
  })

  it('treats example Twilio placeholders as unconfigured in non-production envs', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    process.env.TWILIO_AUTH_TOKEN = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { sendWhatsApp } = await import('../../shared/services/whatsapp.service.ts')
    const result = await sendWhatsApp('+5491112345678', 'Mensaje de prueba')

    expect(result).toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('whatsapp:dev'))

    consoleSpy.mockRestore()
  })
})
