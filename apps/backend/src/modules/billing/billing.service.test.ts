import { createHmac } from 'crypto'
import { describe, it, expect } from 'vitest'
import { verifyRecurrenteSignature, verifyStripeSignature } from './billing.service.ts'
import { AppError } from '../../shared/errors.ts'

const TEST_SECRET = 'whsec_test_secret_for_unit_tests_only'
const BODY = JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } })

function makeSignature(body: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000)
  const mac = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')
  return `t=${ts},v1=${mac}`
}

const RECURRENTE_SECRET = `whsec_${Buffer.from('recurrente_test_secret').toString('base64')}`

function makeRecurrenteHeaders(body: string, secret: string, timestamp?: number) {
  const ts = String(timestamp ?? Math.floor(Date.now() / 1000))
  const id = 'msg_test_123'
  const secretPart = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  const sig = createHmac('sha256', Buffer.from(secretPart, 'base64'))
    .update(`${id}.${ts}.${body}`)
    .digest('base64')
  return {
    'svix-id': id,
    'svix-timestamp': ts,
    'svix-signature': `v1,${sig}`,
  }
}

describe('verifyStripeSignature', () => {
  it('accepts a valid signature with the correct secret', () => {
    const sig = makeSignature(BODY, TEST_SECRET)
    expect(() => verifyStripeSignature(BODY, sig, TEST_SECRET)).not.toThrow()
  })

  it('throws INVALID_SIGNATURE when the secret is wrong', () => {
    const sig = makeSignature(BODY, 'wrong-secret')
    expect(() => verifyStripeSignature(BODY, sig, TEST_SECRET))
      .toThrowError(expect.objectContaining({ code: 'INVALID_SIGNATURE' }))
  })

  it('throws INVALID_SIGNATURE when the body has been tampered with', () => {
    const sig = makeSignature(BODY, TEST_SECRET)
    const tampered = BODY + ' '
    expect(() => verifyStripeSignature(tampered, sig, TEST_SECRET))
      .toThrowError(expect.objectContaining({ code: 'INVALID_SIGNATURE' }))
  })

  it('throws INVALID_SIGNATURE when signature parts are missing', () => {
    expect(() => verifyStripeSignature(BODY, 'malformed-header', TEST_SECRET))
      .toThrowError(expect.objectContaining({ code: 'INVALID_SIGNATURE' }))
  })

  it('throws INVALID_SIGNATURE when v1= part is absent', () => {
    const ts = Math.floor(Date.now() / 1000)
    expect(() => verifyStripeSignature(BODY, `t=${ts}`, TEST_SECRET))
      .toThrowError(expect.objectContaining({ code: 'INVALID_SIGNATURE' }))
  })

  it('throws STALE_EVENT when the timestamp is older than 5 minutes', () => {
    const staleTs = Math.floor(Date.now() / 1000) - 301
    const sig = makeSignature(BODY, TEST_SECRET, staleTs)
    expect(() => verifyStripeSignature(BODY, sig, TEST_SECRET))
      .toThrowError(expect.objectContaining({ code: 'STALE_EVENT' }))
  })

  it('accepts an event that is just within the 5-minute window', () => {
    const recentTs = Math.floor(Date.now() / 1000) - 299
    const sig = makeSignature(BODY, TEST_SECRET, recentTs)
    expect(() => verifyStripeSignature(BODY, sig, TEST_SECRET)).not.toThrow()
  })

  it('AppError carries the correct HTTP status code', () => {
    const sig = makeSignature(BODY, 'wrong')
    try {
      verifyStripeSignature(BODY, sig, TEST_SECRET)
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).statusCode).toBe(400)
    }
  })
})

describe('verifyRecurrenteSignature', () => {
  it('accepts a valid Svix-style signature', () => {
    const headers = makeRecurrenteHeaders(BODY, RECURRENTE_SECRET)
    expect(() => verifyRecurrenteSignature(BODY, headers, RECURRENTE_SECRET)).not.toThrow()
  })

  it('throws INVALID_SIGNATURE when signature headers are missing', () => {
    expect(() => verifyRecurrenteSignature(BODY, {}, RECURRENTE_SECRET))
      .toThrowError(expect.objectContaining({ code: 'INVALID_SIGNATURE' }))
  })

  it('throws INVALID_SIGNATURE when the body has been tampered with', () => {
    const headers = makeRecurrenteHeaders(BODY, RECURRENTE_SECRET)
    expect(() => verifyRecurrenteSignature(`${BODY} `, headers, RECURRENTE_SECRET))
      .toThrowError(expect.objectContaining({ code: 'INVALID_SIGNATURE' }))
  })

  it('throws STALE_EVENT when the timestamp exceeds the allowed window', () => {
    const staleTs = Math.floor(Date.now() / 1000) - 301
    const headers = makeRecurrenteHeaders(BODY, RECURRENTE_SECRET, staleTs)
    expect(() => verifyRecurrenteSignature(BODY, headers, RECURRENTE_SECRET))
      .toThrowError(expect.objectContaining({ code: 'STALE_EVENT' }))
  })
})
