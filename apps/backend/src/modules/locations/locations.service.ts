import { eq, and } from 'drizzle-orm'
import { db, locations } from '../../shared/db/index.ts'
import { NotFoundError, ConflictError } from '../../shared/errors.ts'
import type { CreateLocationInput, UpdateLocationInput } from './locations.schema.ts'

export async function listLocations(tenantId: string) {
  return db.query.locations.findMany({
    where: eq(locations.tenant_id, tenantId),
    with: { departments: { columns: { id: true, name: true, type: true, is_active: true } } },
    orderBy: (l, { asc }) => asc(l.name),
  })
}

export async function getLocation(tenantId: string, locationId: string) {
  const loc = await db.query.locations.findFirst({
    where: and(eq(locations.id, locationId), eq(locations.tenant_id, tenantId)),
    with: { departments: { columns: { id: true, name: true, type: true, is_active: true } } },
  })
  if (!loc) throw new NotFoundError('Location')
  return loc
}

export async function createLocation(tenantId: string, input: CreateLocationInput) {
  const existing = await db.query.locations.findFirst({
    where: and(eq(locations.tenant_id, tenantId), eq(locations.name, input.name)),
    columns: { id: true },
  })
  if (existing) throw new ConflictError('A location with this name already exists', 'LOCATION_EXISTS')

  const [loc] = await db.insert(locations).values({
    tenant_id: tenantId,
    name: input.name,
    address: input.address,
    phone: input.phone,
  }).returning()

  return loc
}

export async function updateLocation(tenantId: string, locationId: string, input: UpdateLocationInput) {
  const existing = await db.query.locations.findFirst({
    where: and(eq(locations.id, locationId), eq(locations.tenant_id, tenantId)),
    columns: { id: true },
  })
  if (!existing) throw new NotFoundError('Location')

  const [updated] = await db.update(locations)
    .set({ ...input, updated_at: new Date() })
    .where(eq(locations.id, locationId))
    .returning()

  return updated
}

export async function deactivateLocation(tenantId: string, locationId: string) {
  const existing = await db.query.locations.findFirst({
    where: and(eq(locations.id, locationId), eq(locations.tenant_id, tenantId)),
    columns: { id: true },
  })
  if (!existing) throw new NotFoundError('Location')

  await db.update(locations)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(locations.id, locationId))
}
