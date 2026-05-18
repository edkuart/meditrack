const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'

async function labFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
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

// ─── Types ────────────────────────────────────────────────────────────────────

export type LabResultStatus = 'PENDING' | 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL_HIGH' | 'CRITICAL_LOW'
export type LabOrderStatus  = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

export interface LabResult {
  id:             string
  order_id:       string
  tenant_id:      string
  panel_name:     string
  parameter_name: string
  value:          string | null
  numeric_value:  string | null
  unit:           string | null
  ref_min:        string | null
  ref_max:        string | null
  ref_text:       string | null
  status:         LabResultStatus
  notes:          string | null
  sort_order:     number
  created_at:     string
  updated_at:     string
}

export interface LabOrder {
  id:           string
  tenant_id:    string
  patient_id:   string
  encounter_id: string | null
  ordered_by:   string
  status:       LabOrderStatus
  notes:        string | null
  ordered_at:   string
  created_at:   string
  updated_at:   string
  patient:      { id: string; first_name: string; last_name: string; date_of_birth?: string | null; sex?: string | null }
  doctor:       { id: string; first_name: string; last_name: string; specialty?: string | null }
  encounter?:   { id: string; encounter_type: string; opened_at: string } | null
  results:      LabResult[]
}

export interface LabResultInput {
  panel_name:     string
  parameter_name: string
  value?:         string
  numeric_value?: number
  unit?:          string
  ref_min?:       number
  ref_max?:       number
  ref_text?:      string
  notes?:         string
  sort_order?:    number
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function listLabOrders(token: string, patientId?: string): Promise<LabOrder[]> {
  const qs = patientId ? `?patient_id=${patientId}` : ''
  return labFetch(`/lab/orders${qs}`, token)
}

export async function getLabOrder(token: string, orderId: string): Promise<LabOrder> {
  return labFetch(`/lab/orders/${orderId}`, token)
}

export async function createLabOrder(token: string, data: {
  patient_id:    string
  encounter_id?: string
  notes?:        string
  results:       LabResultInput[]
}): Promise<LabOrder> {
  return labFetch('/lab/orders', token, { method: 'POST', body: JSON.stringify(data) })
}

export async function updateLabOrder(token: string, orderId: string, data: {
  status?: LabOrderStatus
  notes?:  string
}): Promise<LabOrder> {
  return labFetch(`/lab/orders/${orderId}`, token, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function upsertLabResults(token: string, orderId: string, results: LabResultInput[]): Promise<LabOrder> {
  return labFetch(`/lab/orders/${orderId}/results`, token, { method: 'PUT', body: JSON.stringify({ results }) })
}

// ─── Lab panels catalog (frontend constants) ──────────────────────────────────

export interface PanelTemplate {
  name:       string
  category:   string
  parameters: Omit<LabResultInput, 'sort_order'>[]
}

export const LAB_PANELS: PanelTemplate[] = [
  {
    name: 'Hemograma completo',
    category: 'Hematología',
    parameters: [
      { panel_name: 'Hemograma completo', parameter_name: 'Hemoglobina',      unit: 'g/dL',     ref_min: 12,   ref_max: 17.5 },
      { panel_name: 'Hemograma completo', parameter_name: 'Hematocrito',      unit: '%',        ref_min: 36,   ref_max: 52   },
      { panel_name: 'Hemograma completo', parameter_name: 'Leucocitos',       unit: '10³/μL',   ref_min: 4.5,  ref_max: 11   },
      { panel_name: 'Hemograma completo', parameter_name: 'Plaquetas',        unit: '10³/μL',   ref_min: 150,  ref_max: 400  },
      { panel_name: 'Hemograma completo', parameter_name: 'Neutrófilos',      unit: '%',        ref_min: 40,   ref_max: 75   },
      { panel_name: 'Hemograma completo', parameter_name: 'Linfocitos',       unit: '%',        ref_min: 20,   ref_max: 45   },
    ],
  },
  {
    name: 'Glicemia',
    category: 'Química sanguínea',
    parameters: [
      { panel_name: 'Glicemia', parameter_name: 'Glucosa en ayunas', unit: 'mg/dL', ref_min: 70, ref_max: 99 },
    ],
  },
  {
    name: 'HbA1c',
    category: 'Química sanguínea',
    parameters: [
      { panel_name: 'HbA1c', parameter_name: 'Hemoglobina glucosilada', unit: '%', ref_min: 0, ref_max: 5.7 },
    ],
  },
  {
    name: 'Panel metabólico básico',
    category: 'Química sanguínea',
    parameters: [
      { panel_name: 'Panel metabólico básico', parameter_name: 'Glucosa',     unit: 'mg/dL',   ref_min: 70,   ref_max: 99  },
      { panel_name: 'Panel metabólico básico', parameter_name: 'Creatinina',  unit: 'mg/dL',   ref_min: 0.6,  ref_max: 1.2 },
      { panel_name: 'Panel metabólico básico', parameter_name: 'BUN',         unit: 'mg/dL',   ref_min: 7,    ref_max: 20  },
      { panel_name: 'Panel metabólico básico', parameter_name: 'Sodio',       unit: 'mEq/L',   ref_min: 136,  ref_max: 145 },
      { panel_name: 'Panel metabólico básico', parameter_name: 'Potasio',     unit: 'mEq/L',   ref_min: 3.5,  ref_max: 5.0 },
      { panel_name: 'Panel metabólico básico', parameter_name: 'Cloruro',     unit: 'mEq/L',   ref_min: 98,   ref_max: 106 },
    ],
  },
  {
    name: 'Perfil lipídico',
    category: 'Química sanguínea',
    parameters: [
      { panel_name: 'Perfil lipídico', parameter_name: 'Colesterol total',  unit: 'mg/dL', ref_min: 0,   ref_max: 200 },
      { panel_name: 'Perfil lipídico', parameter_name: 'LDL',               unit: 'mg/dL', ref_min: 0,   ref_max: 100 },
      { panel_name: 'Perfil lipídico', parameter_name: 'HDL',               unit: 'mg/dL', ref_min: 40,  ref_max: 999 },
      { panel_name: 'Perfil lipídico', parameter_name: 'Triglicéridos',     unit: 'mg/dL', ref_min: 0,   ref_max: 150 },
    ],
  },
  {
    name: 'Función renal',
    category: 'Química sanguínea',
    parameters: [
      { panel_name: 'Función renal', parameter_name: 'Creatinina',  unit: 'mg/dL', ref_min: 0.6, ref_max: 1.2  },
      { panel_name: 'Función renal', parameter_name: 'BUN',         unit: 'mg/dL', ref_min: 7,   ref_max: 20   },
      { panel_name: 'Función renal', parameter_name: 'Ácido úrico', unit: 'mg/dL', ref_min: 2.4, ref_max: 7.0  },
    ],
  },
  {
    name: 'Función hepática',
    category: 'Química sanguínea',
    parameters: [
      { panel_name: 'Función hepática', parameter_name: 'TGO (AST)',         unit: 'U/L',   ref_min: 10, ref_max: 40 },
      { panel_name: 'Función hepática', parameter_name: 'TGP (ALT)',         unit: 'U/L',   ref_min: 7,  ref_max: 56 },
      { panel_name: 'Función hepática', parameter_name: 'Bilirrubina total', unit: 'mg/dL', ref_min: 0,  ref_max: 1.2 },
      { panel_name: 'Función hepática', parameter_name: 'Fosfatasa alcalina',unit: 'U/L',   ref_min: 44, ref_max: 147 },
    ],
  },
  {
    name: 'Perfil tiroideo',
    category: 'Hormonas',
    parameters: [
      { panel_name: 'Perfil tiroideo', parameter_name: 'TSH',     unit: 'mUI/L', ref_min: 0.4,  ref_max: 4.0  },
      { panel_name: 'Perfil tiroideo', parameter_name: 'T4 libre',unit: 'ng/dL', ref_min: 0.8,  ref_max: 1.8  },
    ],
  },
  {
    name: 'Examen general de orina',
    category: 'Uroanálisis',
    parameters: [
      { panel_name: 'Examen general de orina', parameter_name: 'pH',             unit: '',      ref_min: 4.5, ref_max: 8.0 },
      { panel_name: 'Examen general de orina', parameter_name: 'Densidad',       unit: '',      ref_min: 1010, ref_max: 1030 },
      { panel_name: 'Examen general de orina', parameter_name: 'Proteínas',      unit: 'mg/dL', ref_text: 'Negativo' },
      { panel_name: 'Examen general de orina', parameter_name: 'Glucosa',        unit: 'mg/dL', ref_text: 'Negativo' },
      { panel_name: 'Examen general de orina', parameter_name: 'Leucocitos',     unit: '/campo', ref_min: 0, ref_max: 5 },
      { panel_name: 'Examen general de orina', parameter_name: 'Eritrocitos',    unit: '/campo', ref_min: 0, ref_max: 3 },
    ],
  },
]

// ─── Status helpers ───────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<LabResultStatus, { label: string; color: string; bg: string; border: string }> = {
  NORMAL:       { label: 'Normal',       color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  HIGH:         { label: 'Alto',         color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  LOW:          { label: 'Bajo',         color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  CRITICAL_HIGH:{ label: 'Crítico ↑',   color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  CRITICAL_LOW: { label: 'Crítico ↓',   color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  PENDING:      { label: 'Pendiente',    color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
}

export const ORDER_STATUS_CONFIG: Record<LabOrderStatus, { label: string; color: string; bg: string }> = {
  PENDING:     { label: 'Pendiente',    color: '#d97706', bg: '#fffbeb' },
  IN_PROGRESS: { label: 'En proceso',   color: '#2563eb', bg: '#eff6ff' },
  COMPLETED:   { label: 'Completado',   color: '#059669', bg: '#ecfdf5' },
  CANCELLED:   { label: 'Cancelado',    color: '#64748b', bg: '#f8fafc' },
}
