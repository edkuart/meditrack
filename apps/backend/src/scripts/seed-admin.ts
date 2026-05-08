/**
 * Seed script — creates a demo clinic with admin + doctor + patients + treatments.
 * Safe to run multiple times (checks for existing records by slug / email / id_number).
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx src/scripts/seed-admin.ts
 *   or add db:seed to package.json scripts and run: npm run db:seed
 */

import bcrypt from 'bcryptjs'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import * as schema from '../shared/db/schema/index.ts'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL is not set')
  process.exit(1)
}

const client = postgres(DATABASE_URL, { max: 1 })
const db = drizzle(client, { schema })

// ─── helpers ──────────────────────────────────────────────────────────────────

async function hashPw(pw: string) {
  return bcrypt.hash(pw, 12)
}

function dateOffset(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱  Seeding meditrack demo data…\n')

  // ── Tenant ───────────────────────────────────────────────────────────────────

  let tenant = await db.query.tenants.findFirst({
    where: eq(schema.tenants.slug, 'clinica-demo'),
  })

  if (!tenant) {
    ;[tenant] = await db.insert(schema.tenants).values({
      name: 'Clínica Demo',
      slug: 'clinica-demo',
    }).returning()
    console.log(`✓  Tenant: ${tenant.name}  (${tenant.id})`)
  } else {
    console.log(`→  Tenant already exists: ${tenant.name}`)
  }

  // ── Admin user ────────────────────────────────────────────────────────────────

  let adminUser = await db.query.users.findFirst({
    where: eq(schema.users.email, 'admin@demo.com'),
  })

  if (!adminUser) {
    ;[adminUser] = await db.insert(schema.users).values({
      tenant_id: tenant.id,
      email: 'admin@demo.com',
      password_hash: await hashPw('Demo123!'),
      first_name: 'Admin',
      last_name: 'Clínica',
      role: 'ADMIN_CLINIC',
      is_verified: true,
    }).returning()
    console.log(`✓  Admin user: admin@demo.com  /  Demo123!`)
  } else {
    console.log(`→  Admin user already exists`)
  }

  // ── Doctor user ───────────────────────────────────────────────────────────────

  let doctorUser = await db.query.users.findFirst({
    where: eq(schema.users.email, 'doctor@demo.com'),
  })

  if (!doctorUser) {
    ;[doctorUser] = await db.insert(schema.users).values({
      tenant_id: tenant.id,
      email: 'doctor@demo.com',
      password_hash: await hashPw('Demo123!'),
      first_name: 'María',
      last_name: 'García',
      role: 'DOCTOR',
      specialty: 'Cardiología',
      is_verified: true,
    }).returning()
    console.log(`✓  Doctor user: doctor@demo.com  /  Demo123!`)
  } else {
    console.log(`→  Doctor user already exists`)
  }

  // ── Patient 1: Carlos Martínez ────────────────────────────────────────────────

  let patient1 = await db.query.patients.findFirst({
    where: eq(schema.patients.id_number, 'DEMO-001'),
  })

  if (!patient1) {
    ;[patient1] = await db.insert(schema.patients).values({
      tenant_id: tenant.id,
      first_name: 'Carlos',
      last_name: 'Martínez',
      date_of_birth: '1970-04-15',
      sex: 'male',
      phone: '+52 55 1234 5678',
      email: 'carlos.martinez@example.com',
      id_number: 'DEMO-001',
      notes: 'Hipertensión arterial y diabetes tipo 2. Control mensual.',
      created_by: doctorUser.id,
    }).returning()
    console.log(`✓  Patient 1: Carlos Martínez`)
  } else {
    console.log(`→  Patient 1 already exists`)
  }

  // ── Patient 2: Ana López ──────────────────────────────────────────────────────

  let patient2 = await db.query.patients.findFirst({
    where: eq(schema.patients.id_number, 'DEMO-002'),
  })

  if (!patient2) {
    ;[patient2] = await db.insert(schema.patients).values({
      tenant_id: tenant.id,
      first_name: 'Ana',
      last_name: 'López',
      date_of_birth: '1985-09-30',
      sex: 'female',
      phone: '+52 33 9876 5432',
      email: 'ana.lopez@example.com',
      id_number: 'DEMO-002',
      created_by: doctorUser.id,
    }).returning()
    console.log(`✓  Patient 2: Ana López`)
  } else {
    console.log(`→  Patient 2 already exists`)
  }

  // ── Encounter + Treatment for Carlos ─────────────────────────────────────────

  const existingEncounter = await db.query.encounters.findFirst({
    where: eq(schema.encounters.patient_id, patient1.id),
  })

  if (!existingEncounter) {
    const [encounter] = await db.insert(schema.encounters).values({
      tenant_id: tenant.id,
      patient_id: patient1.id,
      doctor_id: doctorUser.id,
      encounter_type: 'CONSULTATION',
      status: 'OPEN',
      chief_complaint: 'Control mensual de hipertensión',
      notes: 'Presión arterial 140/90 mmHg. Paciente refiere adherencia al tratamiento.',
    }).returning()

    const startDate = dateOffset(-10)
    const endDate = dateOffset(20)

    const [plan] = await db.insert(schema.treatmentPlans).values({
      tenant_id: tenant.id,
      patient_id: patient1.id,
      encounter_id: encounter.id,
      created_by: doctorUser.id,
      name: 'Tratamiento hipertensión + diabetes',
      status: 'ACTIVE',
      start_date: startDate,
      end_date: endDate,
      instructions: 'Tomar con abundante agua. Monitorear presión arterial diariamente.',
      activated_at: new Date(),
    }).returning()

    await db.insert(schema.medicationItems).values([
      {
        treatment_plan_id: plan.id,
        drug_name: 'Losartán',
        presentation: 'Tabletas 50 mg',
        dose_amount: 1,
        dose_unit: 'tableta',
        route: 'oral',
        frequency_type: 'DAILY',
        duration_days: 30,
        with_food: false,
        sort_order: 0,
      },
      {
        treatment_plan_id: plan.id,
        drug_name: 'Metformina',
        presentation: 'Tabletas 850 mg',
        dose_amount: 1,
        dose_unit: 'tableta',
        route: 'oral',
        frequency_type: 'DAILY',
        duration_days: 30,
        with_food: true,
        special_instructions: 'Tomar durante la comida para reducir molestias gástricas.',
        sort_order: 1,
      },
    ])

    console.log(`✓  Encounter + treatment plan (2 medications) for Carlos`)
  } else {
    console.log(`→  Encounter already exists for Carlos`)
  }

  // ── Encounter for Ana ─────────────────────────────────────────────────────────

  const existingEncounter2 = await db.query.encounters.findFirst({
    where: eq(schema.encounters.patient_id, patient2.id),
  })

  if (!existingEncounter2) {
    const [encounter2] = await db.insert(schema.encounters).values({
      tenant_id: tenant.id,
      patient_id: patient2.id,
      doctor_id: doctorUser.id,
      encounter_type: 'FOLLOW_UP',
      status: 'OPEN',
      chief_complaint: 'Seguimiento asma bronquial',
      notes: 'Paciente controlada. Se ajusta dosis de broncodilatador.',
    }).returning()

    const [plan2] = await db.insert(schema.treatmentPlans).values({
      tenant_id: tenant.id,
      patient_id: patient2.id,
      encounter_id: encounter2.id,
      created_by: doctorUser.id,
      name: 'Tratamiento asma',
      status: 'ACTIVE',
      start_date: dateOffset(-5),
      end_date: dateOffset(25),
      activated_at: new Date(),
    }).returning()

    await db.insert(schema.medicationItems).values([
      {
        treatment_plan_id: plan2.id,
        drug_name: 'Salbutamol',
        presentation: 'Inhalador 100 mcg/dosis',
        dose_amount: 2,
        dose_unit: 'inhalaciones',
        route: 'inhalada',
        frequency_type: 'AS_NEEDED',
        with_food: false,
        special_instructions: 'Agitar antes de usar. Máximo 8 inhalaciones en 24 h.',
        sort_order: 0,
      },
      {
        treatment_plan_id: plan2.id,
        drug_name: 'Fluticasona',
        presentation: 'Inhalador 250 mcg/dosis',
        dose_amount: 1,
        dose_unit: 'inhalación',
        route: 'inhalada',
        frequency_type: 'EVERY_X_HOURS',
        frequency_value: 12,
        duration_days: 30,
        with_food: false,
        sort_order: 1,
      },
    ])

    console.log(`✓  Encounter + treatment plan (2 medications) for Ana`)
  } else {
    console.log(`→  Encounter already exists for Ana`)
  }

  // ─────────────────────────────────────────────────────────────────────────────

  console.log('\n✅  Done! Demo data is ready.\n')
  console.log('📋  Credentials:')
  console.log('    Admin:   admin@demo.com   /  Demo123!')
  console.log('    Doctor:  doctor@demo.com  /  Demo123!\n')
  console.log('🌐  Frontend: http://localhost:3000')
  console.log('🔌  API:      http://localhost:3001')
}

seed()
  .catch(err => { console.error('\n❌  Seed failed:', err.message); process.exit(1) })
  .finally(() => client.end())
