import { decodeJwt } from 'jose'
import { describe, it, expect } from 'vitest'
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
} from './token.service.ts'

const samplePayload = {
  sub: '550e8400-e29b-41d4-a716-446655440000',
  tenant_id: '550e8400-e29b-41d4-a716-446655440001',
  role: 'DOCTOR',
  email: 'doctor@test.com',
}

describe('token.service', () => {
  describe('signAccessToken / verifyAccessToken', () => {
    it('signs and verifies a valid token', async () => {
      const token = await signAccessToken(samplePayload)
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3)

      const claims = decodeJwt(token)
      expect(claims.iss).toBe('meditrack-api')
      expect(claims.aud).toBe('meditrack-clinical')

      const decoded = await verifyAccessToken(token)
      expect(decoded.sub).toBe(samplePayload.sub)
      expect(decoded.tenant_id).toBe(samplePayload.tenant_id)
      expect(decoded.role).toBe(samplePayload.role)
      expect(decoded.email).toBe(samplePayload.email)
    })

    it('throws on tampered token', async () => {
      const token = await signAccessToken(samplePayload)
      const tampered = token.slice(0, -5) + 'XXXXX'
      await expect(verifyAccessToken(tampered)).rejects.toThrow()
    })

    it('throws on completely invalid token', async () => {
      await expect(verifyAccessToken('not.a.token')).rejects.toThrow()
    })
  })

  describe('generateRefreshToken', () => {
    it('generates a 96-char hex string', () => {
      const token = generateRefreshToken()
      expect(token).toHaveLength(96)
      expect(/^[a-f0-9]+$/.test(token)).toBe(true)
    })

    it('generates unique tokens on each call', () => {
      const t1 = generateRefreshToken()
      const t2 = generateRefreshToken()
      expect(t1).not.toBe(t2)
    })
  })

  describe('hashToken', () => {
    it('produces a consistent SHA-256 hash', () => {
      const token = 'test-token'
      const h1 = hashToken(token)
      const h2 = hashToken(token)
      expect(h1).toBe(h2)
      expect(h1).toHaveLength(64)
    })

    it('different inputs produce different hashes', () => {
      expect(hashToken('abc')).not.toBe(hashToken('xyz'))
    })
  })
})
