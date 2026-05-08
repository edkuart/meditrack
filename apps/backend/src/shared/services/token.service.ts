import { SignJWT, jwtVerify } from 'jose'
import { createHash, randomBytes } from 'crypto'
import { config } from '../config.ts'

const accessSecret = new TextEncoder().encode(config.jwt.secret)
const refreshSecret = new TextEncoder().encode(config.jwt.refreshSecret)

export interface AccessTokenPayload {
  sub: string        // user id
  tenant_id: string
  role: string
  email: string
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.jwt.accessExpiresIn)
    .sign(accessSecret)
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, accessSecret)
  return payload as unknown as AccessTokenPayload
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function refreshTokenExpiresAt(): Date {
  const date = new Date()
  date.setDate(date.getDate() + config.jwt.refreshExpiresInDays)
  return date
}
