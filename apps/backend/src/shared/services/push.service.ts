import webpush from 'web-push'
import { eq, and } from 'drizzle-orm'
import { db, pushSubscriptions } from '../db/index.ts'

// ─── VAPID setup ──────────────────────────────────────────────────────────────
// Generate once with: npx web-push generate-vapid-keys
// Then add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to .env

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  ?? ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? ''
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     ?? 'mailto:admin@meditrack.app'

let initialized = false

function ensureInit() {
  if (initialized || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  initialized = true
}

// ─── Subscribe ────────────────────────────────────────────────────────────────

export async function saveSubscription(
  userId: string,
  tenantId: string,
  endpoint: string,
  p256dh: string,
  auth: string,
  userAgent?: string,
) {
  await db
    .insert(pushSubscriptions)
    .values({ user_id: userId, tenant_id: tenantId, endpoint, p256dh, auth, user_agent: userAgent })
    .onConflictDoUpdate({
      target: [pushSubscriptions.user_id, pushSubscriptions.endpoint],
      set: { p256dh, auth, last_used_at: new Date() },
    })
}

// ─── Unsubscribe ──────────────────────────────────────────────────────────────

export async function removeSubscription(userId: string, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.user_id, userId), eq(pushSubscriptions.endpoint, endpoint)))
}

// ─── Send push notification to a user (all their active subscriptions) ────────

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string },
) {
  ensureInit()
  if (!initialized) return // VAPID not configured — skip silently

  const subs = await db.query.pushSubscriptions.findMany({
    where: eq(pushSubscriptions.user_id, userId),
    columns: { endpoint: true, p256dh: true, auth: true },
  })
  if (subs.length === 0) return

  const payloadStr = JSON.stringify(payload)

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadStr,
          { TTL: 3600 },
        )
        // Update last_used_at
        await db
          .update(pushSubscriptions)
          .set({ last_used_at: new Date() })
          .where(and(
            eq(pushSubscriptions.user_id, userId),
            eq(pushSubscriptions.endpoint, sub.endpoint),
          ))
      } catch (err: unknown) {
        // If the subscription is gone (410) or invalid (404), delete it
        const status = (err as { statusCode?: number })?.statusCode
        if (status === 410 || status === 404) {
          await db
            .delete(pushSubscriptions)
            .where(and(
              eq(pushSubscriptions.user_id, userId),
              eq(pushSubscriptions.endpoint, sub.endpoint),
            ))
        }
      }
    }),
  )
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY
}
