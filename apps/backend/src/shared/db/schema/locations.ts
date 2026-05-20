import { pgTable, uuid, varchar, text, boolean, timestamp, index, real } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { departments } from './departments.ts'

export const locations = pgTable('locations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  address: text('address'),
  formatted_address: text('formatted_address'),
  google_place_id: varchar('google_place_id', { length: 255 }),
  latitude: real('latitude'),
  longitude: real('longitude'),
  maps_url: text('maps_url'),
  phone: varchar('phone', { length: 30 }),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('locations_tenant_idx').on(t.tenant_id),
])

export const locationsRelations = relations(locations, ({ one, many }) => ({
  tenant: one(tenants, { fields: [locations.tenant_id], references: [tenants.id] }),
  departments: many(departments),
}))

export type Location = typeof locations.$inferSelect
export type NewLocation = typeof locations.$inferInsert
