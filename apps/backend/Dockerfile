FROM node:20-alpine AS base
WORKDIR /app

# ── Install dependencies ──────────────────────────────────────────────────────
# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
# packages/ workspace (shared types etc.)
COPY packages/ ./packages/

RUN npm ci --workspace=apps/backend --include-workspace-root

# ── Copy source ───────────────────────────────────────────────────────────────
COPY apps/backend/src ./apps/backend/src
COPY apps/backend/tsconfig.json ./apps/backend/
COPY apps/backend/drizzle.config.ts ./apps/backend/

# ── Production image ──────────────────────────────────────────────────────────
FROM base AS production

WORKDIR /app/apps/backend

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Run migrations first; abort container startup if they fail so Railway retries
# rather than serving requests against a stale schema.
# tsx is in devDependencies — kept intentionally since noEmit: true prevents tsc build
CMD ["sh", "-c", "npx tsx src/shared/db/migrate.ts && npx tsx src/index.ts"]
