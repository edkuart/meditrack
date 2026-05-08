'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Pill, CheckCircle, XCircle, Loader2, Plus, Trash2,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getEncounter, updateEncounter, closeEncounter, createTreatment, getTreatment, activateTreatment,
  type Encounter, type TreatmentPlan, type MedicationItem,
} from '@/lib/doctor/api'

// ─── Constants ────────────────────────────────────────────────────────────────

const ENC_LABELS: Record<string, string> = {
  CONSULTATION: 'Consulta', FOLLOW_UP: 'Seguimiento',
  POST_HOSPITALIZATION: 'Post-hospitalización', DISCHARGE: 'Alta',
  CHRONIC_CONTROL: 'Control crónico', EMERGENCY: 'Urgencia',
}

const FREQ_LABELS: Record<string, string> = {
  DAILY: 'Diario', EVERY_X_HOURS: 'Cada X horas', WEEKLY: 'Semanal', AS_NEEDED: 'Según necesidad',
}

const DOSE_UNITS = ['mg', 'ml', 'mcg', 'g', 'UI', 'tableta(s)', 'cápsula(s)', 'gota(s)', 'ampolla(s)', 'parche(s)']
const ROUTES = ['oral', 'sublingual', 'inhalatoria', 'tópica', 'inyectable IV', 'inyectable IM', 'subcutánea', 'rectal', 'vaginal', 'oftálmica', 'ótica']

// ─── Medication form ──────────────────────────────────────────────────────────

interface MedForm {
  drug_name: string
  presentation: string
  dose_amount: string
  dose_unit: string
  route: string
  frequency_type: string
  frequency_value: string     // for EVERY_X_HOURS
  times_per_day_count: string // for DAILY: number of times
  times_per_day: string[]     // HH:MM entries
  duration_days: string
  with_food: boolean
  special_instructions: string
}

function emptyMedForm(): MedForm {
  return {
    drug_name: '', presentation: '', dose_amount: '', dose_unit: 'mg',
    route: 'oral', frequency_type: 'DAILY', frequency_value: '8',
    times_per_day_count: '1', times_per_day: ['08:00'],
    duration_days: '30', with_food: false, special_instructions: '',
  }
}

