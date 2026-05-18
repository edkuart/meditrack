/**
 * Manual migration runner for 0026_hospital_admissions.
 *
 * Why manual: ALTER TYPE ... ADD VALUE cannot run inside a PostgreSQL transaction.
 * This script:
 *  1. Adds the new audit_action values outside any transaction.
 *  2. Creates the admission_status enum + hospital_admissions table inside a transaction.
 *  3. Registers the migration hash in __drizzle_migrations so Drizzle won't try to re-run it.
 *
 * Run: tsx --env-file=.env src/scripts/apply-0026.ts
 */

import postgres from 'postgres'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

async function main() {
  console.log('→ Step 1: Adding audit_action enum values (outside transaction)…')
  await sql.unsafe(`ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'PATIENT_ADMITTED'`)
  await sql.unsafe(`ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'PATIENT_DISCHARGED'`)
  console.log('  ✓ Enum values added')

  console.log('→ Step 2: Creating admission_status enum + hospital_admissions table…')
  const sqlFile = path.resolve(
    __dirname,
    '../shared/db/migrations/0026_hospital_admissions.sql',
  )
  const ddl = fs.readFileSync(sqlFile, 'utf-8')

  await sql.begin(async (tx) => {
    await tx.unsafe(ddl)
  })
  console.log('  ✓ Table created')

  console.log('→ Step 3: Registering migration hash in __drizzle_migrations…')
  const hash = crypto.createHash('sha256').update(ddl).digest('hex')
  await sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES (${hash}, ${Date.now()})
    ON CONFLICT DO NOTHING
  `
  console.log('  ✓ Hash registered:', hash.slice(0, 16) + '…')

  await sql.end()
  console.log('✅ Migration 0026 applied successfully')
}

main().catch((err) => {
  console.error('❌ Migration failed:', err)
  process.exit(1)
})
