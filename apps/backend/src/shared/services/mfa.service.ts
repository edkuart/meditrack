import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { SignJWT, jwtVerify } from 'jose'
import { config } from '../config.ts'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const MFA_ISSUER = 'meditrack'
const MFA_TOKEN_AUDIENCE = `${config.jwt.audience}:admin-mfa`
const jwtSecret = new TextEncoder().encode(config.jwt.secret)
const encryptionKey = createHash('sha256').update(config.jwt.secret).digest()

export interface AdminMfaPayload {
  sub: string
  email: string
  purpose: 'ADMIN_MFA'
}

export function generateTotpSecret(): string {
  const bytes = randomBytes(20)
  let bits = ''
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0')

  let output = ''
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0')
    output += BASE32_ALPHABET[parseInt(chunk, 2)]
  }
  return output
}

export function otpauthUrl(email: string, secret: string): string {
  const label = encodeURIComponent(`${MFA_ISSUER}:${email}`)
  const issuer = encodeURIComponent(MFA_ISSUER)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function decryptSecret(value: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = value.split('.')
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error('Invalid encrypted MFA secret')

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(ivRaw, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export async function signAdminMfaToken(payload: Omit<AdminMfaPayload, 'purpose'>): Promise<string> {
  return new SignJWT({ ...payload, purpose: 'ADMIN_MFA' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(config.jwt.issuer)
    .setAudience(MFA_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(jwtSecret)
}

export async function verifyAdminMfaToken(token: string): Promise<AdminMfaPayload> {
  const { payload } = await jwtVerify(token, jwtSecret, {
    issuer: config.jwt.issuer,
    audience: MFA_TOKEN_AUDIENCE,
  })
  const p = payload as unknown as AdminMfaPayload
  if (p.purpose !== 'ADMIN_MFA') throw new Error('Invalid MFA token purpose')
  return p
}

export function verifyTotp(code: string, secret: string, now = Date.now()): boolean {
  const normalized = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(normalized)) return false

  const step = Math.floor(now / 1000 / 30)
  return [-1, 0, 1].some(offset => timingSafeEqualString(normalized, hotp(secret, step + offset)))
}

function hotp(secret: string, counter: number): string {
  const key = decodeBase32(secret)
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', key).update(buffer).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1_000_000
  return code.toString().padStart(6, '0')
}

function decodeBase32(value: string): Buffer {
  const clean = value.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase()
  let bits = ''
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx < 0) throw new Error('Invalid base32 secret')
    bits += idx.toString(2).padStart(5, '0')
  }

  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2))
  }
  return Buffer.from(bytes)
}

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
