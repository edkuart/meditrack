import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { PERMISSIONS, requirePermission } from '../../shared/permissions.ts'
import {
  CreateAppointmentSchema,
  UpdateAppointmentSchema,
  CancelAppointmentSchema,
  ListAppointmentsSchema,
} from './appointments.schema.ts'
import * as svc from './appointments.service.ts'

const router = new Hono()

router.use('*', requireAuth)

// ─── Clinic agenda ────────────────────────────────────────────────────────────

router.get(
  '/appointments',
  requirePermission(PERMISSIONS.APPOINTMENT_READ),
  zValidator('query', ListAppointmentsSchema),
  async (c) => {
    const { tenant_id } = c.get('auth')
    const data = await svc.listAppointments(tenant_id, c.req.valid('query'))
    return c.json({ success: true, data })
  },
)

// ─── Per-patient appointments ─────────────────────────────────────────────────

router.get(
  '/patients/:patientId/appointments',
  requirePermission(PERMISSIONS.APPOINTMENT_READ),
  async (c) => {
    const { tenant_id } = c.get('auth')
    const data = await svc.listPatientAppointments(tenant_id, c.req.param('patientId')!)
    return c.json({ success: true, data })
  },
)

router.post(
  '/patients/:patientId/appointments',
  requirePermission(PERMISSIONS.APPOINTMENT_WRITE),
  zValidator('json', CreateAppointmentSchema),
  async (c) => {
    const { tenant_id, sub } = c.get('auth')
    const body = c.req.valid('json')
    const data = await svc.createAppointment(tenant_id, sub, {
      ...body,
      patient_id: c.req.param('patientId')!,
    })
    return c.json({ success: true, data }, 201)
  },
)

// ─── Single appointment ───────────────────────────────────────────────────────

router.get(
  '/appointments/:id',
  requirePermission(PERMISSIONS.APPOINTMENT_READ),
  async (c) => {
    const { tenant_id } = c.get('auth')
    const data = await svc.getAppointment(tenant_id, c.req.param('id')!)
    return c.json({ success: true, data })
  },
)

router.patch(
  '/appointments/:id',
  requirePermission(PERMISSIONS.APPOINTMENT_WRITE),
  zValidator('json', UpdateAppointmentSchema),
  async (c) => {
    const { tenant_id } = c.get('auth')
    const data = await svc.updateAppointment(tenant_id, c.req.param('id')!, c.req.valid('json'))
    return c.json({ success: true, data })
  },
)

// ─── Status transitions ───────────────────────────────────────────────────────

router.post('/appointments/:id/confirm',  requirePermission(PERMISSIONS.APPOINTMENT_WRITE), async (c) => {
  const { tenant_id } = c.get('auth')
  return c.json({ success: true, data: await svc.confirmAppointment(tenant_id, c.req.param('id')!) })
})

router.post('/appointments/:id/start', requirePermission(PERMISSIONS.APPOINTMENT_WRITE), async (c) => {
  const { tenant_id } = c.get('auth')
  return c.json({ success: true, data: await svc.startAppointment(tenant_id, c.req.param('id')!) })
})

router.post('/appointments/:id/complete', requirePermission(PERMISSIONS.APPOINTMENT_WRITE), async (c) => {
  const { tenant_id } = c.get('auth')
  return c.json({ success: true, data: await svc.completeAppointment(tenant_id, c.req.param('id')!) })
})

router.post('/appointments/:id/no-show', requirePermission(PERMISSIONS.APPOINTMENT_WRITE), async (c) => {
  const { tenant_id } = c.get('auth')
  return c.json({ success: true, data: await svc.noShowAppointment(tenant_id, c.req.param('id')!) })
})

router.post(
  '/appointments/:id/cancel',
  requirePermission(PERMISSIONS.APPOINTMENT_WRITE),
  zValidator('json', CancelAppointmentSchema),
  async (c) => {
    const { tenant_id } = c.get('auth')
    const data = await svc.cancelAppointment(tenant_id, c.req.param('id')!, c.req.valid('json').reason)
    return c.json({ success: true, data })
  },
)

export { router as appointmentsRouter }
