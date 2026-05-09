import { randomUUID } from 'node:crypto'
import type { Context, Next } from 'hono'
import { log } from '../observability/logger.ts'

declare module 'hono' {
  interface ContextVariableMap {
    requestId: string
    requestStartedAt: number
  }
}

function clientIp(c: Context) {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? c.req.header('x-real-ip')
    ?? 'unknown'
}

export async function requestContext(c: Context, next: Next) {
  const incoming = c.req.header('x-request-id')
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID()

  c.set('requestId', requestId)
  c.set('requestStartedAt', Date.now())
  c.header('X-Request-Id', requestId)

  await next()
}

export async function structuredRequestLogger(c: Context, next: Next) {
  const started = Date.now()
  const requestId = c.get('requestId')

  try {
    await next()
  } finally {
    const durationMs = Date.now() - started
    const status = c.res.status
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'

    log[level]('http.request', {
      request_id: requestId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status,
      duration_ms: durationMs,
      ip: clientIp(c),
      user_agent: c.req.header('user-agent'),
    })
  }
}
