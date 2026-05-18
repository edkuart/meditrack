const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'

async function billingFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed')
  return json.data as T
}

export interface BillingStatus {
  plan: 'free' | 'pro' | 'enterprise'
  limits: { max_patients: number; max_staff: number }
  usage: { patients: number; staff: number }
  subscription: { id: string; current_period_end: string | null } | null
}

export async function getBillingStatus(token: string): Promise<BillingStatus> {
  return billingFetch('/billing/status', token)
}

export async function createCheckoutSession(token: string): Promise<{ url: string }> {
  return billingFetch('/billing/checkout', token, { method: 'POST' })
}

export async function createPortalSession(token: string): Promise<{ url: string }> {
  return billingFetch('/billing/portal', token, { method: 'POST' })
}
