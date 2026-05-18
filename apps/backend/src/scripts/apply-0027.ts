/**
 * Manual migration runner for 0027_locations.
 *
 * Adds locations table (multi-sede support) and location_id FK on departments.
 *
 * Run: tsx --env-file=.env src/scripts/apply-0027.ts
 */

import postgres from 'postgres'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

async function main() {
  console.log('→ Creating locations table + departments.location_id…')
  const sqlFile = path.resolve(
    __dirname,
    '../shared/db/migrations/0027_locations.sql',
  )
  const ddl = fs.readFileSync(sqlFile, 'utf-8')

  await sql.begin(async (tx) => {
    await tx.unsafe(ddl)
  })
  console.log('  ✓ DDL applied')

  console.log('→ Registering migration hash in __drizzle_migrations…')
  const hash = crypto.createHash('sha256').update(ddl).digest('hex')
  await sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES (${hash}, ${Date.now()})
    ON CONFLICT DO NOTHING
  `
  console.log('  ✓ Hash registered:', hash.slice(0, 16) + '…')

  await sql.end()
  console.log('✅ Migration 0027 applied successfully')
}

main().catch((err) => {
  console.error('❌ Migration failed:', err)
  process.exit(1)
})