function MedicationCard({ med, onRemove }: { med: Partial<MedForm & { drug_name: string }>; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white">
      <Pill size={16} className="text-blue-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">{med.drug_name}</p>
        <p className="text-xs text-slate-400">
          {med.dose_amount} {med.dose_unit}
          {' · '}{FREQ_LABELS[med.frequency_type ?? ''] ?? med.frequency_type}
          {med.frequency_type === 'EVERY_X_HOURS' && ` c/${med.frequency_value}h`}
          {med.frequency_type === 'DAILY' && med.times_per_day && ` (${med.times_per_day.join(', ')})`}
          {med.duration_days && ` · ${med.duration_days} días`}
        </p>
      </div>
      <button onClick={onRemove} className="text-slate-300 hover:text-red-500 transition-colors">
        <Trash2 size={15} />
      </button>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function EncounterPage() {
  const params = useParams()
  const router = useRouter()
  const { token } = useAuth()
  const patientId = params.id as string
  const encId = params.encId as string

  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [treatment, setTreatment] = useState<TreatmentPlan | null>(null)
  const [loading, setLoading] = useState(true)

  // Notes editing
  const [notes, setNotes] = useState('')
  const [summary, setSummary] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  // Treatment builder
  const [treatmentName, setTreatmentName] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [medications, setMedications] = useState<MedForm[]>([])
  const [showMedForm, setShowMedForm] = useState(false)
  const [medForm, setMedForm] = useState<MedForm>(emptyMedForm())
  const [savingTreatment, setSavingTreatment] = useState(false)
  const [treatmentError, setTreatmentError] = useState('')
  const [activating, setActivating] = useState(false)
  const [closing, setClosing] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const enc = await getEncounter(token, encId)
      setEncounter(enc)
      setNotes(enc.notes ?? '')
      setSummary(enc.summary ?? '')
    } finally {
      setLoading(false)
    }
  }, [token, encId])

  useEffect(() => { load() }, [load])

  // Update times_per_day array when count changes
  function updateTimesCount(count: string) {
    const n = Math.max(1, Math.min(6, Number(count) || 1))
    const defaults = ['08:00', '14:00', '20:00', '02:00', '10:00', '16:00']
    const times = Array.from({ length: n }, (_, i) => medForm.times_per_day[i] ?? defaults[i])
    setMedForm(prev => ({ ...prev, times_per_day_count: String(n), times_per_day: times }))
  }

  function updateTime(index: number, value: string) {
    setMedForm(prev => {
      const times = [...prev.times_per_day]
      times[index] = value
      return { ...prev, times_per_day: times }
    })
  }

  function addMedication() {
    if (!medForm.drug_name.trim() || !medForm.dose_amount) return
    setMedications(prev => [...prev, { ...medForm }])
    setMedForm(emptyMedForm())
    setShowMedForm(false)
  }

  async function saveTreatment() {
    if (!token || medications.length === 0) return
    setSavingTreatment(true)
    setTreatmentError('')
    try {
      const plan = await createTreatment(token, encId, {
        name: treatmentName || `Tratamiento - ${new Date().toLocaleDateString('es')}`,
        start_date: startDate,
        medications: medications.map((m, i) => ({
          drug_name: m.drug_name,
          presentation: m.presentation || undefined,
          dose_amount: Number(m.dose_amount),
          dose_unit: m.dose_unit,
          route: m.route || undefined,
          frequency_type: m.frequency_type,
          frequency_value: m.frequency_type === 'EVERY_X_HOURS' ? Number(m.frequency_value) : undefined,
          times_per_day: m.frequency_type === 'DAILY' ? m.times_per_day : undefined,
          duration_days: m.duration_days ? Number(m.duration_days) : undefined,
          with_food: m.with_food,
          special_instructions: m.special_instructions || undefined,
          sort_order: i,
        })),
      })
      setTreatment(plan)
      setMedications([])
    } catch (err) {
      setTreatmentError(err instanceof Error ? err.message : 'Error al guardar el tratamiento')
    } finally {
      setSavingTreatment(false)
    }
  }

  async function handleActivate() {
    if (!token || !treatment) return
    setActivating(true)
    try {
      const updated = await activateTreatment(token, treatment.id)
      setTreatment(updated)
    } finally {
      setActivating(false)
    }
  }

  async function handleSaveNotes() {
    if (!token) return
    setSavingNotes(true)
    try {
      const updated = await updateEncounter(token, encId, {
        notes: notes || undefined,
        summary: summary || undefined,
      })
      setEncounter(updated)
    } finally {
      setSavingNotes(false)
    }
  }

  async function handleClose() {
    if (!token || !confirm('¿Cerrar esta consulta?')) return
    setClosing(true)
    try {
      await closeEncounter(token, encId, { summary: summary || undefined })
      router.push(`/patients/${patientId}`)
    } finally {
      setClosing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={24} className="animate-spin text-slate-300" />
      </div>
    )
  }

  if (!encounter) return null

  const isClosed = encounter.status === 'CLOSED' || encounter.status === 'ARCHIVED'

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/patients/${patientId}`} className="text-slate-400 hover:text-slate-600">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800">
              {ENC_LABELS[encounter.encounter_type] ?? encounter.encounter_type}
            </h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              encounter.status === 'OPEN' ? 'bg-green-100 text-green-700' :
              'bg-slate-100 text-slate-500'
            }`}>
              {encounter.status === 'OPEN' ? 'Abierta' : 'Cerrada'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {new Date(encounter.opened_at).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {!isClosed && (
          <button
            onClick={handleClose}
            disabled={closing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:border-red-300 hover:text-red-600 disabled:opacity-50 transition-colors"
          >
            {closing ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
            Cerrar consulta
          </button>
        )}
      </div>

      {/* Notes */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4">
        <h2 className="font-semibold text-slate-800">Notas clínicas</h2>

        {encounter.chief_complaint && (
          <div>
            <p className="text-xs font-medium text-slate-400 mb-1">Motivo de consulta</p>
            <p className="text-sm text-slate-700">{encounter.chief_complaint}</p>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Evolución / Notas</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={isClosed}
            rows={4}
            placeholder="Anamnesis, exploración física, diagnóstico..."
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Resumen / Plan</label>
          <textarea
            value={summary}
            onChange={e => setSummary(e.target.value)}
            disabled={isClosed}
            rows={3}
            placeholder="Diagnóstico final, plan de acción..."
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        {!isClosed && (
          <div className="flex justify-end">
            <button
              onClick={handleSaveNotes}
              disabled={savingNotes}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 disabled:opacity-50 transition-colors"
            >
              {savingNotes ? <Loader2 size={14} className="animate-spin" /> : null}
              Guardar notas
            </button>
          </div>
        )}
      </section>

      {/* Treatment builder */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Pill size={16} className="text-slate-500" />
            Plan de tratamiento
          </h2>
          {treatment && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              treatment.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
              treatment.status === 'DRAFT' ? 'bg-amber-100 text-amber-700' :
              'bg-slate-100 text-slate-500'
            }`}>
              {treatment.status === 'ACTIVE' ? 'Activo' :
               treatment.status === 'DRAFT' ? 'Borrador' : treatment.status}
            </span>
          )}
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* Existing treatment */}
          {treatment ? (
            <>
              <div>
                <p className="text-sm font-medium text-slate-700">{treatment.name}</p>
                <p className="text-xs text-slate-400">Desde {new Date(treatment.start_date).toLocaleDateString('es')}</p>
              </div>
              <div className="flex flex-col gap-2">
                {treatment.medications.map(med => (
                  <div key={med.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50">
                    <Pill size={14} className="text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{med.drug_name}</p>
                      <p className="text-xs text-slate-500">
                        {med.dose_amount} {med.dose_unit}
                        {' · '}{FREQ_LABELS[med.frequency_type] ?? med.frequency_type}
                        {med.frequency_type === 'EVERY_X_HOURS' && med.frequency_value && ` c/${med.frequency_value}h`}
                        {med.frequency_type === 'DAILY' && med.times_per_day && ` (${med.times_per_day.join(', ')})`}
                        {med.duration_days && ` · ${med.duration_days} días`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {treatment.status === 'DRAFT' && !isClosed && (
                <button
                  onClick={handleActivate}
                  disabled={activating}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-500 text-white font-medium text-sm disabled:opacity-60 hover:bg-green-600 transition-colors"
                >
                  {activating
                    ? <><Loader2 size={16} className="animate-spin" /> Activando...</>
                    : <><CheckCircle size={16} /> Activar tratamiento</>
                  }
                </button>
              )}
              {treatment.status === 'ACTIVE' && (
                <p className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle size={16} />
                  Tratamiento activo — generando recordatorios de dosis
                </p>
              )}
            </>
          ) : isClosed ? (
            <p className="text-sm text-slate-400 text-center py-4">Esta consulta no tiene plan de tratamiento.</p>
          ) : (
            <>
              {/* Treatment meta */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Nombre del plan</label>
                  <input
                    value={treatmentName}
                    onChange={e => setTreatmentName(e.target.value)}
                    placeholder="Ej: Tratamiento HTA"
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Fecha de inicio</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
              </div>

              {/* Medication list */}
              {medications.length > 0 && (
                <div className="flex flex-col gap-2">
                  {medications.map((m, i) => (
                    <MedicationCard
                      key={i}
                      med={m}
                      onRemove={() => setMedications(prev => prev.filter((_, j) => j !== i))}
                    />
                  ))}
                </div>
              )}

              {/* Add medication form */}
              {showMedForm ? (
                <div className="border border-slate-200 rounded-xl p-4 flex flex-col gap-3 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Agregar medicamento</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1 col-span-2">
                      <label className="text-xs font-medium text-slate-500">Medicamento *</label>
                      <input
                        value={medForm.drug_name}
                        onChange={e => setMedForm(p => ({ ...p, drug_name: e.target.value }))}
                        placeholder="Ej: Enalapril"
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-500">Dosis *</label>
                      <input
                        type="number"
                        value={medForm.dose_amount}
                        onChange={e => setMedForm(p => ({ ...p, dose_amount: e.target.value }))}
                        placeholder="10"
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-500">Unidad</label>
                      <select
                        value={medForm.dose_unit}
                        onChange={e => setMedForm(p => ({ ...p, dose_unit: e.target.value }))}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                      >
                        {DOSE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-500">Vía</label>
                      <select
                        value={medForm.route}
                        onChange={e => setMedForm(p => ({ ...p, route: e.target.value }))}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                      >
                        {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-500">Frecuencia</label>
                      <select
                        value={medForm.frequency_type}
                        onChange={e => setMedForm(p => ({ ...p, frequency_type: e.target.value }))}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                      >
                        <option value="DAILY">Diario</option>
                        <option value="EVERY_X_HOURS">Cada X horas</option>
                        <option value="WEEKLY">Semanal</option>
                        <option value="AS_NEEDED">Según necesidad</option>
                      </select>
                    </div>

                    {/* Frequency-specific fields */}
                    {medForm.frequency_type === 'EVERY_X_HOURS' && (
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-500">Cada (horas)</label>
                        <input
                          type="number"
                          min={1}
                          value={medForm.frequency_value}
                          onChange={e => setMedForm(p => ({ ...p, frequency_value: e.target.value }))}
                          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                        />
                      </div>
                    )}

                    {medForm.frequency_type === 'DAILY' && (
                      <div className="flex flex-col gap-1 col-span-2">
                        <label className="text-xs font-medium text-slate-500">Veces al día</label>
                        <input
                          type="number"
                          min={1}
                          max={6}
                          value={medForm.times_per_day_count}
                          onChange={e => updateTimesCount(e.target.value)}
                          className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                        />
                        <div className="flex flex-wrap gap-2 mt-1">
                          {medForm.times_per_day.map((t, i) => (
                            <input
                              key={i}
                              type="time"
                              value={t}
                              onChange={e => updateTime(i, e.target.value)}
                              className="border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-slate-500">Duración (días)</label>
                      <input
                        type="number"
                        min={1}
                        value={medForm.duration_days}
                        onChange={e => setMedForm(p => ({ ...p, duration_days: e.target.value }))}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                      />
                    </div>

                    <label className="flex items-center gap-2 col-span-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={medForm.with_food}
                        onChange={e => setMedForm(p => ({ ...p, with_food: e.target.checked }))}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm text-slate-600">Tomar con alimentos</span>
                    </label>

                    <div className="flex flex-col gap-1 col-span-2">
                      <label className="text-xs font-medium text-slate-500">Instrucciones especiales</label>
                      <input
                        value={medForm.special_instructions}
                        onChange={e => setMedForm(p => ({ ...p, special_instructions: e.target.value }))}
                        placeholder="Ej: Evitar exposición al sol"
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => { setShowMedForm(false); setMedForm(emptyMedForm()) }}
                      className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={addMedication}
                      disabled={!medForm.drug_name.trim() || !medForm.dose_amount}
                      className="px-4 py-1.5 rounded-lg bg-blue-500 text-white text-sm font-medium disabled:opacity-50 hover:bg-blue-600 transition-colors"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowMedForm(true)}
                  className="flex items-center gap-2 text-sm text-blue-600 font-medium hover:text-blue-700"
                >
                  <Plus size={15} />
                  Agregar medicamento
                </button>
              )}

              {treatmentError && (
                <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{treatmentError}</p>
              )}

              {medications.length > 0 && (
                <button
                  onClick={saveTreatment}
                  disabled={savingTreatment}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-500 text-white font-medium text-sm disabled:opacity-60 hover:bg-blue-600 transition-colors"
                >
                  {savingTreatment
                    ? <><Loader2 size={16} className="animate-spin" /> Guardando...</>
                    : 'Guardar plan de tratamiento'
                  }
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
