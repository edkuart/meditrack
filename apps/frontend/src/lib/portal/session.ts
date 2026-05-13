'use client'

const SESSION_KEY = 'meditrack_patient_session'

export interface PatientSession {
  token: string
  patient: { id: string; first_name: string; last_name: string }
}

type StoredPatientSession = Partial<PatientSession> & {
  session_token?: unknown
  patient?: Partial<PatientSession['patient']>
}

export function saveSession(session: PatientSession) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {}
}

export function getSession(): PatientSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null

    const stored = JSON.parse(raw) as StoredPatientSession
    const token = typeof stored.token === 'string'
      ? stored.token
      : typeof stored.session_token === 'string'
        ? stored.session_token
        : ''
    const patient = stored.patient

    if (
      !token ||
      !patient ||
      typeof patient.id !== 'string' ||
      typeof patient.first_name !== 'string' ||
      typeof patient.last_name !== 'string'
    ) {
      clearSession()
      return null
    }

    const session = { token, patient: {
      id: patient.id,
      first_name: patient.first_name,
      last_name: patient.last_name,
    } }

    if (stored.token !== token) saveSession(session)
    return session
  } catch {
    clearSession()
    return null
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {}
}
