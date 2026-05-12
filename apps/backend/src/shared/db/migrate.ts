import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'

const connectionString = process.env.DATABASE_URL ?? ''

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}

const maxAttempts = Number(process.env.DB_MIGRATION_ATTEMPTS ?? '30')
const retryDelayMs = Number(process.env.DB_MIGRATION_RETRY_DELAY_MS ?? '5000')

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runMigrations() {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const migrationClient = postgres(connectionString, {
      max: 1,
      connect_timeout: 10,
    })

    try {
      console.log(`Running migrations... attempt ${attempt}/${maxAttempts}`)
      const db = drizzle(migrationClient)
      await migrate(db, { migrationsFolder: './src/shared/db/migrations' })
      console.log('Migrations complete')
      await migrationClient.end()
      return
    } catch (err) {
      await migrationClient.end({ timeout: 1 }).catch(() => undefined)

      if (attempt === maxAttempts) {
        throw err
      }

      console.warn(`Migration attempt ${attempt} failed. Retrying in ${retryDelayMs}ms...`, err)
      await sleep(retryDelayMs)
    }
  }
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
