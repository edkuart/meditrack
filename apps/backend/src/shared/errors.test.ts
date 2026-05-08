import { describe, it, expect } from 'vitest'
import {
  AppError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from './errors.ts'

describe('AppError hierarchy', () => {
  it('UnauthorizedError has status 401', () => {
    const err = new UnauthorizedError()
    expect(err.statusCode).toBe(401)
    expect(err.code).toBe('UNAUTHORIZED')
  })

  it('ForbiddenError has status 403', () => {
    const err = new ForbiddenError()
    expect(err.statusCode).toBe(403)
  })

  it('NotFoundError formats message correctly', () => {
    const err = new NotFoundError('Patient')
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('PATIENT_NOT_FOUND')
    expect(err.message).toBe('Patient not found')
  })

  it('ConflictError has status 409', () => {
    const err = new ConflictError('Email already taken')
    expect(err.statusCode).toBe(409)
  })

  it('ValidationError has status 422 and details', () => {
    const err = new ValidationError('Invalid input', { field: 'email' })
    expect(err.statusCode).toBe(422)
    expect(err.details).toEqual({ field: 'email' })
  })

  it('all errors are instanceof AppError', () => {
    expect(new UnauthorizedError()).toBeInstanceOf(AppError)
    expect(new ForbiddenError()).toBeInstanceOf(AppError)
    expect(new NotFoundError('X')).toBeInstanceOf(AppError)
    expect(new ConflictError('X')).toBeInstanceOf(AppError)
    expect(new ValidationError('X')).toBeInstanceOf(AppError)
  })
})
