# MediTrack Deployment

## Railway: backend

Deploy the backend as a Railway service from the repository root.

Recommended service settings:

- Root Directory: `/`
- Config file path: `/railway.json` or leave it empty so Railway uses the root config
- Dockerfile path: handled by `railway.json`
- Healthcheck path: `/health`

Create a Railway PostgreSQL service and set `DATABASE_URL` in the backend service from its connection string.

Required production variables:

```env
NODE_ENV=production
HOST=0.0.0.0
DATABASE_URL=postgresql://...
FRONTEND_URL=https://your-vercel-domain.vercel.app
FRONTEND_URLS=https://your-vercel-domain.vercel.app
JWT_SECRET=generate-a-strong-secret-at-least-32-chars
JWT_REFRESH_SECRET=generate-another-strong-secret-at-least-32-chars
```

Optional integrations:

```env
RESEND_API_KEY=
EMAIL_FROM=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
AWS_S3_ENDPOINT=
STRIPE_SECRET_KEY=
STRIPE_PRO_PRICE_ID=
STRIPE_WEBHOOK_SECRET=
```

The Docker container runs database migrations before starting the API.

## Vercel: frontend

Deploy the frontend as a Vercel project from the same repository.

Recommended project settings:

- Framework Preset: Next.js
- Root Directory: `apps/frontend`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: Next.js default

Required variable:

```env
NEXT_PUBLIC_API_URL=https://your-railway-api-domain.up.railway.app/api/v1
```

After Vercel gives you the production URL, update the Railway backend:

```env
FRONTEND_URL=https://your-vercel-domain.vercel.app
FRONTEND_URLS=https://your-vercel-domain.vercel.app
```

For preview deployments, add each preview origin to `FRONTEND_URLS`, separated by commas.
