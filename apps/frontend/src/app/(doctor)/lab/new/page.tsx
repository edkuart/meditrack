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
import { hasPermission, PERMISSIONS } from '@/lib/doctor/permissions'
import { listPatients, getPatient, type Patient } from '@/lib/doctor/api'
import {
  createLabOrder, LAB_PANELS, type LabResultInput, type PanelTemplate,
} from '@/lib/doctor/lab-api'
import { ClinicalPage, ClinicalHeader, ClinicalButton } from '@/components/doctor/clinical-ui'
import { Input } from '@/components/ui/input'

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
    <div ref={ref} style={{ position: 'relative' }}>
      {value ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', borderRadius: 12,
          border: '1px solid var(--mt-border)', background: 'var(--mt-elevated)',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)' }}>
              {value.first_name} {value.last_name}
            </div>
            {value.date_of_birth && (
              <div style={{ fontSize: 11, color: 'var(--mt-muted)' }}>
                {new Date(value.date_of_birth).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => { onChange(null); setQuery('') }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mt-muted)', display: 'flex', alignItems: 'center', padding: 2 }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--mt-text-2)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--mt-muted)')}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--mt-muted)', pointerEvents: 'none' }} />
            <Input
              placeholder="Buscar paciente por nombre…"
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              style={{ paddingLeft: 32, height: 40, fontSize: 13 }}
            />
          </div>
          {open && (results.length > 0 || loading) && (
            <div style={{
              position: 'absolute', top: '100%', marginTop: 4, left: 0, right: 0, zIndex: 10,
              background: 'var(--mt-surface)', borderRadius: 12,
              border: '1px solid var(--mt-border)', boxShadow: 'var(--mt-shadow-md)', overflow: 'hidden',
            }}>
              {loading ? (
                <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--mt-muted)' }}>Buscando…</div>
              ) : results.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onChange(p); setOpen(false); setQuery('') }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px', textAlign: 'left', background: 'transparent',
                    border: 'none', borderBottom: i < results.length - 1 ? '1px solid var(--mt-border)' : 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--mt-elevated)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text)' }}>{p.first_name} {p.last_name}</div>
                    {p.date_of_birth && (
                      <div style={{ fontSize: 11, color: 'var(--mt-muted)' }}>
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
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          borderRadius: 8, background: 'var(--mt-primary)', padding: '8px 12px',
          fontSize: 13, fontWeight: 600, color: '#fff',
          border: 'none', cursor: 'pointer',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--mt-primary-deep)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--mt-primary)')}
        aria-expanded={open}
      >
        <ClipboardList size={14} />
        Panel prearmado
        <ChevronDown size={12} style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 20, marginTop: 8,
          width: 'min(640px, calc(100vw - 2rem))', overflow: 'hidden',
          borderRadius: 16, border: '1px solid var(--mt-border)',
          background: 'var(--mt-surface)', boxShadow: '0 20px 60px rgba(0,0,0,.15)',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--mt-border)', background: 'var(--mt-elevated)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 36, height: 36, flexShrink: 0, borderRadius: 10,
                background: 'var(--mt-primary-subtle)', color: 'var(--mt-primary-deep)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ClipboardList size={17} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)', margin: 0 }}>Selecciona un panel de laboratorio</p>
                <p style={{ marginTop: 4, fontSize: 11, lineHeight: 1.5, color: 'var(--mt-muted)', margin: '4px 0 0' }}>
                  Un panel agrega varios exámenes relacionados en una sola acción. No guarda la orden todavía;
                  primero aparecerá abajo en la vista previa.
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', maxHeight: 520, overflowY: 'auto', gridTemplateColumns: '210px 1fr' }}>
            <div style={{ borderRight: '1px solid var(--mt-border)', padding: 12 }}>
              <p style={{ marginBottom: 8, padding: '0 8px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mt-muted)' }}>
                Categoría
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {CATEGORIES.map(c => (
                  <CatButton key={c} label={c} help={CATEGORY_HELP[c]} active={cat === c} onClick={() => setCat(c)} />
                ))}
              </div>
            </div>

            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)', margin: 0 }}>{cat}</p>
                <p style={{ marginTop: 2, fontSize: 11, color: 'var(--mt-muted)' }}>
                  Elige el paquete que mejor coincide con lo que quieres pedir.
                </p>
              </div>

              {panels.map(panel => (
                <PanelCard key={panel.name} panel={panel} onAdd={() => { onAdd(panel); setOpen(false) }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CatButton({ label, help, active, onClick }: { label: string; help?: string; active: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '100%', borderRadius: 10, padding: '10px 12px', textAlign: 'left',
        background: active ? 'var(--mt-primary-subtle)' : hov ? 'var(--mt-elevated)' : 'transparent',
        border: active ? '1px solid var(--mt-primary-mist)' : '1px solid transparent',
        cursor: 'pointer',
      }}
    >
      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: active ? 'var(--mt-primary-deep)' : 'var(--mt-text-2)' }}>{label}</span>
      {help && <span style={{ marginTop: 2, display: 'block', fontSize: 11, lineHeight: 1.4, color: 'var(--mt-muted)' }}>{help}</span>}
    </button>
  )
}

