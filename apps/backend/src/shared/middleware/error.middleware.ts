import type { Context } from 'hono'
import { AppError } from '../errors.ts'

export function errorHandler(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      },
      err.statusCode as 400 | 401 | 403 | 404 | 409 | 422 | 500,
    )
  }

  console.error('[unhandled error]', err)

  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    },
    500,
  )
}
