import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { config } from './config.ts'

export const CLINICAL_ACCESS_COOKIE = 'meditrack_clinical_access'
export const CLINICAL_REFRESH_COOKIE = 'meditrack_clinical_refresh'

const REFRESH_COOKIE_MAX_AGE_SECONDS = config.jwt.refreshExpiresInDays * 24 * 60 * 60
const CLINICAL_ACCESS_COOKIE_PATH = '/api/v1/auth'
const CLINICAL_REFRESH_COOKIE_PATH = '/api/v1/auth'

export function getClinicalAccessCookie(c: Context) {
  return getCookie(c, CLINICAL_ACCESS_COOKIE)
}

export function getClinicalRefreshCookie(c: Context) {
  return getCookie(c, CLINICAL_REFRESH_COOKIE)
}

export function setClinicalSessionCookies(c: Context, accessToken: string, refreshToken: string) {
  const secure = config.env === 'production'
  void accessToken
  setCookie(c, CLINICAL_REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: secure ? 'None' : 'Lax',
    path: CLINICAL_REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  })
}

export function clearClinicalSessionCookies(c: Context) {
  const secure = config.env === 'production'
  const sameSite = secure ? 'None' : 'Lax'
  deleteCookie(c, CLINICAL_ACCESS_COOKIE, { path: CLINICAL_ACCESS_COOKIE_PATH, secure, sameSite })
  deleteCookie(c, CLINICAL_REFRESH_COOKIE, { path: CLINICAL_REFRESH_COOKIE_PATH, secure, sameSite })
}
