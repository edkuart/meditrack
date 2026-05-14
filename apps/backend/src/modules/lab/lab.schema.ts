import { z } from 'zod'

export const LabResultInputSchema = z.object({
  panel_name:     z.string().min(1).max(200),
  parameter_name: z.string().min(1).max(200),
  value:          z.string().max(100).optional(),
  numeric_value:  z.number().optional(),
  unit:           z.string().max(50).optional(),
  ref_min:        z.number().optional(),
  ref_max:        z.number().optional(),
  ref_text:       z.string().max(100).optional(),
  notes:          z.string().max(1000).optional(),
  sort_order:     z.number().int().default(0),
})

export const CreateLabOrderSchema = z.object({
  patient_id:   z.string().uuid(),
  encounter_id: z.string().uuid().optional(),
  notes:        z.string().max(2000).optional(),
  results:      z.array(LabResultInputSchema).min(1),
})

export const UpdateLabOrderSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  notes:  z.string().max(2000).optional(),
})

export const UpsertLabResultsSchema = z.object({
  results: z.array(LabResultInputSchema.extend({
    id: z.string().uuid().optional(),
  })).min(1),
})

export type CreateLabOrderInput   = z.infer<typeof CreateLabOrderSchema>
export type UpdateLabOrderInput   = z.infer<typeof UpdateLabOrderSchema>
export type UpsertLabResultsInput = z.infer<typeof UpsertLabResultsSchema>
export type LabResultInput        = z.infer<typeof LabResultInputSchema>
