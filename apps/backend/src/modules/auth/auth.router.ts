import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { LoginSchema, RegisterSchema, RefreshSchema } from './auth.schema.ts'
import * as authService from './auth.service.ts'
import { getFullUser } from '../staff/staff.service.ts'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'

const router = new Hono()

router.post('/register', zValidator('json', RegisterSchema), async (c) => {
  const body = c.req.valid('json')
  const result = await authService.register(body)
  return c.json({ success: true, data: result }, 201)
})

router.post('/login', zValidator('json', LoginSchema), async (c) => {
  const body = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip')
  const ua = c.req.header('user-agent')
  const result = await authService.login(body, ip, ua)
  return c.json({ success: true, data: result })
})

router.post('/refresh', zValidator('json', RefreshSchema), async (c) => {
  const { refresh_token } = c.req.valid('json')
  const ua = c.req.header('user-agent')
  const tokens = await authService.refresh(refresh_token, ua)
  return c.json({ success: true, data: tokens })
})

router.post('/logout', requireAuth, async (c) => {
  const auth = c.get('auth')
  const body = await c.req.json().catch(() => ({}))
  if (body.refresh_token) {
    await authService.logout(auth.sub, body.refresh_token)
  }
  return c.json({ success: true, data: null })
})

router.get('/me', requireAuth, async (c) => {
  const auth = c.get('auth')
  const user = await getFullUser(auth.sub)
  return c.json({ success: true, data: user })
})

export { router as authRouter }
