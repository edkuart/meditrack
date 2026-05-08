function required(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export const config = {
  env: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '3001')),
  frontendUrl: optional('FRONTEND_URL', 'http://localhost:3000'),

  db: {
    url: required('DATABASE_URL'),
  },

  jwt: {
    secret: optional('JWT_SECRET', 'dev-secret-change-in-production-min-32-chars'),
    refreshSecret: optional('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-in-production'),
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
} as const
