import { z } from 'zod'

export const ListClinicalProtocolsQuerySchema = z.object({
  category: z.string().min(1).max(80).trim().optional(),
  q: z.string().min(1).max(100).trim().optional(),
})

export type ListClinicalProtocolsQuery = z.infer<typeof ListClinicalProtocolsQuerySchema>
