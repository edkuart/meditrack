import { serve } from '@hono/node-server'
import { config } from './shared/config.ts'
import app from './app.ts'
import { startScheduler } from './modules/notifications/scheduler/index.ts'

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, () => {
  console.log(`meditrack api running on http://${config.host}:${config.port}`)
  startScheduler()
})
