'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  BookOpen, Plus, Pencil, Trash2, ChevronDown, ChevronUp,
  Loader2, CheckCircle2, AlertCircle, Shield,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  listClinicalProtocols, createProtocol, updateProtocol, deleteProtocol,
  type ClinicalProtocol, type CreateProtocolData, type EncounterType,
} from '@/lib/doctor/api'
import {
  ClinicalButton, ClinicalHeader, ClinicalPage, LoadingState, MTPanel, MTPill,
} from '@/components/doctor/clinical-ui'

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'GENERAL', 'FOLLOW_UP', 'POST_DISCHARGE', 'CHRONIC_CONTROL',
  'EMERGENCY', 'PEDIATRICS', 'OBSTETRICS', 'LAB', 'RADIOLOGY',
]

const ENCOUNTER_TYPES: EncounterType[] = [
  'CONSULTATION', 'FOLLOW_UP', 'POST_HOSPITALIZATION',
  'DISCHARGE', 'CHRONIC_CONTROL', 'EMERGENCY',
]

const ENCOUNTER_LABELS: Record<EncounterType, string> = {
  CONSULTATION:         'Consulta',
  FOLLOW_UP:            'Seguimiento',
  POST_HOSPITALIZATION: 'Post-hospitalización',
  DISCHARGE:            'Alta',
  CHRONIC_CONTROL:      'Control crónico',
  EMERGENCY:            'Urgencias',
}

// ─── Protocol form ────────────────────────────────────────────────────────────

function ProtocolForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: ClinicalProtocol
  onSubmit: (data: CreateProtocolData) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [name, setName]                   = useState(initial?.name ?? '')
  const [category, setCategory]           = useState(initial?.category ?? 'GENERAL')
  const [description, setDescription]     = useState(initial?.description ?? '')
  const [encounterType, setEncounterType] = useState<EncounterType | ''>(initial?.encounter_type ?? '')
  const [noteTemplate, setNoteTemplate]   = useState(initial?.note_template ?? '')
  const [treatmentName, setTreatmentName] = useState(initial?.treatment_name ?? '')
  const [followUpDays, setFollowUpDays]   = useState<string>(initial?.follow_up_days?.toString() ?? '')
  const [tags, setTags]                   = useState(initial?.tags?.join(', ') ?? '')

  const valid = name.trim().length > 0

  function handleSubmit() {
    const data: CreateProtocolData = {
      name: name.trim(),
      category,
      description: description || undefined,
      encounter_type: encounterType || undefined,
      note_template: noteTemplate || undefined,
      treatment_name: treatmentName || undefined,
      follow_up_days: followUpDays ? parseInt(followUpDays) : undefined,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    }
    onSubmit(data)
  }

  return (
    <div style={{
      border: '1px solid var(--mt-border)', borderRadius: 10,
      padding: 16, background: 'var(--mt-bg)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Row 1: Name + Category */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '2 1 200px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-text-2)' }}>Nombre *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: Protocolo de hipertensión…"
            style={{
              border: '1px solid var(--mt-border)', borderRadius: 8,
              padding: '7px 10px', fontSize: 13, color: 'var(--mt-text)',
              background: 'var(--mt-surface)', outline: 'none',
            }}
          />
        </div>
        <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-text-2)' }}>Categoría</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{
              border: '1px solid var(--mt-border)', borderRadius: 8,
              padding: '7px 10px', fontSize: 13, color: 'var(--mt-text)',
              background: 'var(--mt-surface)', outline: 'none',
            }}
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-text-2)' }}>Tipo de encuentro</label>
          <select
            value={encounterType}
            onChange={e => setEncounterType(e.target.value as EncounterType | '')}
            style={{
              border: '1px solid var(--mt-border)', borderRadius: 8,
              padding: '7px 10px', fontSize: 13, color: 'var(--mt-text)',
              background: 'var(--mt-surface)', outline: 'none',
            }}
          >
            <option value="">Sin especificar</option>
            {ENCOUNTER_TYPES.map(t => <option key={t} value={t}>{ENCOUNTER_LABELS[t]}</option>)}
          </select>
        </div>
      </div>

      {/* Row 2: Description */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-text-2)' }}>Descripción</label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Breve descripción del protocolo…"
          style={{
            border: '1px solid var(--mt-border)', borderRadius: 8,
            padding: '7px 10px', fontSize: 13, color: 'var(--mt-text)',
            background: 'var(--mt-surface)', outline: 'none',
          }}
        />
      </div>

      {/* Row 3: Note template */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-text-2)' }}>Plantilla de nota clínica</label>
        <textarea
          value={noteTemplate}
          onChange={e => setNoteTemplate(e.target.value)}
          placeholder="Plantilla que se precargará al abrir una consulta con este protocolo…"
          rows={4}
          style={{
            border: '1px solid var(--mt-border)', borderRadius: 8,
            padding: '7px 10px', fontSize: 13, color: 'var(--mt-text)',
            background: 'var(--mt-surface)', outline: 'none',
            resize: 'vertical', fontFamily: 'var(--mt-font-mono)',
          }}
        />
      </div>

      {/* Row 4: Treatment + Follow-up + Tags */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '2 1 180px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-text-2)' }}>Nombre del tratamiento</label>
          <input
            value={treatmentName}
            onChange={e => setTreatmentName(e.target.value)}
            placeholder="Ej: Plan de tratamiento antihipertensivo"
            style={{
              border: '1px solid var(--mt-border)', borderRadius: 8,
              padding: '7px 10px', fontSize: 13, color: 'var(--mt-text)',
              background: 'var(--mt-surface)', outline: 'none',
            }}
          />
        </div>
        <div style={{ flex: '0 1 120px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-text-2)' }}>Seguimiento (días)</label>
          <input
            type="number"
            min="1"
            value={followUpDays}
            onChange={e => setFollowUpDays(e.target.value)}
            placeholder="30"
            style={{
              border: '1px solid var(--mt-border)', borderRadius: 8,
              padding: '7px 10px', fontSize: 13, color: 'var(--mt-text)',
              background: 'var(--mt-surface)', outline: 'none',
            }}
          />
        </div>
        <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-text-2)' }}>Etiquetas (separadas por coma)</label>
          <input
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="hipertensión, cardiología, crónico"
            style={{
              border: '1px solid var(--mt-border)', borderRadius: 8,
              padding: '7px 10px', fontSize: 13, color: 'var(--mt-text)',
              background: 'var(--mt-surface)', outline: 'none',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <ClinicalButton variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          Cancelar
        </ClinicalButton>
        <ClinicalButton
          variant="solid" size="sm"
          onClick={handleSubmit}
          disabled={!valid || submitting}
        >
          {submitting ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
          {initial ? 'Guardar cambios' : 'Crear protocolo'}
        </ClinicalButton>
      </div>
    </div>
  )
}

// ─── Protocol row ─────────────────────────────────────────────────────────────

function ProtocolRow({
  protocol,
  onEdit,
  onDelete,
}: {
  protocol: ClinicalProtocol
  onEdit: (p: ClinicalProtocol) => void
  onDelete: (p: ClinicalProtocol) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isSystem = protocol.source === 'SYSTEM'

  return (
    <div style={{ borderBottom: '1px solid var(--mt-border)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: isSystem ? '#f1f5f9' : 'var(--mt-primary-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isSystem
            ? <Shield size={16} color="var(--mt-muted)" />
            : <BookOpen size={16} color="var(--mt-primary)" />
          }
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--mt-text)' }}>{protocol.name}</span>
            <MTPill tone={isSystem ? 'slate' : 'blue'}>
              {isSystem ? 'Sistema' : 'Propio'}
            </MTPill>
            <MTPill tone="slate">{protocol.category}</MTPill>
            {protocol.encounter_type && (
              <MTPill tone="amber">{ENCOUNTER_LABELS[protocol.encounter_type] ?? protocol.encounter_type}</MTPill>
            )}
          </div>
          {protocol.description && (
            <div style={{ fontSize: 12, color: 'var(--mt-muted)', marginTop: 2 }}>{protocol.description}</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => setExpanded(v => !v)}
            title={expanded ? 'Contraer' : 'Ver detalles'}
            style={{
              width: 30, height: 30, borderRadius: 7,
              border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--mt-text-2)',
            }}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {!isSystem && (
            <>
              <button
                onClick={() => onEdit(protocol)}
                title="Editar"
                style={{
                  width: 30, height: 30, borderRadius: 7,
                  border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--mt-text-2)',
                }}
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => onDelete(protocol)}
                title="Eliminar"
                style={{
                  width: 30, height: 30, borderRadius: 7,
                  border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--mt-danger)',
                }}
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{
          padding: '0 14px 12px 62px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {protocol.note_template && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mt-text-2)', marginBottom: 4 }}>Plantilla de nota</div>
              <pre style={{
                fontSize: 12, color: 'var(--mt-text)', background: 'var(--mt-elevated)',
                padding: '8px 10px', borderRadius: 6, whiteSpace: 'pre-wrap',
                fontFamily: 'var(--mt-font-mono)', margin: 0,
              }}>{protocol.note_template}</pre>
            </div>
          )}
          {protocol.treatment_name && (
            <div style={{ fontSize: 12, color: 'var(--mt-text-2)' }}>
              <strong>Tratamiento:</strong> {protocol.treatment_name}
              {protocol.follow_up_days ? ` · Seguimiento en ${protocol.follow_up_days} días` : ''}
            </div>
          )}
          {protocol.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {protocol.tags.map(tag => (
                <MTPill key={tag} tone="slate">{tag}</MTPill>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProtocolsSettingsPage() {
  const { token } = useAuth()
  const [protocols, setProtocols] = useState<ClinicalProtocol[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ClinicalProtocol | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const toast$ = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      setProtocols(await listClinicalProtocols(token))
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar protocolos')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  async function handleCreate(data: CreateProtocolData) {
    if (!token) return
    setSubmitting(true)
    try {
      await createProtocol(token, data)
      await load()
      setShowForm(false)
      toast$('Protocolo creado')
    } catch (e: unknown) {
      toast$(e instanceof Error ? e.message : 'Error', false)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate(data: CreateProtocolData) {
    if (!token || !editing) return
    setSubmitting(true)
    try {
      await updateProtocol(token, editing.id, data)
      await load()
      setEditing(null)
      toast$('Protocolo actualizado')
    } catch (e: unknown) {
      toast$(e instanceof Error ? e.message : 'Error', false)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(protocol: ClinicalProtocol) {
    if (!token) return
    if (!confirm(`¿Eliminar el protocolo "${protocol.name}"?`)) return
    try {
      await deleteProtocol(token, protocol.id)
      await load()
      toast$('Protocolo eliminado')
    } catch (e: unknown) {
      toast$(e instanceof Error ? e.message : 'Error', false)
    }
  }

  const tenantProtocols = protocols.filter(p => p.source === 'TENANT')
  const systemProtocols = protocols.filter(p => p.source === 'SYSTEM')

  return (
    <ClinicalPage>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderRadius: 10,
          background: toast.ok ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${toast.ok ? '#bbf7d0' : '#fecaca'}`,
          boxShadow: '0 4px 16px rgba(0,0,0,.1)', fontSize: 13,
          color: toast.ok ? '#166534' : '#991b1b',
        }}>
          {toast.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      <ClinicalHeader
        title="Protocolos clínicos"
        subtitle="Crea plantillas de consulta reutilizables para tu clínica"
        icon={BookOpen}
        actions={
          !showForm && !editing ? (
            <ClinicalButton variant="solid" size="sm" onClick={() => setShowForm(true)}>
              <Plus size={14} />
              Nuevo protocolo
            </ClinicalButton>
          ) : undefined
        }
      />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {showForm && (
          <ProtocolForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
            submitting={submitting}
          />
        )}

        {loading ? (
          <LoadingState label="Cargando protocolos…" />
        ) : error ? (
          <div style={{ padding: 20, color: 'var(--mt-danger)', fontSize: 13 }}>{error}</div>
        ) : (
          <>
            {/* Tenant protocols */}
            <MTPanel title={`Protocolos de tu clínica (${tenantProtocols.length})`} icon={BookOpen} accent="blue">
              {tenantProtocols.length === 0 ? (
                <div style={{ padding: '28px 20px', textAlign: 'center' }}>
                  <BookOpen size={28} color="var(--mt-muted)" style={{ margin: '0 auto 10px' }} />
                  <p style={{ fontSize: 13, color: 'var(--mt-text-2)', marginBottom: 6 }}>
                    No hay protocolos propios aún
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--mt-muted)' }}>
                    Crea protocolos personalizados para precargar plantillas de nota y planes de tratamiento en las consultas.
                  </p>
                </div>
              ) : (
                tenantProtocols.map(p => (
                  editing?.id === p.id ? (
                    <div key={p.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--mt-border)' }}>
                      <ProtocolForm
                        initial={p}
                        onSubmit={handleUpdate}
                        onCancel={() => setEditing(null)}
                        submitting={submitting}
                      />
                    </div>
                  ) : (
                    <ProtocolRow
                      key={p.id}
                      protocol={p}
                      onEdit={setEditing}
                      onDelete={handleDelete}
                    />
                  )
                ))
              )}
            </MTPanel>

            {/* System protocols (read-only) */}
            {systemProtocols.length > 0 && (
              <MTPanel title={`Protocolos del sistema (${systemProtocols.length}) — solo lectura`} icon={Shield} accent="slate">
                {systemProtocols.map(p => (
                  <ProtocolRow
                    key={p.id}
                    protocol={p}
                    onEdit={() => {}}
                    onDelete={() => {}}
                  />
                ))}
              </MTPanel>
            )}
          </>
        )}
      </div>
    </ClinicalPage>
  )
}
