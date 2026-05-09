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

interface AuthState {
  token: string | null
  user: DoctorUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<DoctorUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const persistTokens = useCallback((accessToken: string, refreshToken: string) => {
    localStorage.setItem(TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    setToken(accessToken)
  }, [])

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const refresh = useCallback(async () => {
    const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (!storedRefresh) throw new Error('Missing refresh token')
    const next = await refreshSession(storedRefresh)
    persistTokens(next.access_token, next.refresh_token)
    return next.access_token
  }, [persistTokens])

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (!stored && !storedRefresh) { setIsLoading(false); return }

    if (stored) setToken(stored)

    const ensureToken = stored
      ? Promise.resolve(stored)
      : refresh()

    ensureToken
      .then(accessToken => getMe(accessToken))
      .then(setUser)
      .catch(async () => {
        try {
          const accessToken = await refresh()
          setUser(await getMe(accessToken))
        } catch {
          clearSession()
        }
      })
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
    persistTokens(result.access_token, result.refresh_token)
    setUser(result.user)
  }, [persistTokens])

  const logout = useCallback(() => {
    const currentToken = localStorage.getItem(TOKEN_KEY)
    const currentRefresh = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (currentToken) {
      logoutSession(currentToken, currentRefresh ?? undefined).catch(() => {})
    }
    clearSession()
  }, [clearSession])

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout }}>
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
