const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'

async function doctorFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed')
  return json.data as T
}

async function publicFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed')
  return json.data as T
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface DoctorUser {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
  specialty: string | null
  colegiado_number: string | null
  professional_id: string | null
  tenant_id: string
  is_verified: boolean
  verification_rejected_at: string | null
  verification_rejected_reason: string | null
}

export interface AuthResult {
  user: DoctorUser
  access_token: string
  refresh_token: string
}

export async function login(email: string, password: string): Promise<AuthResult> {
  return publicFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function register(data: {
  clinic_name: string
  clinic_slug: string
  email: string
  password: string
  first_name: string
  last_name: string
  colegiado_number: string
  professional_id?: string
  specialty?: string
  dpi_document_key?: string
}): Promise<AuthResult> {
  return publicFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getMe(token: string): Promise<DoctorUser> {
  return doctorFetch('/auth/me', token)
}

export async function refreshSession(refreshToken: string): Promise<{
  access_token: string
  refresh_token: string
}> {
  return publicFetch('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
}

export async function logoutSession(token: string, refreshToken?: string): Promise<void> {
  await doctorFetch('/auth/logout', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
  })
}

// ─── Patients ─────────────────────────────────────────────────────────────────

export interface Patient {
  id: string
  mrn: string | null
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  id_number: string | null
  date_of_birth: string | null
  sex: 'male' | 'female' | 'other' | null
  is_active: boolean
  notes: string | null
  anonymized_at: string | null
  created_at: string
}

export interface PatientSearchResult {
  patients: Patient[]
  meta: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

export async function listPatients(
  token: string,
  q?: string,
  page = 1,
  limit = 20,
): Promise<PatientSearchResult> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (q) params.set('q', q)
  const qs = `?${params.toString()}`
  return doctorFetch(`/patients${qs}`, token)
}

export async function getPatient(token: string, id: string): Promise<Patient> {
  return doctorFetch(`/patients/${id}`, token)
}

export type EncounterWorkflowStage =
  | 'INTAKE'
  | 'ROOMING'
  | 'SUBJECTIVE'
  | 'OBJECTIVE'
  | 'ASSESSMENT'
  | 'PLAN'
  | 'ORDERS'
  | 'READY_TO_CLOSE'

export interface ClinicalWorkspaceAction {
  key: string
  label: string
  priority: 'HIGH' | 'NORMAL' | 'LOW'
  target: 'PATIENT' | 'ENCOUNTER' | 'AI'
}

export interface ClinicalWorkspaceEncounter {
  id: string
  encounter_type: EncounterType
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED'
  chief_complaint: string | null
  subjective?: string | null
  objective?: string | null
  assessment?: string | null
  plan?: string | null
  notes?: string | null
  summary: string | null
  metadata?: Record<string, unknown>
  opened_at: string
  closed_at: string | null
}

export interface PatientClinicalWorkspace {
  patient: Patient
  workflow: {
    stage: EncounterWorkflowStage
    ready_to_close: boolean
    open_encounter_count: number
  }
  active_encounter: (ClinicalWorkspaceEncounter & { treatment_plan: TreatmentPlan | null }) | null
  readiness: {
    has_active_encounter: boolean
    has_subjective: boolean
    has_vitals: boolean
    has_objective: boolean
    has_assessment: boolean
    has_plan: boolean
    missing_core_background: BackgroundCategory[]
    latest_encounter_vital_id: string | null
  }
  context: {
    background: PatientBackground[]
    problems: PatientProblem[]
    latest_vitals: VitalSignsRecord[]
    latest_encounters: ClinicalWorkspaceEncounter[]
    treatments: TreatmentPlan[]
    pending_review_items: Array<{
      id: string
      item_type: string
      status: string
      priority: string
      title: string
      summary: string | null
      created_at: string
    }>
  }
  next_actions: ClinicalWorkspaceAction[]
}

export async function getPatientClinicalWorkspace(
  token: string,
  patientId: string,
): Promise<PatientClinicalWorkspace> {
  return doctorFetch(`/patients/${patientId}/clinical-workspace`, token)
}

export interface PatientCheckIn {
  id: string
  check_in_date: string
  pain_score: number | null
  temperature_c: number | null
  symptoms: string[]
  red_flags: string[]
  medication_issue: boolean
  mood: 'better' | 'same' | 'worse' | null
  notes: string | null
  severity: 'OK' | 'WATCH' | 'ALERT'
  created_at: string
  updated_at: string
}

export async function listPatientCheckIns(token: string, patientId: string, limit = 14): Promise<PatientCheckIn[]> {
  return doctorFetch(`/patients/${patientId}/check-ins?limit=${limit}`, token)
}

export async function createPatient(token: string, data: {
  first_name: string
  last_name: string
  email?: string
  phone?: string
  id_number?: string
  date_of_birth?: string
  sex?: string
  notes?: string
}): Promise<Patient> {
  return doctorFetch('/patients', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updatePatient(token: string, id: string, data: Partial<{
  first_name: string
  last_name: string
  email: string
  phone: string
  notes: string
}>): Promise<Patient> {
  return doctorFetch(`/patients/${id}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

// ─── Patient vitals / biometrics ─────────────────────────────────────────────

export interface VitalSignsRecord {
  id: string
  tenant_id: string
  patient_id: string
  encounter_id: string | null
  blood_pressure_systolic: number | null
  blood_pressure_diastolic: number | null
  heart_rate: number | null
  respiratory_rate: number | null
  temperature_celsius: string | null
  weight_kg: string | null
  height_cm: string | null
  oxygen_saturation: number | null
  glucose_mg_dl: number | null
  recorded_by: string | null
  recorded_at: string
  created_at: string
}

export type VitalSignsInput = Partial<{
  encounter_id: string
  blood_pressure_systolic: number
  blood_pressure_diastolic: number
  heart_rate: number
  respiratory_rate: number
  temperature_celsius: number
  weight_kg: number
  height_cm: number
  oxygen_saturation: number
  glucose_mg_dl: number
  recorded_at: string
}>

export async function listPatientVitalSigns(token: string, patientId: string): Promise<VitalSignsRecord[]> {
  return doctorFetch(`/patients/${patientId}/vital-signs`, token)
}

export async function createPatientVitalSigns(
  token: string,
  patientId: string,
  data: VitalSignsInput,
): Promise<VitalSignsRecord> {
  return doctorFetch(`/patients/${patientId}/vital-signs`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

// ─── Encounters ───────────────────────────────────────────────────────────────

export type EncounterType =
  | 'CONSULTATION' | 'FOLLOW_UP' | 'POST_HOSPITALIZATION'
  | 'DISCHARGE' | 'CHRONIC_CONTROL' | 'EMERGENCY'

export interface Encounter {
  id: string
  encounter_type: EncounterType
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED'
  chief_complaint: string | null
  subjective: string | null
  objective: string | null
  assessment: string | null
  plan: string | null
  notes: string | null
  summary: string | null
  metadata?: Record<string, unknown>
  opened_at: string
  closed_at: string | null
  doctor: { first_name: string; last_name: string; specialty: string | null }
  treatment_plan?: TreatmentPlan | null
}

export async function listEncounters(token: string, patientId: string): Promise<Encounter[]> {
  return doctorFetch(`/patients/${patientId}/encounters`, token)
}

export async function getEncounter(token: string, id: string): Promise<Encounter> {
  return doctorFetch(`/encounters/${id}`, token)
}

export async function createEncounter(token: string, patientId: string, data: {
  encounter_type?: EncounterType
  chief_complaint?: string
  notes?: string
  workflow_stage?: EncounterWorkflowStage
  subjective?: string
  objective?: string
  assessment?: string
  plan?: string
}): Promise<Encounter> {
  return doctorFetch(`/patients/${patientId}/encounters`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updateEncounter(token: string, id: string, data: {
  chief_complaint?: string
  notes?: string
  summary?: string
  workflow_stage?: EncounterWorkflowStage
  subjective?: string
  objective?: string
  assessment?: string
  plan?: string
}): Promise<Encounter> {
  return doctorFetch(`/encounters/${id}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function closeEncounter(token: string, id: string, data?: {
  summary?: string
  notes?: string
  subjective?: string
  objective?: string
  assessment?: string
  plan?: string
}): Promise<Encounter> {
  return doctorFetch(`/encounters/${id}/close`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data ?? {}),
  })
}

export type AiAssistMode = 'SUMMARIZE_ENCOUNTER' | 'SIMPLIFY_FOR_PATIENT'

export interface AiAssistDraft {
  mode: AiAssistMode
  text: string
  safety_notice: string
  model: string
}

export async function runEncounterAiAssist(
  token: string,
  encounterId: string,
  mode: AiAssistMode,
  sourceText?: string,
): Promise<AiAssistDraft> {
  return doctorFetch(`/encounters/${encounterId}/ai-assist`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, source_text: sourceText || undefined }),
  })
}

// ─── Treatments ───────────────────────────────────────────────────────────────

export type InterventionType = 'EXERCISE' | 'DIET' | 'THERAPY' | 'MONITORING' | 'OTHER'

export interface Intervention {
  id:           string
  type:         InterventionType
  title:        string
  description:  string | null
  frequency:    string | null
  duration:     string | null
  instructions: string | null
  sort_order:   number
  is_active:    boolean
}

export interface MedicationItem {
  id: string
  drug_name: string
  presentation: string | null
  dose_amount: number
  dose_unit: string
  route: string | null
  frequency_type: 'DAILY' | 'EVERY_X_HOURS' | 'WEEKLY' | 'AS_NEEDED'
  frequency_value: number | null
  times_per_day: string[] | null
  duration_days: number | null
  with_food: boolean
  special_instructions: string | null
}

export interface TreatmentPlan {
  id: string
  patient_id: string
  encounter_id: string
  name: string
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'SUSPENDED' | 'CANCELLED'
  start_date: string
  end_date: string | null
  instructions: string | null
  medications:   MedicationItem[]
  interventions: Intervention[]
}

export async function createTreatment(token: string, encounterId: string, data: {
  name: string
  start_date: string
  instructions?: string
  medications?: Array<{
    drug_name: string
    dose_amount: number
    dose_unit: string
    frequency_type: string
    frequency_value?: number
    times_per_day?: string[]
    duration_days?: number
    presentation?: string
    route?: string
    with_food?: boolean
    special_instructions?: string
    sort_order?: number
  }>
  interventions?: Array<{
    type?: InterventionType
    title: string
    description?: string
    frequency?: string
    duration?: string
    instructions?: string
    sort_order?: number
  }>
}): Promise<TreatmentPlan> {
  return doctorFetch(`/encounters/${encounterId}/treatments`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function addIntervention(
  token: string,
  treatmentId: string,
  data: { type?: InterventionType; title: string; description?: string; frequency?: string; duration?: string; instructions?: string },
): Promise<Intervention> {
  return doctorFetch(`/treatments/${treatmentId}/interventions`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updateIntervention(
  token: string,
  interventionId: string,
  data: Partial<{ type: InterventionType; title: string; description: string; frequency: string; duration: string; instructions: string }>,
): Promise<Intervention> {
  return doctorFetch(`/interventions/${interventionId}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteIntervention(token: string, interventionId: string): Promise<void> {
  await doctorFetch(`/interventions/${interventionId}`, token, { method: 'DELETE' })
}

export async function getTreatment(token: string, id: string): Promise<TreatmentPlan> {
  return doctorFetch(`/treatments/${id}`, token)
}

export async function listPatientTreatments(
  token: string,
  patientId: string,
): Promise<TreatmentPlan[]> {
  return doctorFetch(`/patients/${patientId}/treatments`, token)
}

export async function activateTreatment(token: string, id: string): Promise<TreatmentPlan> {
  return doctorFetch(`/treatments/${id}/activate`, token, { method: 'POST' })
}

export async function getAdherence(token: string, treatmentId: string) {
  return doctorFetch<{
    score: number
    confirmed: number
    total: number
    missed: number
    avatar_state: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'
  }>(`/treatments/${treatmentId}/adherence`, token)
}

// ─── Clinical protocols ─────────────────────────────────────────────────────

export interface ClinicalProtocolMedication {
  drug_name: string
  presentation?: string
  concentration?: string
  dose_amount: number
  dose_unit: string
  route?: string
  frequency_type: 'DAILY' | 'EVERY_X_HOURS' | 'WEEKLY' | 'AS_NEEDED'
  frequency_value?: number
  times_per_day?: string[]
  duration_days?: number
  special_instructions?: string
  with_food?: boolean
  sort_order?: number
}

export interface ClinicalProtocol {
  id: string
  source: 'SYSTEM' | 'TENANT'
  name: string
  category: string
  description: string | null
  encounter_type: EncounterType | null
  note_template: string | null
  summary_template: string | null
  treatment_name: string | null
  treatment_instructions: string | null
  medications: ClinicalProtocolMedication[]
  follow_up_days: number | null
  tags: string[]
}

export async function listClinicalProtocols(token: string): Promise<ClinicalProtocol[]> {
  return doctorFetch('/clinical-protocols', token)
}

export interface CreateProtocolData {
  name: string
  category?: string
  description?: string
  encounter_type?: EncounterType
  note_template?: string
  summary_template?: string
  treatment_name?: string
  treatment_instructions?: string
  medications?: ClinicalProtocolMedication[]
  follow_up_days?: number
  tags?: string[]
}

export async function createProtocol(
  token: string,
  data: CreateProtocolData,
): Promise<ClinicalProtocol> {
  return doctorFetch('/clinical-protocols', token, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateProtocol(
  token: string,
  id: string,
  data: Partial<CreateProtocolData>,
): Promise<ClinicalProtocol> {
  return doctorFetch(`/clinical-protocols/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteProtocol(token: string, id: string): Promise<null> {
  return doctorFetch(`/clinical-protocols/${id}`, token, { method: 'DELETE' })
}

// ─── Portal access ────────────────────────────────────────────────────────────

export type AccessChannel = 'magic_link' | 'qr' | 'whatsapp'

export type AccessResult =
  | { channel: 'pin'; pin: string; patient_id: string; access_url: string; expires_at: string }
  | { channel: AccessChannel; token: string; access_url: string; qr_data: string; expires_at: string; pin?: string }

export async function generatePortalAccess(
  token: string,
  patientId: string,
  channel: AccessChannel,
  expiresInDays = 30,
): Promise<AccessResult> {
  return doctorFetch(`/patients/${patientId}/access`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, expires_in_days: expiresInDays }),
  })
}

export async function revokePortalAccess(token: string, patientId: string): Promise<void> {
  await doctorFetch(`/patients/${patientId}/access`, token, { method: 'DELETE' })
}

// ─── Staff management ─────────────────────────────────────────────────────────

export type StaffRole = 'ADMIN_CLINIC' | 'DOCTOR' | 'NURSE' | 'ASSISTANT'

export interface StaffMember {
  id: string
  email: string
  first_name: string
  last_name: string
  role: StaffRole
  specialty: string | null
  is_active: boolean
  is_verified: boolean
  created_at: string
}

export interface PendingInvitation {
  id: string
  email: string
  role: StaffRole
  expires_at: string
  created_at: string
}

export async function listStaff(token: string): Promise<{
  staff: StaffMember[]
  pending_invitations: PendingInvitation[]
}> {
  return doctorFetch('/staff', token)
}

export async function inviteStaff(
  token: string,
  email: string,
  role: StaffRole,
): Promise<{ email: string; role: StaffRole; expires_at: string }> {
  return doctorFetch('/staff/invite', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  })
}

export async function deactivateStaff(token: string, userId: string): Promise<void> {
  await doctorFetch(`/staff/${userId}`, token, { method: 'DELETE' })
}

export async function acceptInvite(data: {
  token: string
  first_name: string
  last_name: string
  password: string
  specialty?: string
  professional_id?: string
}): Promise<{
  user: DoctorUser
  access_token: string
  refresh_token: string
}> {
  const res = await fetch(`${API}/staff/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed')
  return json.data
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface Document {
  id: string
  type: string
  file_name: string
  file_size: number
  mime_type: string
  is_visible_to_patient: boolean
  encounter_id: string | null
  created_at: string
  uploaded_by_user: { first_name: string; last_name: string }
}

export async function listDocuments(token: string, patientId: string): Promise<Document[]> {
  return doctorFetch(`/patients/${patientId}/documents`, token)
}

export async function getDocumentUrl(token: string, documentId: string) {
  return doctorFetch<{ url: string; expires_in_seconds: number; file_name: string }>(
    `/documents/${documentId}/url`, token,
  )
}

export async function toggleDocumentVisibility(
  token: string, documentId: string, visible: boolean,
) {
  return doctorFetch(`/documents/${documentId}/visibility`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_visible_to_patient: visible }),
  })
}

export async function deleteDocument(token: string, documentId: string) {
  return doctorFetch(`/documents/${documentId}`, token, { method: 'DELETE' })
}

export async function uploadDocument(
  token: string,
  patientId: string,
  file: File,
  meta: { type: string; is_visible_to_patient: boolean; encounter_id?: string },
) {
  const form = new FormData()
  form.append('file', file)
  form.append('type', meta.type)
  form.append('is_visible_to_patient', String(meta.is_visible_to_patient))
  if (meta.encounter_id) form.append('encounter_id', meta.encounter_id)

  const res = await fetch(`${API}/patients/${patientId}/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Upload failed')
  return json.data as Document
}

// ─── FHIR R4 export ───────────────────────────────────────────────────────────

export async function getPatientFhirBundle(token: string, patientId: string): Promise<object> {
  return doctorFetch(`/patients/${patientId}/fhir`, token)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── POMR — Patient problems (lista de Weed) ──────────────────────────────────

export type ProblemStatus = 'ACTIVE' | 'INACTIVE' | 'RESOLVED' | 'CHRONIC'

export interface PatientProblem {
  id: string
  problem_number: number
  title: string
  description: string | null
  icd10_code: string | null
  icd10_description: string | null
  status: ProblemStatus
  onset_date: string | null
  resolved_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export async function listPatientProblems(token: string, patientId: string): Promise<PatientProblem[]> {
  return doctorFetch(`/patients/${patientId}/problems`, token)
}

export async function createPatientProblem(token: string, patientId: string, data: {
  title: string
  status?: ProblemStatus
  description?: string
  icd10_code?: string
  icd10_description?: string
  onset_date?: string
  notes?: string
}): Promise<PatientProblem> {
  return doctorFetch(`/patients/${patientId}/problems`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function updatePatientProblem(token: string, problemId: string, data: Partial<{
  title: string
  status: ProblemStatus
  description: string
  icd10_code: string
  icd10_description: string
  onset_date: string
  resolved_date: string
  notes: string
}>): Promise<PatientProblem> {
  return doctorFetch(`/problems/${problemId}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

// ─── POMR — Patient background (antecedentes) ─────────────────────────────────

export type BackgroundCategory =
  | 'AHF' | 'APP' | 'APNP' | 'AQ' | 'ATRAUMA'
  | 'ALERGIAS' | 'GINECO_OBS' | 'MEDICAMENTOS' | 'PERINATAL'

export interface PatientBackground {
  id: string
  category: BackgroundCategory
  content: string
  is_current: boolean
  recorded_at: string | null
  retired_at: string | null
  retired_reason: string | null
  created_at: string
}

export async function listPatientBackground(token: string, patientId: string): Promise<PatientBackground[]> {
  return doctorFetch(`/patients/${patientId}/background`, token)
}

export async function listPatientBackgroundHistory(token: string, patientId: string): Promise<PatientBackground[]> {
  return doctorFetch(`/patients/${patientId}/background/history`, token)
}

export async function upsertPatientBackground(token: string, patientId: string, data: {
  category: BackgroundCategory
  content: string
}): Promise<PatientBackground> {
  return doctorFetch(`/patients/${patientId}/background`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function retirePatientBackground(token: string, patientId: string, category: BackgroundCategory): Promise<PatientBackground> {
  return doctorFetch(`/patients/${patientId}/background/${category}`, token, {
    method: 'DELETE',
  })
}

// ─── Referrals ────────────────────────────────────────────────────────────────

export type ReferralPriority = 'ROUTINE' | 'URGENT' | 'EMERGENCY'
export type ReferralStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED'

export interface Referral {
  id: string
  tenant_id: string
  patient_id: string
  from_doctor_id: string
  to_doctor_id: string | null
  to_department_id: string | null
  encounter_id: string | null
  reason: string
  notes: string | null
  priority: ReferralPriority
  status: ReferralStatus
  response_notes: string | null
  responded_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  patient?: { id: string; first_name: string; last_name: string; mrn: string | null }
  from_doctor?: { id: string; first_name: string; last_name: string; specialty: string | null }
  to_doctor?: { id: string; first_name: string; last_name: string; specialty: string | null } | null
  to_department?: { id: string; name: string; type: string } | null
}

export async function listDoctorReferrals(
  token: string,
  direction: 'incoming' | 'outgoing' | 'all' = 'all',
): Promise<Referral[]> {
  return doctorFetch(`/referrals?direction=${direction}`, token)
}

export async function listPatientReferrals(token: string, patientId: string): Promise<Referral[]> {
  return doctorFetch(`/patients/${patientId}/referrals`, token)
}

export async function createReferral(token: string, patientId: string, data: {
  to_doctor_id?: string
  to_department_id?: string
  encounter_id?: string
  reason: string
  notes?: string
  priority?: ReferralPriority
}): Promise<Referral> {
  return doctorFetch(`/patients/${patientId}/referrals`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function acceptReferral(token: string, referralId: string, notes?: string): Promise<Referral> {
  return doctorFetch(`/referrals/${referralId}/accept`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  })
}

export async function rejectReferral(token: string, referralId: string, notes?: string): Promise<Referral> {
  return doctorFetch(`/referrals/${referralId}/reject`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  })
}

export async function completeReferral(token: string, referralId: string, notes?: string): Promise<Referral> {
  return doctorFetch(`/referrals/${referralId}/complete`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  })
}

export async function cancelReferral(token: string, referralId: string): Promise<Referral> {
  return doctorFetch(`/referrals/${referralId}/cancel`, token, { method: 'POST' })
}

// ─── Admissions ───────────────────────────────────────────────────────────────

export type AdmissionStatus = 'ACTIVE' | 'DISCHARGED'

export interface Admission {
  id: string
  tenant_id: string
  patient_id: string
  admitted_by: string
  department_id: string | null
  referral_id: string | null
  bed_code: string | null
  status: AdmissionStatus
  admission_notes: string | null
  discharge_notes: string | null
  admitted_at: string
  discharged_at: string | null
  created_at: string
  updated_at: string
  patient?: { id: string; first_name: string; last_name: string; mrn: string | null; date_of_birth: string | null }
  admitted_by_doctor?: { id: string; first_name: string; last_name: string; specialty: string | null }
  department?: { id: string; name: string; type: string } | null
  referral?: { id: string; reason: string; priority: string } | null
}

export async function listPatientAdmissions(token: string, patientId: string): Promise<Admission[]> {
  return doctorFetch(`/patients/${patientId}/admissions`, token)
}

export async function admitPatient(token: string, patientId: string, data: {
  department_id?: string
  referral_id?: string
  bed_code?: string
  admission_notes?: string
}): Promise<Admission> {
  return doctorFetch(`/patients/${patientId}/admissions`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function dischargePatient(token: string, admissionId: string, data: {
  discharge_notes?: string
}): Promise<Admission> {
  return doctorFetch(`/admissions/${admissionId}/discharge`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function getHospitalCensus(token: string): Promise<Admission[]> {
  return doctorFetch('/hospital/census', token)
}
