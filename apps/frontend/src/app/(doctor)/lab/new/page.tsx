'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FlaskConical,
  Info,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { listPatients, getPatient, type Patient } from '@/lib/doctor/api'
import {
  createLabOrder, LAB_PANELS, type LabResultInput, type PanelTemplate,
} from '@/lib/doctor/lab-api'
import { ClinicalPage, ClinicalHeader, ClinicalButton } from '@/components/doctor/clinical-ui'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ─── Patient Picker ────────────────────────────────────────────────────────────

function PatientPicker({
  value,
  onChange,
  token,
}: {
  value: Patient | null
  onChange: (p: Patient | null) => void
  token: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Patient[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  useEffect(() => {
    if (!query) { setResults([]); return }
    setLoading(true)
    listPatients(token, query, 1, 8)
      .then(r => setResults(r.patients))
      .finally(() => setLoading(false))
  }, [query, token])

  return (
    <div ref={ref} className="relative">
      {value ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50">
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800">
              {value.first_name} {value.last_name}
            </div>
            {value.date_of_birth && (
              <div className="text-xs text-slate-400">
                {new Date(value.date_of_birth).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => { onChange(null); setQuery('') }}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar paciente por nombre…"
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              className="pl-8 h-10 text-sm"
            />
          </div>
          {open && (results.length > 0 || loading) && (
            <div className="absolute top-full mt-1 left-0 right-0 z-10 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
              {loading ? (
                <div className="px-4 py-3 text-sm text-slate-400">Buscando…</div>
              ) : results.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onChange(p); setOpen(false); setQuery('') }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-800">{p.first_name} {p.last_name}</div>
                    {p.date_of_birth && (
                      <div className="text-xs text-slate-400">
                        {new Date(p.date_of_birth).toLocaleDateString('es')}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Panel Selector ───────────────────────────────────────────────────────────

const CATEGORIES = Array.from(new Set(LAB_PANELS.map(p => p.category)))

const CATEGORY_HELP: Record<string, string> = {
  Hematología: 'Sangre y células: anemia, infección, plaquetas.',
  'Química sanguínea': 'Glucosa, riñón, hígado, lípidos y metabolismo.',
  Hormonas: 'Hormonas y función endocrina.',
  Uroanálisis: 'Orina, riñón, infección urinaria y sedimento.',
}

const PANEL_HELP: Record<string, string> = {
  'Hemograma completo': 'Evaluación general de glóbulos rojos, blancos y plaquetas.',
  Glicemia: 'Glucosa en ayunas para tamizaje o control metabólico.',
  HbA1c: 'Promedio aproximado de glucosa de los últimos meses.',
  'Panel metabólico básico': 'Glucosa, electrolitos y función renal básica.',
  'Perfil lipídico': 'Colesterol y triglicéridos para riesgo cardiovascular.',
  'Función renal': 'Marcadores orientados a riñón y depuración.',
  'Función hepática': 'Marcadores de hígado y vía biliar.',
  'Perfil tiroideo': 'TSH y T4 libre para función tiroidea.',
  'Examen general de orina': 'Parámetros básicos de orina y sedimento.',
}

function panelPreview(panel: PanelTemplate) {
  const names = panel.parameters.map(p => p.parameter_name)
  const visible = names.slice(0, 4).join(', ')
  return names.length > 4 ? `${visible} y ${names.length - 4} más` : visible
}

function PanelSelector({ onAdd }: { onAdd: (panel: PanelTemplate) => void }) {
  const [open, setOpen] = useState(false)
  const [cat, setCat] = useState(CATEGORIES[0])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const panels = LAB_PANELS.filter(p => p.category === cat)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
        aria-expanded={open}
      >
        <ClipboardList size={14} />
        Panel prearmado
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-[min(640px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <ClipboardList size={17} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Selecciona un panel de laboratorio</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Un panel agrega varios exámenes relacionados en una sola acción. No guarda la orden todavía;
                  primero aparecerá abajo en la vista previa.
                </p>
              </div>
            </div>
          </div>

          <div className="grid max-h-[520px] overflow-y-auto md:grid-cols-[210px_1fr]">
            <div className="border-b border-slate-100 p-3 md:border-b-0 md:border-r">
              <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Categoría
              </p>
              <div className="space-y-1">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCat(c)}
                    className={cn(
                      'w-full rounded-xl px-3 py-2.5 text-left transition-colors',
                      cat === c
                        ? 'bg-blue-50 text-blue-800 ring-1 ring-blue-100'
                        : 'text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <span className="block text-sm font-semibold">{c}</span>
                    <span className="mt-0.5 block text-xs leading-4 text-slate-400">
                      {CATEGORY_HELP[c] ?? 'Exámenes agrupados por área clínica.'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 p-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{cat}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Elige el paquete que mejor coincide con lo que quieres pedir.
                </p>
              </div>

              {panels.map(panel => (
                <div
                  key={panel.name}
                  className="rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-blue-200 hover:bg-blue-50/30"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800">{panel.name}</p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                          {panel.parameters.length} parámetro{panel.parameters.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {PANEL_HELP[panel.name] ?? 'Grupo de exámenes frecuentes.'}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-slate-400">
                        Incluye: {panelPreview(panel)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { onAdd(panel); setOpen(false) }}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                    >
                      <Plus size={13} />
                      Agregar este panel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Custom Parameters ────────────────────────────────────────────────────────

interface RowState {
  panel_name: string
  parameter_name: string
  unit: string
  ref_min: string
  ref_max: string
  ref_text: string
}

interface CustomDraft {
  panel_name: string
  parameter_name: string
  unit: string
  ref_min: string
  ref_max: string
  ref_text: string
}

const EMPTY_CUSTOM_DRAFT: CustomDraft = {
  panel_name: 'Personalizado',
  parameter_name: '',
  unit: '',
  ref_min: '',
  ref_max: '',
  ref_text: '',
}

const COMMON_UNITS = ['mg/dL', 'g/dL', '%', 'mmol/L', 'mEq/L', 'U/L']

function ReferenceText({ row }: { row: RowState }) {
  if (row.ref_text.trim()) return <>{row.ref_text}</>
  if (row.ref_min && row.ref_max) return <>{row.ref_min} - {row.ref_max}</>
  if (row.ref_min) return <>Min. {row.ref_min}</>
  if (row.ref_max) return <>Max. {row.ref_max}</>
  return <>Sin referencia</>
}

function CustomParameterForm({
  draft,
  onChange,
  onAdd,
}: {
  draft: CustomDraft
  onChange: (field: keyof CustomDraft, value: string) => void
  onAdd: () => void
}) {
  const canAdd = draft.parameter_name.trim().length > 0

  return (
    <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-4">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
          <Plus size={17} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Examen específico</h3>
          <p className="text-xs leading-5 text-slate-500">
            Úsalo para pedir una prueba suelta que no exista en los paneles. El nombre del examen es lo único obligatorio.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_1.25fr_120px]">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Grupo o panel</span>
          <Input
            value={draft.panel_name}
            onChange={e => onChange('panel_name', e.target.value)}
            placeholder="Ej. Perfil tiroideo"
            className="h-10 text-sm"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Examen / parámetro *</span>
          <Input
            value={draft.parameter_name}
            onChange={e => onChange('parameter_name', e.target.value)}
            placeholder="Ej. TSH, Ferritina, Vitamina D"
            className="h-10 text-sm"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Unidad</span>
          <Input
            value={draft.unit}
            onChange={e => onChange('unit', e.target.value)}
            placeholder="Ej. mg/dL"
            className="h-10 text-sm"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {COMMON_UNITS.map(unit => (
          <button
            key={unit}
            type="button"
            onClick={() => onChange('unit', unit)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              draft.unit === unit
                ? 'border-blue-300 bg-blue-100 text-blue-700'
                : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-600',
            )}
          >
            {unit}
          </button>
        ))}
      </div>

      <details className="mt-4 rounded-lg border border-slate-200 bg-white">
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-xs font-semibold text-slate-600">
          Referencia del resultado
          <ChevronDown size={14} />
        </summary>
        <div className="grid gap-3 border-t border-slate-100 p-3 md:grid-cols-[110px_110px_1fr]">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-500">Mínimo</span>
            <Input
              type="number"
              value={draft.ref_min}
              onChange={e => onChange('ref_min', e.target.value)}
              placeholder="Mín"
              className="h-9 text-sm"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-500">Máximo</span>
            <Input
              type="number"
              value={draft.ref_max}
              onChange={e => onChange('ref_max', e.target.value)}
              placeholder="Máx"
              className="h-9 text-sm"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-500">Texto de referencia</span>
            <Input
              value={draft.ref_text}
              onChange={e => onChange('ref_text', e.target.value)}
              placeholder="Ej. Negativo / No reactivo"
              className="h-9 text-sm"
            />
          </label>
        </div>
      </details>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          <CheckCircle2 size={15} />
          Agregar a la orden
        </button>
      </div>
    </div>
  )
}

function OrderPreview({
  rows,
  onRemove,
}: {
  rows: RowState[]
  onRemove: (idx: number) => void
}) {
  const groups = rows.reduce<Array<{ name: string; items: Array<RowState & { originalIndex: number }> }>>((acc, row, originalIndex) => {
    const name = row.panel_name.trim() || 'Personalizado'
    const group = acc.find(g => g.name === name)
    if (group) group.items.push({ ...row, originalIndex })
    else acc.push({ name, items: [{ ...row, originalIndex }] })
    return acc
  }, [])

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-8 text-center">
        <ClipboardList className="mx-auto mb-3 text-slate-300" size={28} />
        <p className="text-sm font-medium text-slate-600">Todavía no hay exámenes en la orden.</p>
        <p className="mt-1 text-xs text-slate-400">Agrega un panel prearmado o un examen específico.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {groups.map(group => (
        <div key={group.name} className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">{group.name}</h3>
              <p className="text-xs text-slate-400">
                {group.items.length} parámetro{group.items.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {group.items.map(item => (
              <div key={`${item.originalIndex}-${item.parameter_name}`} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-700">{item.parameter_name || 'Sin nombre'}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                    {item.unit && <span>Unidad: {item.unit}</span>}
                    <span>Referencia: <ReferenceText row={item} /></span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(item.originalIndex)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                  aria-label={`Quitar ${item.parameter_name}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function NewLabOrderPage() {
  const { token, user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Lab technicians cannot create orders
  useEffect(() => {
    if (user?.role === 'LAB_TECHNICIAN') {
      router.replace('/lab')
    }
  }, [user, router])

  const [patient, setPatient] = useState<Patient | null>(null)

  // Pre-fill patient from ?patient=<id> query param
  useEffect(() => {
    const pid = searchParams.get('patient')
    if (!pid || !token) return
    getPatient(token, pid).then(setPatient).catch(() => {})
  }, [searchParams, token])
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<RowState[]>([])
  const [showCustom, setShowCustom] = useState(false)
  const [customDraft, setCustomDraft] = useState<CustomDraft>(EMPTY_CUSTOM_DRAFT)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function addPanel(panel: PanelTemplate) {
    setRows(prev => [
      ...prev,
      ...panel.parameters.map(p => ({
        panel_name:     p.panel_name,
        parameter_name: p.parameter_name,
        unit:           p.unit ?? '',
        ref_min:        p.ref_min != null ? String(p.ref_min) : '',
        ref_max:        p.ref_max != null ? String(p.ref_max) : '',
        ref_text:       p.ref_text ?? '',
      })),
    ])
    setError('')
  }

  function updateCustomDraft(field: keyof CustomDraft, value: string) {
    setCustomDraft(prev => ({ ...prev, [field]: value }))
  }

  function addCustomParameter() {
    if (!customDraft.parameter_name.trim()) {
      setError('Escribe el nombre del examen o parámetro personalizado.')
      return
    }

    setRows(prev => [
      ...prev,
      {
        panel_name: customDraft.panel_name.trim() || 'Personalizado',
        parameter_name: customDraft.parameter_name.trim(),
        unit: customDraft.unit.trim(),
        ref_min: customDraft.ref_min,
        ref_max: customDraft.ref_max,
        ref_text: customDraft.ref_text.trim(),
      },
    ])
    setCustomDraft(prev => ({ ...EMPTY_CUSTOM_DRAFT, panel_name: prev.panel_name.trim() || 'Personalizado' }))
    setShowCustom(false)
    setError('')
  }

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!patient) { setError('Selecciona un paciente.'); return }
    if (rows.length === 0) { setError('Agrega al menos un parámetro.'); return }
    if (!token) return

    const invalidRow = rows.findIndex(r => !r.panel_name.trim() || !r.parameter_name.trim())
    if (invalidRow !== -1) {
      setError(`La fila ${invalidRow + 1} necesita nombre de panel y parámetro.`)
      return
    }

    const results: LabResultInput[] = rows.map(r => ({
      panel_name:     r.panel_name.trim(),
      parameter_name: r.parameter_name.trim(),
      unit:           r.unit.trim() || undefined,
      ref_min:        r.ref_min !== '' ? Number(r.ref_min) : undefined,
      ref_max:        r.ref_max !== '' ? Number(r.ref_max) : undefined,
      ref_text:       r.ref_text.trim() || undefined,
    }))

    setSubmitting(true)
    setError('')
    try {
      const order = await createLabOrder(token, {
        patient_id: patient.id,
        notes:      notes.trim() || undefined,
        results,
      })
      router.push(`/lab/${order.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al crear la orden.')
      setSubmitting(false)
    }
  }

  return (
    <ClinicalPage size="compact">
      <ClinicalHeader
        eyebrow="Laboratorio"
        title="Nueva orden"
        subtitle="Define los parámetros que deseas solicitar para este paciente."
        icon={FlaskConical}
        actions={
          <ClinicalButton href="/lab" variant="outline" icon={ArrowLeft}>Volver</ClinicalButton>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Patient */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Paciente</h2>
          </div>
          <div className="p-5">
            {token && (
              <PatientPicker value={patient} onChange={setPatient} token={token} />
            )}
          </div>
        </div>

        {/* Parameters */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">
                  Estudios a solicitar
                  {rows.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {rows.length} parámetro{rows.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  El paciente verá esta orden como laboratorio pendiente en su portada.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PanelSelector onAdd={addPanel} />
                <button
                  type="button"
                  onClick={() => setShowCustom(v => !v)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                    showCustom
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
                  )}
                >
                  <Plus size={12} />
                  Examen específico
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <Info size={16} className="mt-0.5 shrink-0 text-blue-600" />
              <p className="leading-5">
                Usa <span className="font-semibold">Panel prearmado</span> cuando quieres pedir un paquete frecuente
                como hemograma o función renal. Usa <span className="font-semibold">Examen específico</span> cuando
                necesitas pedir una prueba suelta que no aparece en el catálogo.
              </p>
            </div>

            {showCustom && (
              <CustomParameterForm
                draft={customDraft}
                onChange={updateCustomDraft}
                onAdd={addCustomParameter}
              />
            )}

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Vista previa de la orden
                </h3>
                {rows.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                    Se guardará como pendiente
                  </span>
                )}
              </div>
              <OrderPreview rows={rows} onRemove={removeRow} />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Notas de la orden <span className="text-slate-400 font-normal">(opcional)</span></h2>
          </div>
          <div className="p-5">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Indicaciones clínicas, contexto, preparación del paciente…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 text-slate-700 placeholder:text-slate-300"
            />
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <ClinicalButton href="/lab" variant="outline">Cancelar</ClinicalButton>
          <ClinicalButton type="submit" disabled={submitting}>
            {submitting ? 'Creando…' : 'Crear orden'}
          </ClinicalButton>
        </div>
      </form>
    </ClinicalPage>
  )
}
