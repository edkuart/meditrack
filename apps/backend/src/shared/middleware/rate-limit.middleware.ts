import type { Context, MiddlewareHandler } from 'hono'

interface RateLimitOptions {
  windowMs: number
  max: number
  keyPrefix: string
}

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

function clientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || c.req.header('x-real-ip') || 'unknown'
}

function cleanup(now: number) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    const now = Date.now()
    cleanup(now)

    const key = `${options.keyPrefix}:${clientIp(c)}`
    const current = buckets.get(key)
    const bucket =
      current && current.resetAt > now
        ? current
        : { count: 0, resetAt: now + options.windowMs }

    bucket.count += 1
    buckets.set(key, bucket)

    const remaining = Math.max(options.max - bucket.count, 0)
    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000)

    c.header('X-RateLimit-Limit', String(options.max))
    c.header('X-RateLimit-Remaining', String(remaining))
    c.header('X-RateLimit-Reset', String(resetSeconds))

    if (bucket.count > options.max) {
      c.header('Retry-After', String(resetSeconds))
      return c.json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many attempts. Please try again later.',
        },
      }, 429)
    }

    await next()
  }
}

export function resetRateLimitBuckets() {
  buckets.clear()
}