function PanelCard({ panel, onAdd }: { panel: PanelTemplate; onAdd: () => void }) {
  const [hov, setHov] = useState(false)
  const [btnHov, setBtnHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 12, padding: 12,
        border: `1px solid ${hov ? 'var(--mt-primary-mist)' : 'var(--mt-border)'}`,
        background: hov ? 'var(--mt-primary-subtle)' : 'var(--mt-surface)',
        transition: 'border-color .1s, background .1s',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)', margin: 0 }}>{panel.name}</p>
            <span style={{
              borderRadius: 999, background: 'var(--mt-elevated)', padding: '2px 8px',
              fontSize: 11, fontWeight: 500, color: 'var(--mt-muted)',
            }}>
              {panel.parameters.length} parámetro{panel.parameters.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p style={{ marginTop: 4, fontSize: 11, lineHeight: 1.5, color: 'var(--mt-muted)' }}>
            {PANEL_HELP[panel.name] ?? 'Grupo de exámenes frecuentes.'}
          </p>
          <p style={{ marginTop: 6, fontSize: 11, lineHeight: 1.5, color: 'var(--mt-muted)', opacity: 0.7 }}>
            Incluye: {panelPreview(panel)}
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          onMouseEnter={() => setBtnHov(true)}
          onMouseLeave={() => setBtnHov(false)}
          style={{
            alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6,
            borderRadius: 8, padding: '7px 12px', fontSize: 11, fontWeight: 600,
            border: `1px solid ${btnHov ? 'var(--mt-primary)' : 'var(--mt-primary-mist)'}`,
            background: btnHov ? 'var(--mt-primary-subtle)' : 'var(--mt-elevated)',
            color: 'var(--mt-primary-deep)', cursor: 'pointer',
          }}
        >
          <Plus size={13} />
          Agregar este panel
        </button>
      </div>
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
    <div style={{
      borderRadius: 12, border: '1px dashed var(--mt-primary-mist)',
      background: 'var(--mt-primary-subtle)', padding: 16,
    }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 36, height: 36, flexShrink: 0, borderRadius: 10,
          background: 'var(--mt-surface)', color: 'var(--mt-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--mt-shadow-sm)',
        }}>
          <Plus size={17} />
        </div>
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)', margin: 0 }}>Examen específico</h3>
          <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--mt-muted)', margin: '4px 0 0' }}>
            Úsalo para pedir una prueba suelta que no exista en los paneles. El nombre del examen es lo único obligatorio.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1.25fr 120px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-muted)' }}>Grupo o panel</span>
          <Input
            value={draft.panel_name}
            onChange={e => onChange('panel_name', e.target.value)}
            placeholder="Ej. Perfil tiroideo"
            style={{ height: 40, fontSize: 13 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-muted)' }}>Examen / parámetro *</span>
          <Input
            value={draft.parameter_name}
            onChange={e => onChange('parameter_name', e.target.value)}
            placeholder="Ej. TSH, Ferritina, Vitamina D"
            style={{ height: 40, fontSize: 13 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-muted)' }}>Unidad</span>
          <Input
            value={draft.unit}
            onChange={e => onChange('unit', e.target.value)}
            placeholder="Ej. mg/dL"
            style={{ height: 40, fontSize: 13 }}
          />
        </label>
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {COMMON_UNITS.map(unit => (
          <UnitChip key={unit} unit={unit} active={draft.unit === unit} onClick={() => onChange('unit', unit)} />
        ))}
      </div>

      <details style={{ marginTop: 16, borderRadius: 8, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)' }}>
        <summary style={{
          display: 'flex', cursor: 'pointer', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--mt-text-2)',
        }}>
          Referencia del resultado
          <ChevronDown size={14} />
        </summary>
        <div style={{ display: 'grid', gap: 12, borderTop: '1px solid var(--mt-border)', padding: 12, gridTemplateColumns: '110px 110px 1fr' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-muted)' }}>Mínimo</span>
            <Input
              type="number"
              value={draft.ref_min}
              onChange={e => onChange('ref_min', e.target.value)}
              placeholder="Mín"
              style={{ height: 36, fontSize: 13 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-muted)' }}>Máximo</span>
            <Input
              type="number"
              value={draft.ref_max}
              onChange={e => onChange('ref_max', e.target.value)}
              placeholder="Máx"
              style={{ height: 36, fontSize: 13 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-muted)' }}>Texto de referencia</span>
            <Input
              value={draft.ref_text}
              onChange={e => onChange('ref_text', e.target.value)}
              placeholder="Ej. Negativo / No reactivo"
              style={{ height: 36, fontSize: 13 }}
            />
          </label>
        </div>
      </details>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 8,
            background: canAdd ? 'var(--mt-primary)' : 'var(--mt-elevated)',
            padding: '8px 14px', fontSize: 13, fontWeight: 600,
            color: canAdd ? '#fff' : 'var(--mt-muted)',
            border: 'none', cursor: canAdd ? 'pointer' : 'not-allowed',
          }}
        >
          <CheckCircle2 size={15} />
          Agregar a la orden
        </button>
      </div>
    </div>
  )
}

function UnitChip({ unit, active, onClick }: { unit: string; active: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 500,
        border: active ? '1px solid var(--mt-primary-mist)' : `1px solid ${hov ? 'var(--mt-primary-mist)' : 'var(--mt-border)'}`,
        background: active ? 'var(--mt-primary-subtle)' : hov ? 'var(--mt-primary-subtle)' : 'var(--mt-surface)',
        color: active || hov ? 'var(--mt-primary-deep)' : 'var(--mt-muted)',
        cursor: 'pointer',
      }}
    >
      {unit}
    </button>
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
      <div style={{
        borderRadius: 12, border: '1px solid var(--mt-border)', background: 'var(--mt-elevated)',
        padding: '32px 20px', textAlign: 'center',
      }}>
        <ClipboardList size={28} color="var(--mt-border)" style={{ margin: '0 auto 12px' }} />
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text-2)', margin: 0 }}>Todavía no hay exámenes en la orden.</p>
        <p style={{ marginTop: 4, fontSize: 11, color: 'var(--mt-muted)' }}>Agrega un panel prearmado o un examen específico.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {groups.map(group => (
        <div key={group.name} style={{ borderRadius: 12, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--mt-border)', padding: '12px 16px' }}>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)', margin: 0 }}>{group.name}</h3>
              <p style={{ fontSize: 11, color: 'var(--mt-muted)', margin: 0 }}>
                {group.items.length} parámetro{group.items.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div>
            {group.items.map((item, idx) => (
              <div key={`${item.originalIndex}-${item.parameter_name}`} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                borderBottom: idx < group.items.length - 1 ? '1px solid var(--mt-border)' : 'none',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.parameter_name || 'Sin nombre'}
                  </div>
                  <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: 'var(--mt-muted)' }}>
                    {item.unit && <span>Unidad: {item.unit}</span>}
                    <span>Referencia: <ReferenceText row={item} /></span>
                  </div>
                </div>
                <RemoveBtn onClick={() => onRemove(item.originalIndex)} label={item.parameter_name} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function RemoveBtn({ onClick, label }: { onClick: () => void; label: string }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      aria-label={`Quitar ${label}`}
      style={{
        width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hov ? 'var(--mt-danger-subtle)' : 'transparent',
        color: hov ? 'var(--mt-danger)' : 'var(--mt-muted)',
      }}
    >
      <Trash2 size={15} />
    </button>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  borderRadius: 12, border: '1px solid var(--mt-border)',
  background: 'var(--mt-surface)', boxShadow: 'var(--mt-shadow-sm)',
}

const cardHeaderStyle: React.CSSProperties = {
  padding: '16px 20px', borderBottom: '1px solid var(--mt-border)',
}

export default function NewLabOrderPage() {
  const { token, user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const canCreateLabOrder = hasPermission(user?.role, PERMISSIONS.LAB_ORDER_WRITE, user?.permissions)

  useEffect(() => {
    if (user && !canCreateLabOrder) {
      router.replace('/lab')
    }
  }, [user, canCreateLabOrder, router])

  const [patient, setPatient] = useState<Patient | null>(null)

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

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Patient */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text-2)', margin: 0 }}>Paciente</h2>
          </div>
          <div style={{ padding: 20 }}>
            {token && (
              <PatientPicker value={patient} onChange={setPatient} token={token} />
            )}
          </div>
        </div>

        {/* Parameters */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text-2)', margin: 0 }}>
                    Estudios a solicitar
                    {rows.length > 0 && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: 'var(--mt-muted)' }}>
                        {rows.length} parámetro{rows.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </h2>
                  <p style={{ marginTop: 4, fontSize: 11, color: 'var(--mt-muted)' }}>
                    El paciente verá esta orden como laboratorio pendiente en su portada.
                  </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <PanelSelector onAdd={addPanel} />
                  <ToggleCustomBtn active={showCustom} onClick={() => setShowCustom(v => !v)} />
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, borderRadius: 12,
              border: '1px solid var(--mt-primary-mist)', background: 'var(--mt-primary-subtle)',
              padding: '12px 16px', fontSize: 13, color: 'var(--mt-primary-deep)',
            }}>
              <Info size={16} style={{ marginTop: 2, flexShrink: 0, color: 'var(--mt-primary)' }} />
              <p style={{ lineHeight: 1.5, margin: 0 }}>
                Usa <span style={{ fontWeight: 600 }}>Panel prearmado</span> cuando quieres pedir un paquete frecuente
                como hemograma o función renal. Usa <span style={{ fontWeight: 600 }}>Examen específico</span> cuando
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
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <h3 style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mt-muted)', margin: 0 }}>
                  Vista previa de la orden
                </h3>
                {rows.length > 0 && (
                  <span style={{
                    borderRadius: 999, background: 'var(--mt-elevated)',
                    padding: '4px 10px', fontSize: 11, fontWeight: 500, color: 'var(--mt-muted)',
                  }}>
                    Se guardará como pendiente
                  </span>
                )}
              </div>
              <OrderPreview rows={rows} onRemove={removeRow} />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text-2)', margin: 0 }}>
              Notas de la orden <span style={{ fontWeight: 400, color: 'var(--mt-muted)' }}>(opcional)</span>
            </h2>
          </div>
          <div style={{ padding: 20 }}>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Indicaciones clínicas, contexto, preparación del paciente…"
              style={{
                width: '100%', fontSize: 13, border: '1px solid var(--mt-border)', borderRadius: 8,
                padding: '10px 12px', resize: 'none', outline: 'none',
                background: 'var(--mt-surface)', color: 'var(--mt-text)',
                fontFamily: 'var(--mt-font)', boxSizing: 'border-box',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--mt-primary)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--mt-primary-subtle)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--mt-border)'; e.currentTarget.style.boxShadow = 'none' }}
            />
          </div>
        </div>

        {error && (
          <div style={{
            padding: '12px 16px', borderRadius: 12,
            background: 'var(--mt-danger-subtle)', border: '1px solid #fecaca',
            fontSize: 13, color: 'var(--mt-danger)',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <ClinicalButton href="/lab" variant="outline">Cancelar</ClinicalButton>
          <ClinicalButton type="submit" disabled={submitting}>
            {submitting ? 'Creando…' : 'Crear orden'}
          </ClinicalButton>
        </div>
      </form>
    </ClinicalPage>
  )
}

function ToggleCustomBtn({ active, onClick }: { active: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '8px 12px',
        fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer',
        background: active ? 'var(--mt-text)' : hov ? 'var(--mt-elevated)' : 'transparent',
        color: active ? '#fff' : hov ? 'var(--mt-text)' : 'var(--mt-text-2)',
      }}
    >
      <Plus size={12} />
      Examen específico
    </button>
  )
}
