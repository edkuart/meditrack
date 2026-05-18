import { z } from 'zod'

export const CreateLocationSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional(),
  phone: z.string().max(30).optional(),
})

export const UpdateLocationSchema = CreateLocationSchema.partial()

export type CreateLocationInput = z.infer<typeof CreateLocationSchema>
export type UpdateLocationInput = z.infer<typeof UpdateLocationSchema>
