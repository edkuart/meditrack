import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { config } from '../config.ts'
import { hashToken } from './token.service.ts'

const CSRF_SECRET = `clinical-csrf:${config.jwt.secret}`

export function signClinicalCsrfToken(rawRefreshToken: string) {
  const nonce = randomBytes(32).toString('hex')
  return `${nonce}.${signatureFor(rawRefreshToken, nonce)}`
}

export function verifyClinicalCsrfToken(rawRefreshToken: string, token: string) {
  const [nonce, signature] = token.split('.')
  if (!nonce || !signature) return false

  const expected = signatureFor(rawRefreshToken, nonce)
  const actualBuffer = Buffer.from(signature, 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  if (actualBuffer.length !== expectedBuffer.length) return false

  return timingSafeEqual(actualBuffer, expectedBuffer)
}

function signatureFor(rawRefreshToken: string, nonce: string) {
  return createHmac('sha256', CSRF_SECRET)
    .update(`${hashToken(rawRefreshToken)}.${nonce}`)
    .digest('hex')
}
