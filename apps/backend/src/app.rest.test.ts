import { beforeEach, describe, expect, it } from 'vitest'
import app from './app.ts'
import { resetRateLimitBuckets } from './shared/middleware/rate-limit.middleware.ts'
import { signPatientToken } from './shared/services/token.service.ts'

type JsonBody = Record<string, unknown>

describe('REST app critical routes', () => {
  beforeEach(() => {
    resetRateLimitBuckets()
  })

  it('returns health status without auth', async () => {
    const res = await app.fetch(new Request('http://localhost/health', {
      headers: { 'x-request-id': 'test-request-id' },
    }))
    const body = await res.json() as JsonBody

    expect(res.status).toBe(200)
    expect(res.headers.get('x-request-id')).toBe('test-request-id')
    expect(body.status).toBe('ok')
    expect(body.service).toBe('meditrack-api')
    expect(body.request_id).toBe('test-request-id')
    expect(body.timestamp).toBeDefined()
  })

  it('returns readiness payload with operational checks', async () => {
    const res = await app.fetch(new Request('http://localhost/ready'))
    const body = await res.json() as JsonBody

    expect([200, 503]).toContain(res.status)
    expect(body.status).toBeDefined()
    expect(body.checks).toBeDefined()
    expect(body.jobs).toBeDefined()
    expect(body.request_id).toBeDefined()
  })

  it('sets baseline security headers on API responses', async () => {
    const res = await app.fetch(new Request('http://localhost/health'))

    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(res.headers.get('permissions-policy')).toContain('camera=()')
  })

  it('returns a consistent not found payload', async () => {
    const res = await app.fetch(new Request('http://localhost/nope'))
    const body = await res.json() as JsonBody

    expect(res.status).toBe(404)
    expect(body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    })
  })

  it('requires auth for patient search', async () => {
    const res = await app.fetch(new Request('http://localhost/api/v1/patients'))
    const body = await res.json() as JsonBody

    expect(res.status).toBe(401)
    expect(body.request_id).toBeDefined()
    expect(body).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    })
  })

  it('protects admin cookie session endpoints by default', async () => {
    const me = await app.fetch(new Request('http://localhost/api/v1/admin/auth/me'))
    const csrf = await app.fetch(new Request('http://localhost/api/v1/admin/auth/csrf'))
    const audit = await app.fetch(new Request('http://localhost/api/v1/admin/audit-logs'))
    const refresh = await app.fetch(new Request('http://localhost/api/v1/admin/auth/refresh', { method: 'POST' }))
    const logout = await app.fetch(new Request('http://localhost/api/v1/admin/auth/logout', { method: 'POST' }))

    expect(me.status).toBe(401)
    expect(csrf.status).toBe(401)
    expect(audit.status).toBe(401)
    expect(refresh.status).toBe(401)
    expect(logout.status).toBe(200)
    expect(logout.headers.getSetCookie()).toEqual([
      'meditrack_admin_access=; Max-Age=0; Path=/api/v1/admin',
      'meditrack_admin_refresh=; Max-Age=0; Path=/api/v1/admin',
    ])
  })

  it('protects and clears clinical cookie sessions by default', async () => {
    const refresh = await app.fetch(new Request('http://localhost/api/v1/auth/refresh', { method: 'POST' }))
    const logout = await app.fetch(new Request('http://localhost/api/v1/auth/logout', { method: 'POST' }))

    expect(refresh.status).toBe(401)
    expect(logout.status).toBe(200)
    expect(logout.headers.getSetCookie()).toEqual([
      'meditrack_clinical_access=; Max-Age=0; Path=/api/v1/auth',
      'meditrack_clinical_refresh=; Max-Age=0; Path=/api/v1/auth',
    ])
  })

  it('requires CSRF for clinical refresh-cookie mutations', async () => {
    const csrf = await app.fetch(new Request('http://localhost/api/v1/auth/csrf'))
    const refresh = await app.fetch(new Request('http://localhost/api/v1/auth/refresh', {
      method: 'POST',
      headers: { cookie: 'meditrack_clinical_refresh=fake-refresh-token' },
    }))
    const logout = await app.fetch(new Request('http://localhost/api/v1/auth/logout', {
      method: 'POST',
      headers: { cookie: 'meditrack_clinical_refresh=fake-refresh-token' },
    }))
    const refreshBody = await refresh.json() as JsonBody
    const logoutBody = await logout.json() as JsonBody

    expect(csrf.status).toBe(401)
    expect(refresh.status).toBe(401)
    expect(logout.status).toBe(401)
    expect(refreshBody).toMatchObject({ success: false, error: { code: 'INVALID_CSRF_TOKEN' } })
    expect(logoutBody).toMatchObject({ success: false, error: { code: 'INVALID_CSRF_TOKEN' } })
  })

  it('rate limits repeated doctor login attempts by IP', async () => {
    for (let i = 0; i < 8; i += 1) {
      await app.fetch(new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.10',
        },
        body: JSON.stringify({}),
      }))
    }

    const res = await app.fetch(new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify({}),
    }))
    const body = await res.json() as JsonBody

    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect(body).toMatchObject({
      success: false,
      error: { code: 'RATE_LIMITED' },
    })
  })

  it('rejects public hospital tenant creation during registration', async () => {
    const res = await app.fetch(new Request('http://localhost/api/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'phase1-hospital@example.com',
        password: 'ThisIsAFifteenCharPassword',
        first_name: 'Phase',
        last_name: 'One',
        clinic_name: 'Phase Hospital',
        clinic_slug: 'phase-hospital',
        colegiado_number: 'PHASE-1',
        tenant_type: 'HOSPITAL',
      }),
    }))
    const body = await res.json() as JsonBody

    expect(res.status).toBe(400)
    expect(JSON.stringify(body)).toContain('tenant_type')
  })

  it('rate limits repeated portal PIN attempts by IP', async () => {
    const invalidPinAttempt = {
      patient_id: '00000000-0000-4000-8000-000000000001',
      pin: '123456',
    }

    for (let i = 0; i < 6; i += 1) {
      await app.fetch(new Request('http://localhost/api/v1/portal/auth/pin', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.20',
        },
        body: JSON.stringify(invalidPinAttempt),
      }))
    }

    const res = await app.fetch(new Request('http://localhost/api/v1/portal/auth/pin', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.20',
      },
      body: JSON.stringify(invalidPinAttempt),
    }))
    const body = await res.json() as JsonBody

    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect(body).toMatchObject({
      success: false,
      error: { code: 'RATE_LIMITED' },
    })
  })

  it('does not route patient portal sessions through doctor auth middleware', async () => {
    const token = await signPatientToken({
      sub: '00000000-0000-4000-8000-000000000001',
      tenant_id: '00000000-0000-4000-8000-000000000002',
      type: 'PATIENT',
      access_token_id: '00000000-0000-4000-8000-000000000003',
    })

    const res = await app.fetch(new Request('http://localhost/api/v1/portal/me', {
      headers: { authorization: `Bearer ${token}` },
    }))
    const body = await res.json() as JsonBody
    const error = body.error as { message?: string } | undefined

    expect(res.status).not.toBe(401)
    expect(error?.message).not.toBe('Invalid or expired token')
  })
})

