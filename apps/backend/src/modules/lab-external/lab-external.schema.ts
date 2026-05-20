import { z } from 'zod'

export const SubmitExternalLabSchema = z.object({
  order_id:      z.string().uuid().optional(),
  patient_notes: z.string().max(2000).optional(),
})

export const UpdateExtractedValueSchema = z.object({
  status:       z.enum(['ACCEPTED', 'EDITED', 'REJECTED']),
  doctor_value: z.string().max(100).optional(),
})

export const ValidateSubmissionSchema = z.object({
  // Empty body — validates all ACCEPTED/EDITED values and merges into lab_results
})

export type SubmitExternalLabInput      = z.infer<typeof SubmitExternalLabSchema>
export type UpdateExtractedValueInput   = z.infer<typeof UpdateExtractedValueSchema>
