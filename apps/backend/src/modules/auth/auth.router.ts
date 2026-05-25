import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { LoginSchema, RegisterSchema, RefreshSchema, ForgotPasswordSchema, ResetPasswordSchema, UpdateProfileSchema, ChangePasswordSchema, PasswordHelpSchema, AuthenticatedPasswordHelpSchema } from './auth.schema.ts'
import * as authService from './auth.service.ts'
import { getFullUser } from '../staff/staff.service.ts'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { rateLimit } from '../../shared/middleware/rate-limit.middleware.ts'
import { AppError } from '../../shared/errors.ts'
import { clearClinicalSessionCookies, getClinicalRefreshCookie, setClinicalSessionCookies } from '../../shared/session-cookies.ts'
import { signClinicalCsrfToken, verifyClinicalCsrfToken } from '../../shared/services/clinical-csrf.service.ts'

const router = new Hono()

const authLimiter = rateLimit({ keyPrefix: 'auth', windowMs: 15 * 60 * 1000, max: 20 })
const loginLimiter = rateLimit({ keyPrefix: 'auth-login', windowMs: 15 * 60 * 1000, max: 8 })
const resetLimiter = rateLimit({ keyPrefix: 'auth-reset', windowMs: 15 * 60 * 1000, max: 5 })

router.post('/register', authLimiter, zValidator('json', RegisterSchema), async (c) => {
  const body = c.req.valid('json')
  const result = await authService.register(body)
  setClinicalSessionCookies(c, result.access_token, result.refresh_token)
  return c.json({ success: true, data: result }, 201)
})

router.post('/login', loginLimiter, zValidator('json', LoginSchema), async (c) => {
  const body = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip')
  const ua = c.req.header('user-agent')
  const result = await authService.login(body, ip, ua)
  setClinicalSessionCookies(c, result.access_token, result.refresh_token)
  return c.json({ success: true, data: result })
})

router.get('/csrf', async (c) => {
  const refreshToken = getClinicalRefreshCookie(c)
  if (!refreshToken) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token')

  return c.json({ success: true, data: { csrf_token: signClinicalCsrfToken(refreshToken) } })
})

router.post('/refresh', authLimiter, async (c) => {
  const body = RefreshSchema.parse(await c.req.json().catch(() => ({})))
  const cookieRefreshToken = getClinicalRefreshCookie(c)
  const refresh_token = body.refresh_token ?? cookieRefreshToken
  if (!refresh_token) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token')
  if (!body.refresh_token) requireClinicalCsrf(c, refresh_token)
  const ua = c.req.header('user-agent')
  const tokens = await authService.refresh(refresh_token, ua)
  setClinicalSessionCookies(c, tokens.access_token, tokens.refresh_token)
  return c.json({ success: true, data: tokens })
})

router.post('/logout', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const cookieRefreshToken = getClinicalRefreshCookie(c)
  const refreshToken = body.refresh_token ?? cookieRefreshToken
  if (refreshToken) {
    if (!body.refresh_token && cookieRefreshToken) requireClinicalCsrf(c, refreshToken)
    await authService.logoutByRefresh(refreshToken)
  }
  clearClinicalSessionCookies(c)
  return c.json({ success: true, data: null })
})

router.get('/me', requireAuth, async (c) => {
  const auth = c.get('auth')
  const user = await getFullUser(auth.sub)
  return c.json({ success: true, data: user })
})

router.patch('/me', requireAuth, zValidator('json', UpdateProfileSchema), async (c) => {
  const { sub } = c.get('auth')
  const data = await authService.updateProfile(sub, c.req.valid('json'))
  return c.json({ success: true, data })
})

router.patch('/me/password', requireAuth, zValidator('json', ChangePasswordSchema), async (c) => {
  throw new AppError(410, 'PASSWORD_SELF_SERVICE_DISABLED', 'Password changes must be requested through platform support.')
})

router.post('/forgot-password', resetLimiter, zValidator('json', ForgotPasswordSchema), async (c) => {
  await authService.forgotPassword(c.req.valid('json'))
  // Always 200 regardless of whether email exists (prevents enumeration)
  return c.json({ success: true, data: { message: 'If that email is registered, a platform administrator will review the request.' } })
})

router.post('/password-help', resetLimiter, zValidator('json', PasswordHelpSchema), async (c) => {
  await authService.requestPasswordHelp(c.req.valid('json'))
  return c.json({ success: true, data: { message: 'If that email is registered, a platform administrator will review the request.' } })
})

router.post('/me/password-help', requireAuth, zValidator('json', AuthenticatedPasswordHelpSchema), async (c) => {
  const { sub } = c.get('auth')
  await authService.requestAuthenticatedPasswordHelp(sub, c.req.valid('json'))
  return c.json({ success: true, data: null }, 201)
})

router.post('/reset-password', resetLimiter, zValidator('json', ResetPasswordSchema), async (c) => {
  await authService.resetPassword(c.req.valid('json'))
  return c.json({ success: true, data: null })
})

function requireClinicalCsrf(c: Parameters<typeof requireAuth>[0], refreshToken: string) {
  const csrfToken = c.req.header('X-CSRF-Token')
  if (!csrfToken || !verifyClinicalCsrfToken(refreshToken, csrfToken)) {
    throw new AppError(401, 'INVALID_CSRF_TOKEN', 'Missing or invalid CSRF token')
  }
}

export { router as authRouter }
