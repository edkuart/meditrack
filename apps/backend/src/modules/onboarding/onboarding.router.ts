import { Hono } from 'hono'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { getOnboardingStatus } from './onboarding.service.ts'

export const onboardingRouter = new Hono()

onboardingRouter.get('/onboarding/status', requireAuth, async (c) => {
  const { tenant_id } = c.get('auth')
  const data = await getOnboardingStatus(tenant_id)
  return c.json({ success: true, data })
})
