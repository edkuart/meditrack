const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'

export interface OnboardingStatus {
  completed: boolean
  completed_count: number
  total_count: number
  steps: {
    has_patient: boolean
    has_encounter: boolean
    has_treatment: boolean
    has_staff: boolean
    has_billing: boolean
  }
}

export async function getOnboardingStatus(token: string): Promise<OnboardingStatus> {
  const res = await fetch(`${API}/onboarding/status`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed')
  return json.data as OnboardingStatus
}
