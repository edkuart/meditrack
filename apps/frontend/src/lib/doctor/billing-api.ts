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
  plan: 'free' | 'pro' | 'enterprise' | 'doctor_individual' | 'clinic_complete'
  base_plan: 'free' | 'pro' | 'enterprise' | 'doctor_individual' | 'clinic_complete'
  access_grant: {
    id: string
    grant_type: string
    starts_at: string
    ends_at: string
    reason: string
  } | null
  commercial_state: {
    trial_status: 'active' | 'expiring' | 'expired' | 'converted' | 'none'
    days_remaining: number | null
    latest_grant_status: 'active' | 'expired' | 'revoked' | 'converted' | null
    latest_grant_ended_at: string | null
  }
  limits: { max_organizations: number; max_patients: number; max_staff: number; max_ai_units_monthly?: number }
  capabilities?: string[]
  usage: {
    patients: number
    staff: number
    ai_units_monthly?: number
    ai_units_remaining?: number
    ai_period_starts_at?: string
  }
  subscription: { id: string; provider?: 'recurrente' | 'stripe'; current_period_end: string | null } | null
}

export interface BillingInvoice {
  id: string
  tenant_id: string
  invoice_number: string
  status: 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded'
  plan_type: string
  amount_gtq: string
  currency: string
  provider: 'recurrente' | 'stripe' | 'manual'
  provider_checkout_id: string | null
  provider_payment_id: string | null
  period_start: string | null
  period_end: string | null
  paid_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface InvoiceListResult {
  invoices: BillingInvoice[]
  total: number
  page: number
  pageSize: number
}

export async function getBillingStatus(token: string): Promise<BillingStatus> {
  return billingFetch('/billing/status', token)
}

export async function createCheckoutSession(token: string, plan?: 'doctor_individual' | 'clinic_complete'): Promise<{ url: string }> {
  return billingFetch('/billing/checkout', token, {
    method: 'POST',
    body: plan ? JSON.stringify({ plan }) : undefined,
  })
}

export async function createPortalSession(token: string): Promise<{ url: string }> {
  return billingFetch('/billing/portal', token, { method: 'POST' })
}

export async function getInvoices(token: string, page = 1, pageSize = 20): Promise<InvoiceListResult> {
  return billingFetch(`/billing/invoices?page=${page}&pageSize=${pageSize}`, token)
}
