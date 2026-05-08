export interface ApiSuccess<T> {
  success: true
  data: T
  meta?: {
    page?: number
    total?: number
    request_id?: string
  }
}

export interface ApiError {
  success: false
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError
