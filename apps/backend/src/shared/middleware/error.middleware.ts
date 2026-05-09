import type { Context } from 'hono'
import { AppError } from '../errors.ts'
import { log, serializeError } from '../observability/logger.ts'

export function errorHandler(err: Error, c: Context) {
  const requestId = c.get('requestId')

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      log.error('http.app_error', {
        request_id: requestId,
        status: err.statusCode,
        code: err.code,
        error: serializeError(err),
      })
    }

    return c.json(
      {
        success: false,
        request_id: requestId,
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      },
      err.statusCode as 400 | 401 | 403 | 404 | 409 | 422 | 500,
    )
  }

  log.error('http.unhandled_error', {
    request_id: requestId,
    error: serializeError(err),
  })

  return c.json(
    {
      success: false,
      request_id: requestId,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    },
    500,
  )
}
