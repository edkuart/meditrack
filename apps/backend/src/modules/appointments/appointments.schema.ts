import { z } from 'zod'

export const CreateAppointmentSchema = z.object({
  patient_id:       z.string().uuid(),
  doctor_id:        z.string().uuid(),
  location_id:      z.string().uuid().optional(),
  scheduled_at:     z.string().datetime({ offset: true }),
  duration_minutes: z.number().int().min(5).max(480).default(30),
  type:             z.enum(['CONSULTATION', 'FOLLOW_UP', 'PROCEDURE', 'CHECK_UP', 'EMERGENCY', 'TELECONSULT']).default('CONSULTATION'),
  reason:           z.string().max(500).optional(),
  notes:            z.string().max(2000).optional(),
})

export const UpdateAppointmentSchema = z.object({
  location_id:      z.string().uuid().nullable().optional(),
  scheduled_at:     z.string().datetime({ offset: true }).optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  type:             z.enum(['CONSULTATION', 'FOLLOW_UP', 'PROCEDURE', 'CHECK_UP', 'EMERGENCY', 'TELECONSULT']).optional(),
  reason:           z.string().max(500).nullable().optional(),
  notes:            z.string().max(2000).nullable().optional(),
})

export const CancelAppointmentSchema = z.object({
  reason: z.string().max(500).optional(),
})

export const ListAppointmentsSchema = z.object({
  from:       z.string().date().optional(),
  to:         z.string().date().optional(),
  doctor_id:  z.string().uuid().optional(),
  patient_id: z.string().uuid().optional(),
  status:     z.enum(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  limit:      z.coerce.number().int().min(1).max(500).default(100),
})
