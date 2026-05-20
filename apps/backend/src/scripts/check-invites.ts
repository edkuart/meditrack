import { db } from '../shared/db/index.ts'
import { staffInvitations } from '../shared/db/index.ts'

const rows = await db.select().from(staffInvitations)
console.log('Pending invitations:')
rows.forEach(r => {
  console.log({ id: r.id, email: r.email, accepted_at: r.accepted_at, expires_at: r.expires_at })
})
process.exit(0)
