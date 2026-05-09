import type { Context, Next } from 'hono'
import { config } from '../config.ts'

const apiCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ')

export async function securityHeaders(c: Context, next: Next) {
  await next()

  c.header('Content-Security-Policy', apiCsp)
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  c.header('Cross-Origin-Resource-Policy', 'same-site')
  c.header('Cross-Origin-Opener-Policy', 'same-origin')
  c.header('X-DNS-Prefetch-Control', 'off')

  if (config.env === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
}
