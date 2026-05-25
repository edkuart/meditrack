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
  custom_role_id?: string | null
  custom_role_name?: string | null
  permissions?: string[]
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(config.jwt.issuer)
    .setAudience(config.jwt.audience)
    .setIssuedAt()
    .setExpirationTime(config.jwt.accessExpiresIn)
    .sign(accessSecret)
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, accessSecret, {
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  })
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

// ─── Patient session tokens ────────────────────────────────────────────────────

export interface PatientTokenPayload {
  sub: string           // patient_id
  tenant_id: string
  type: 'PATIENT'
  access_token_id: string
}

export async function signPatientToken(payload: PatientTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(config.jwt.issuer)
    .setAudience(`${config.jwt.audience}:patient`)
    .setIssuedAt()
    .setExpirationTime('90d')
    .sign(accessSecret)
}

export async function verifyPatientToken(token: string): Promise<PatientTokenPayload> {
  const { payload } = await jwtVerify(token, accessSecret, {
    issuer: config.jwt.issuer,
    audience: `${config.jwt.audience}:patient`,
  })
  const p = payload as Record<string, unknown>
  if (p['type'] !== 'PATIENT') throw new Error('Invalid token type')
  return p as unknown as PatientTokenPayload
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex')
}

export function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}
