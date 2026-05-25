'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import {
  login as apiLogin,
  getMe,
  refreshSession,
  logoutSession,
  type DoctorUser,
} from './api'

const TOKEN_KEY = 'meditrack_doctor_token'
const REFRESH_TOKEN_KEY = 'meditrack_doctor_refresh_token'
const REFRESH_SKEW_MS = 60_000
let refreshInFlight: Promise<string> | null = null

function refreshAccessTokenOnce() {
  if (!refreshInFlight) {
    refreshInFlight = refreshSession()
      .then(next => next.access_token)
      .finally(() => {
        refreshInFlight = null
      })
  }
  return refreshInFlight
}

interface AuthState {
  token: string | null
  user: DoctorUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<DoctorUser>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<DoctorUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const persistAccessToken = useCallback((accessToken: string) => {
    setToken(accessToken)
  }, [])

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const refresh = useCallback(async () => {
    const accessToken = await refreshAccessTokenOnce()
    persistAccessToken(accessToken)
    return accessToken
  }, [persistAccessToken])

  useEffect(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)

    refresh()
      .then(accessToken => getMe(accessToken))
      .then(setUser)
      .catch(clearSession)
      .finally(() => setIsLoading(false))
  }, [clearSession, refresh])

  useEffect(() => {
    if (!token) return

    const exp = decodeJwtExp(token)
    if (!exp) return

    const delay = Math.max(exp - Date.now() - REFRESH_SKEW_MS, 5_000)
    const timer = window.setTimeout(() => {
      refresh().catch(clearSession)
    }, delay)

    return () => window.clearTimeout(timer)
  }, [token, refresh, clearSession])

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiLogin(email, password)
    persistAccessToken(result.access_token)
    setUser(result.user)
    return result.user
  }, [persistAccessToken])

  const logout = useCallback(() => {
    logoutSession(token).catch(() => {})
    clearSession()
  }, [token, clearSession])

  const refreshUser = useCallback(async () => {
    if (!token) return
    const updated = await getMe(token)
    setUser(updated)
  }, [token])

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

function decodeJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as { exp?: number }
    return payload.exp ? payload.exp * 1000 : null
  } catch {
    return null
  }
}