describe('Billing endpoints', () => {
  it('GET /billing/status requires authentication', async () => {
    const res = await app.fetch(new Request('http://localhost/api/v1/billing/status'))
    const body = await res.json() as JsonBody

    expect(res.status).toBe(401)
    expect(body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } })
  })

  it('POST /billing/checkout requires authentication', async () => {
    const res = await app.fetch(new Request('http://localhost/api/v1/billing/checkout', { method: 'POST' }))
    const body = await res.json() as JsonBody

    expect(res.status).toBe(401)
    expect(body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } })
  })

  it('POST /billing/portal requires authentication', async () => {
    const res = await app.fetch(new Request('http://localhost/api/v1/billing/portal', { method: 'POST' }))
    const body = await res.json() as JsonBody

    expect(res.status).toBe(401)
    expect(body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } })
  })

  it('POST /billing/webhook rejects requests without stripe-signature header', async () => {
    const res = await app.fetch(new Request('http://localhost/api/v1/billing/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'checkout.session.completed' }),
    }))
    const body = await res.json() as JsonBody

    // 400 when stripe-signature is absent
    expect(res.status).toBe(400)
    expect(body).toMatchObject({ success: false, error: { code: 'MISSING_SIGNATURE' } })
  })

  it('POST /billing/webhook does not require a bearer token', async () => {
    // The webhook endpoint must be publicly reachable (Stripe has no bearer token).
    // Without STRIPE_WEBHOOK_SECRET configured the handler returns 200 no-op,
    // and with a malformed signature it returns 400 — but never 401.
    const rawBody = JSON.stringify({ type: 'checkout.session.completed' })
    const res = await app.fetch(new Request('http://localhost/api/v1/billing/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 'bad-signature',
      },
      body: rawBody,
    }))

    expect(res.status).not.toBe(401)
    expect([200, 400]).toContain(res.status)
  })
})

describe('Onboarding endpoint', () => {
  it('GET /onboarding/status requires authentication', async () => {
    const res = await app.fetch(new Request('http://localhost/api/v1/onboarding/status'))
    const body = await res.json() as JsonBody

    expect(res.status).toBe(401)
    expect(body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } })
  })
})
