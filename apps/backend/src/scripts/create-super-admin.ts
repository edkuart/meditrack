import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db, tenants, users } from '../shared/db/index.ts'

const email = process.env.SUPER_ADMIN_EMAIL?.trim() || 'superadmin@meditrack.app'
const password = process.env.SUPER_ADMIN_PASSWORD?.trim() || `${crypto.randomBytes(18).toString('base64url')}Aa9!`
const tenantSlug = process.env.SUPER_ADMIN_TENANT_SLUG?.trim() || 'meditrack-platform'
const tenantName = process.env.SUPER_ADMIN_TENANT_NAME?.trim() || 'Meditrack Platform'
const now = new Date()

async function main() {
  let tenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, tenantSlug),
  })

  if (!tenant) {
    const inserted = await db
      .insert(tenants)
      .values({
        name: tenantName,
        slug: tenantSlug,
        type: 'CLINIC',
        plan_type: 'enterprise',
        status: 'active',
        settings: {},
      })
      .returning()
    tenant = inserted[0]
  }

  const passwordHash = await bcrypt.hash(password, 12)
  let user = await db.query.users.findFirst({
    where: eq(users.email, email),
  })

  if (user) {
    const updated = await db
      .update(users)
      .set({
        tenant_id: tenant.id,
        password_hash: passwordHash,
        role: 'SUPER_ADMIN',
        first_name: 'Platform',
        last_name: 'Admin',
        is_verified: true,
        is_active: true,
        verification_rejected_at: null,
        verification_rejected_reason: null,
        two_fa_enabled: false,
        two_fa_secret_encrypted: null,
        two_fa_confirmed_at: null,
        updated_at: now,
      })
      .where(eq(users.id, user.id))
      .returning()
    user = updated[0]
  } else {
    const inserted = await db
      .insert(users)
      .values({
        tenant_id: tenant.id,
        email,
        password_hash: passwordHash,
        role: 'SUPER_ADMIN',
        first_name: 'Platform',
        last_name: 'Admin',
        is_verified: true,
        is_active: true,
        tos_accepted_at: now,
        privacy_policy_accepted_at: now,
      })
      .returning()
    user = inserted[0]
  }

  console.log(JSON.stringify({
    email,
    password,
    user_id: user.id,
    tenant_id: tenant.id,
    role: user.role,
    mfa_setup_required_on_first_login: true,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error('Failed to create super admin:', err)
    process.exit(1)
  })
