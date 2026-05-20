import { z } from 'zod'

export const CreateLocationSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).nullable().optional(),
  formatted_address: z.string().max(500).nullable().optional(),
  google_place_id: z.string().max(255).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  maps_url: z.string().url().max(1000).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
})

export const UpdateLocationSchema = CreateLocationSchema.partial()

export type CreateLocationInput = z.infer<typeof CreateLocationSchema>
export type UpdateLocationInput = z.infer<typeof UpdateLocationSchema>
