function required(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

function bool(key: string, fallback = 'false'): boolean {
  return ['1', 'true', 'yes', 'on'].includes(optional(key, fallback).toLowerCase())
}

function csv(key: string, fallback: string): string[] {
  return optional(key, fallback)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function secureSecret(key: string, fallback: string): string {
  const value = optional(key, fallback)
  const isProduction = optional('NODE_ENV', 'development') === 'production'
  if (isProduction && (value === fallback || value.length < 32)) {
    throw new Error(`${key} must be at least 32 characters and cannot use the development fallback in production`)
  }
  return value
}

export const config = {
  env: optional('NODE_ENV', 'development'),
  host: optional('HOST', '0.0.0.0'),
  port: Number(optional('PORT', '3001')),
  frontendUrl: optional('FRONTEND_URL', 'http://localhost:3000'),
  frontendOrigins: csv('FRONTEND_URLS', optional('FRONTEND_URL', 'http://localhost:3000')),

  db: {
    url: required('DATABASE_URL'),
  },

  jwt: {
    issuer: optional('JWT_ISSUER', 'meditrack-api'),
    audience: optional('JWT_AUDIENCE', 'meditrack-clinical'),
    secret: secureSecret('JWT_SECRET', 'dev-secret-change-in-production-min-32-chars'),
    refreshSecret: secureSecret('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-in-production'),
    accessExpiresIn: optional('JWT_ACCESS_EXPIRES_IN', '15m'),
    refreshExpiresInDays: 30,
  },

  email: {
    apiKey: optional('RESEND_API_KEY', ''),
    from: optional('EMAIL_FROM', 'meditrack <noreply@meditrack.app>'),
  },

  whatsapp: {
    accountSid: optional('TWILIO_ACCOUNT_SID', ''),
    authToken: optional('TWILIO_AUTH_TOKEN', ''),
    from: optional('TWILIO_WHATSAPP_FROM', 'whatsapp:+14155238886'),
  },

  stripe: {
    secretKey: optional('STRIPE_SECRET_KEY', ''),
    proPriceId: optional('STRIPE_PRO_PRICE_ID', ''),
    webhookSecret: optional('STRIPE_WEBHOOK_SECRET', ''),
  },

  ai: {
    provider: optional('AI_PROVIDER', 'local'),
    externalEnabled: bool('AI_EXTERNAL_ENABLED'),
    fallbackToLocal: bool('AI_FALLBACK_TO_LOCAL', 'true'),
    timeoutMs: Number(optional('AI_PROVIDER_TIMEOUT_MS', '25000')),
    openai: {
      apiKey: optional('OPENAI_API_KEY', ''),
      model: optional('OPENAI_MODEL', 'gpt-5-mini'),
      premiumModel: optional('OPENAI_PREMIUM_MODEL', 'gpt-5.5'),
    },
    anthropic: {
      apiKey: optional('ANTHROPIC_API_KEY', ''),
      model: optional('ANTHROPIC_MODEL', 'claude-haiku-4-5-20251001'),
      premiumModel: optional('ANTHROPIC_PREMIUM_MODEL', 'claude-sonnet-4-6'),
    },
  },
} as const
