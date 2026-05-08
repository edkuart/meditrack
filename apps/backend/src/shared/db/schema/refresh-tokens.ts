import { pgTable, uuid, text, varchar, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.ts'

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  token_hash: text('token_hash').notNull().unique(),
  device_hint: varchar('device_hint', { length: 200 }),
  is_revoked: boolean('is_revoked').default(false).notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  used_at: timestamp('used_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('refresh_tokens_user_id_idx').on(table.user_id),
  index('refresh_tokens_hash_idx').on(table.token_hash),
])

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.user_id], references: [users.id] }),
}))

export type RefreshToken = typeof refreshTokens.$inferSelect
export type NewRefreshToken = typeof refreshTokens.$inferInsert
