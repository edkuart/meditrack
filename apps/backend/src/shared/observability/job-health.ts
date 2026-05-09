import { log, serializeError } from './logger.ts'

export interface JobHealth {
  name: string
  status: 'idle' | 'running' | 'ok' | 'error'
  runs: number
  failures: number
  last_started_at: string | null
  last_finished_at: string | null
  last_duration_ms: number | null
  last_error: string | null
}

const jobs = new Map<string, JobHealth>()

function ensureJob(name: string): JobHealth {
  const existing = jobs.get(name)
  if (existing) return existing

  const created: JobHealth = {
    name,
    status: 'idle',
    runs: 0,
    failures: 0,
    last_started_at: null,
    last_finished_at: null,
    last_duration_ms: null,
    last_error: null,
  }
  jobs.set(name, created)
  return created
}

export function registerJob(name: string) {
  ensureJob(name)
}

export async function runMonitoredJob(name: string, fn: () => Promise<void>) {
  const job = ensureJob(name)
  const started = Date.now()
  job.status = 'running'
  job.runs += 1
  job.last_started_at = new Date(started).toISOString()
  job.last_error = null

  try {
    await fn()
    job.status = 'ok'
    log.info('job.completed', {
      job: name,
      duration_ms: Date.now() - started,
    })
  } catch (error) {
    job.status = 'error'
    job.failures += 1
    job.last_error = error instanceof Error ? error.message : String(error)
    log.error('job.failed', {
      job: name,
      duration_ms: Date.now() - started,
      error: serializeError(error),
    })
  } finally {
    job.last_finished_at = new Date().toISOString()
    job.last_duration_ms = Date.now() - started
  }
}

export function getJobHealth(): JobHealth[] {
  return Array.from(jobs.values()).map((job) => ({ ...job }))
}
