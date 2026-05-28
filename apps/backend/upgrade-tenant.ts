/**
 * Upgrade a tenant to clinic_complete plan.
 * Usage: npx tsx upgrade-tenant.ts <slug>
 * Example: npx tsx upgrade-tenant.ts consultorio-eku
 */
import postgres from 'postgres'
import { resolve } from 'path'
import { readFileSync } from 'fs'

const slug = process.argv[2]
if (!slug) {
  console.error('Usage: npx tsx upgrade-tenant.ts <slug>')
  process.exit(1)
}

const envPath = resolve(process.cwd(), '.env')
const envContent = readFileSync(envPath, 'utf-8')
const dbUrl = envContent.split('\n').find(l => l.startsWith('DATABASE_URL='))?.replace('DATABASE_URL=', '').trim() ?? ''

if (!dbUrl) {
  console.error('DATABASE_URL not found in .env')
  process.exit(1)
}

const sql = postgres(dbUrl, { max: 1 })

async function main() {
  const [tenant] = await sql`
    SELECT id, name, slug, plan_type, status, type
    FROM tenants
    WHERE slug = ${slug}
  `

  if (!tenant) {
    console.error(`Tenant with slug "${slug}" not found.`)
    await sql.end()
    process.exit(1)
  }

  console.log('\nTenant encontrado:')
  console.log(`  ID:       ${tenant.id}`)
  console.log(`  Nombre:   ${tenant.name}`)
  console.log(`  Slug:     ${tenant.slug}`)
  console.log(`  Tipo:     ${tenant.type}`)
  console.log(`  Plan:     ${tenant.plan_type}  →  clinic_complete`)
  console.log(`  Estado:   ${tenant.status}`)

  const [updated] = await sql`
    UPDATE tenants
    SET plan_type  = 'clinic_complete',
        type       = 'HOSPITAL',
        status     = 'active',
        updated_at = NOW()
    WHERE id = ${tenant.id}
    RETURNING id, name, plan_type, type, status
  `

  console.log('\n✓ Tenant actualizado:')
  console.log(`  Plan:   ${updated.plan_type}`)
  console.log(`  Tipo:   ${updated.type}`)
  console.log(`  Estado: ${updated.status}`)
  console.log('\nRecarga la sesión (logout + login) para que el frontend refleje los cambios.')

  await sql.end()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
