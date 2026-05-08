'use client'

const SESSION_KEY = 'meditrack_patient_session'

export interface PatientSession {
  token: string
  patient: { id: string; first_name: string; last_name: string }
}

export function saveSession(session: PatientSession) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {}
}

export function getSession(): PatientSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {}
}
