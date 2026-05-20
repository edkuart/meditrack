import { db, staffInvitations } from '../shared/db/index.ts'
import { eq, and, isNull } from 'drizzle-orm'
import { generateOpaqueToken, hashToken } from '../shared/services/token.service.ts'

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'
const INVITE_EXPIRES_DAYS = 7

// Find the first non-accepted, non-expired invite
const invite = await db.query.staffInvitations.findFirst({
  where: and(isNull(staffInvitations.accepted_at)),
  columns: { id: true, email: true, role: true, expires_at: true },
})

if (!invite) {
  console.log('No pending invitations found.')
  process.exit(1)
}

// Generate a fresh token and update the hash in DB
const rawToken = generateOpaqueToken()
const tokenHash = hashToken(rawToken)
const expiresAt = new Date()
expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRES_DAYS)

await db.update(staffInvitations)
  .set({ token_hash: tokenHash, expires_at: expiresAt })
  .where(eq(staffInvitations.id, invite.id))

const url = `${FRONTEND_URL}/accept-invite?token=${rawToken}`

console.log('\n[fresh-invite] ────────────────────────────────────')
console.log(`  Email: ${invite.email}`)
console.log(`  Role:  ${invite.role}`)
console.log(`  Link:  ${url}`)
console.log('────────────────────────────────────────────────────\n')

process.exit(0)
