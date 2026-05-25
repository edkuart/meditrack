import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db, tenants, users } from '../shared/db/index.ts'

const explicitEmail = process.env.SUPER_ADMIN_EMAIL?.trim()
const explicitPassword = process.env.SUPER_ADMIN_PASSWORD?.trim()
const isProduction = process.env.NODE_ENV === 'production'

if (isProduction && (!explicitEmail || !explicitPassword)) {
  console.log('[admin:create] SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD not set; skipping bootstrap.')
  process.exit(0)
}

const email = explicitEmail || 'superadmin@meditrack.app'
const password = explicitPassword || `${crypto.randomBytes(18).toString('base64url')}Aa9!`
const tenantSlug = process.env.SUPER_ADMIN_TENANT_SLUG?.trim() || 'meditrack-platform'
const tenantName = process.env.SUPER_ADMIN_TENANT_NAME?.trim() || 'Meditrack Platform'
const resetExistingPassword = ['1', 'true', 'yes', 'on'].includes(
  (process.env.SUPER_ADMIN_RESET_PASSWORD || '').toLowerCase(),
)
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
  let created = false
  let passwordUpdated = false

  if (user) {
    const patch: Partial<typeof users.$inferInsert> = {
      tenant_id: tenant.id,
      role: 'SUPER_ADMIN',
      first_name: user.first_name || 'Platform',
      last_name: user.last_name || 'Admin',
      is_verified: true,
      is_active: true,
      verification_rejected_at: null,
      verification_rejected_reason: null,
      updated_at: now,
    }

    if (resetExistingPassword) {
      patch.password_hash = passwordHash
      patch.two_fa_enabled = false
      patch.two_fa_secret_encrypted = null
      patch.two_fa_confirmed_at = null
      passwordUpdated = true
    }

    const updated = await db
      .update(users)
      .set(patch)
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
    created = true
    passwordUpdated = true
  }

  console.log(JSON.stringify({
    email,
    user_id: user.id,
    tenant_id: tenant.id,
    role: user.role,
    created,
    password_updated: passwordUpdated,
    mfa_setup_required_on_first_login: created || resetExistingPassword,
    password: !isProduction && passwordUpdated ? password : undefined,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error('Failed to create super admin:', err)
    process.exit(1)
  })
