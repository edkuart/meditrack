import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}

const migrationClient = postgres(connectionString, { max: 1 })

async function runMigrations() {
  console.log('Running migrations...')
  const db = drizzle(migrationClient)
  await migrate(db, { migrationsFolder: './src/shared/db/migrations' })
  console.log('Migrations complete')
  await migrationClient.end()
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
