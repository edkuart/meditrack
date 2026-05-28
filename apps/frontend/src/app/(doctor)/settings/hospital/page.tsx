'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Plus, Users, Trash2, Loader2, ChevronRight, X,
  Pencil, MapPin, UserPlus, BedDouble, ShieldCheck, BarChart3,
  ArrowRight, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  addMember, removeMember, upgradeTenantToHospital,
  DEPARTMENT_TYPE_LABELS, ROLE_LABELS,
  type Department,
} from '@/lib/doctor/departments-api'
import { listLocations, type Location } from '@/lib/doctor/locations-api'
import { listStaff, type StaffMember } from '@/lib/doctor/staff-api'
import { hasPermission, PERMISSIONS } from '@/lib/doctor/permissions'
import { normalizeBillingPlan } from '@/lib/pricing/plans'

const DEPT_TYPES = Object.entries(DEPARTMENT_TYPE_LABELS)

const HOSPITAL_FEATURES = [
  { icon: Building2,   label: 'Departamentos',         desc: 'Crea Laboratorio, Radiología, Farmacia y más' },
  { icon: Users,       label: 'Roles especializados',  desc: 'Asigna roles por departamento y área clínica' },
  { icon: BedDouble,   label: 'Censo hospitalario',    desc: 'Control de internados y camas en tiempo real' },
  { icon: ShieldCheck, label: 'Acceso inter-depto',    desc: 'Comparte expedientes entre áreas de forma segura' },
  { icon: BarChart3,   label: 'Analítica avanzada',    desc: 'Reportes por departamento, cohortes y adherencia' },
]

// ─── Plan required card ────────────────────────────────────────────────────────

function PlanRequiredCard() {
  const router = useRouter()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Aviso de plan */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 14,
        background: 'var(--mt-warning-subtle, #fffbeb)',
        border: '1px solid var(--mt-warning, #f59e0b)',
        borderRadius: 12, padding: '16px 20px',
      }}>
        <AlertTriangle size={18} color="var(--mt-warning, #f59e0b)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--mt-text)', margin: '0 0 4px' }}>
            El ambiente hospital requiere el plan Clínica Completa
          </p>
          <p style={{ fontSize: 13, color: 'var(--mt-text-2)', margin: 0, lineHeight: 1.5 }}>
            Tu plan actual no incluye esta función. Actualiza para desbloquear
            departamentos, roles especializados, censo hospitalario y más.
          </p>
        </div>
      </div>

      {/* Features */}
      <div style={{
        borderRadius: 14, border: '1px solid var(--mt-border)',
        background: 'var(--mt-surface)', overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--mt-border)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--mt-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px' }}>
            Incluido en Clínica Completa
          </p>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--mt-text)', margin: 0 }}>
            Ambiente hospital
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 0 }}>
          {HOSPITAL_FEATURES.map(({ icon: Icon, label, desc }) => (
            <div key={label} style={{
              padding: '18px 24px',
              borderRight: '1px solid var(--mt-border)',
              borderBottom: '1px solid var(--mt-border)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: 'var(--mt-primary-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 10,
              }}>
                <Icon size={16} color="var(--mt-primary)" />
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)', margin: '0 0 3px' }}>{label}</p>
              <p style={{ fontSize: 12, color: 'var(--mt-muted)', margin: 0, lineHeight: 1.4 }}>{desc}</p>
            </div>
          ))}
        </div>

        {/* Precio y CTA */}
        <div style={{
          padding: '20px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 16,
          background: 'linear-gradient(135deg, var(--mt-primary-subtle) 0%, #ede9fe 100%)',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--mt-text)' }}>Q1,200</span>
              <span style={{ fontSize: 13, color: 'var(--mt-text-2)' }}>/ mes</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--mt-muted)', margin: '2px 0 0' }}>
              Clínica Completa · hasta 12 usuarios · 2,500 pacientes
            </p>
          </div>
          <button
            onClick={() => router.push('/settings/billing')}
            style={{
              height: 44, padding: '0 24px', borderRadius: 10, border: 'none',
              background: 'var(--mt-primary)', color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            Ver planes y actualizar <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Activation card ───────────────────────────────────────────────────────────

function ActivationCard({ token, onUpgraded }: { token: string; onUpgraded: () => void | Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleUpgrade() {
    setLoading(true)
    setError('')
    try {
      await upgradeTenantToHospital(token)
      await onUpgraded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al activar')
      setConfirming(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--mt-primary-subtle) 0%, #ede9fe 100%)',
      border: '1px solid var(--mt-primary)',
      borderRadius: 14, overflow: 'hidden',
    }}>
      <div style={{ padding: '28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: 'var(--mt-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Building2 size={22} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--mt-text)', margin: '0 0 6px' }}>
              Activar ambiente hospital
            </h2>
            <p style={{ fontSize: 14, color: 'var(--mt-text-2)', margin: '0 0 20px', lineHeight: 1.6 }}>
              Tu plan incluye esta función. Al activarlo podrás crear departamentos,
              asignar roles especializados y gestionar el censo hospitalario.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 24 }}>
              {HOSPITAL_FEATURES.map(({ label }) => (
                <div key={label} style={{
                  background: 'rgba(255,255,255,.7)', borderRadius: 8,
                  padding: '7px 12px', fontSize: 12, color: 'var(--mt-text)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <CheckCircle2 size={13} color="var(--mt-primary)" /> {label}
                </div>
              ))}
            </div>

            {error && (
              <p style={{ fontSize: 13, color: 'var(--mt-danger)', marginBottom: 14 }}>{error}</p>
            )}

            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                style={{
                  height: 42, padding: '0 24px', borderRadius: 8, border: 'none',
                  background: 'var(--mt-primary)', color: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                <Building2 size={15} /> Activar ambiente hospital
              </button>
            ) : (
              <div style={{
                background: 'rgba(255,255,255,.85)', borderRadius: 10,
                border: '1px solid var(--mt-border)', padding: '16px 20px',
                display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 440,
              }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)', margin: 0 }}>
                  ¿Confirmar activación?
                </p>
                <p style={{ fontSize: 12, color: 'var(--mt-text-2)', margin: 0, lineHeight: 1.5 }}>
                  Este cambio es permanente. Tu cuenta pasará de modo clínica a modo hospital
                  y no se puede revertir desde la interfaz.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleUpgrade}
                    disabled={loading}
                    style={{
                      height: 36, padding: '0 18px', borderRadius: 7, border: 'none',
                      background: 'var(--mt-primary)', color: '#fff',
                      fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.7 : 1,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                    Sí, activar
                  </button>
                  <button
                    onClick={() => { setConfirming(false); setError('') }}
                    disabled={loading}
                    style={{
                      height: 36, padding: '0 16px', borderRadius: 7,
                      border: '1px solid var(--mt-border)', background: 'none',
                      fontSize: 13, color: 'var(--mt-muted)', cursor: 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Add member panel ──────────────────────────────────────────────────────────

function AddMemberPanel({
  token, dept, onAdded,
}: {
  token: string
  dept: Department
  onAdded: (member: StaffMember) => void
}) {
  const [open, setOpen] = useState(false)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)

  async function openPanel() {
    setOpen(true)
    setLoading(true)
    try {
      const data = await listStaff(token)
      const existingIds = new Set(dept.members.map((m) => m.user.id))
      setStaff(data.staff.filter((s) => s.is_active && !existingIds.has(s.id)))
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(userId: string) {
    setAdding(userId)
    try {
      await addMember(token, dept.id, userId)
      const member = staff.find((s) => s.id === userId)!
      onAdded(member)
      setStaff((prev) => prev.filter((s) => s.id !== userId))
    } finally {
      setAdding(null)
    }
  }

  if (!open) {
    return (
      <button
        onClick={openPanel}
        style={{
          marginTop: 8, height: 32, padding: '0 12px', borderRadius: 7,
          border: '1px dashed var(--mt-border)', background: 'transparent',
          color: 'var(--mt-primary)', fontSize: 12, fontWeight: 500,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <UserPlus size={13} /> Agregar miembro
      </button>
    )
  }

  return (
    <div style={{
      marginTop: 8, borderRadius: 8, border: '1px solid var(--mt-border)',
      background: 'var(--mt-elevated)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid var(--mt-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--mt-text)' }}>Agregar miembro</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mt-muted)', padding: 2 }}>
          <X size={13} />
        </button>
      </div>
      {loading ? (
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
          <Loader2 size={16} color="var(--mt-muted)" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : staff.length === 0 ? (
        <p style={{ padding: '12px', fontSize: 12, color: 'var(--mt-muted)', margin: 0, textAlign: 'center' }}>
          Todo el personal ya está en este departamento.
        </p>
      ) : (
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {staff.map((s) => (
            <div key={s.id} style={{
              padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: '1px solid var(--mt-border)',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: 'var(--mt-primary-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: 'var(--mt-primary)', flexShrink: 0,
              }}>
                {s.first_name[0]}{s.last_name[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--mt-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.first_name} {s.last_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--mt-muted)' }}>
                  {ROLE_LABELS[s.role] ?? s.role}{s.specialty ? ` · ${s.specialty}` : ''}
                </div>
              </div>
              <button
                onClick={() => handleAdd(s.id)}
                disabled={adding === s.id}
                style={{
                  height: 26, padding: '0 10px', borderRadius: 6, border: 'none',
                  background: 'var(--mt-primary)', color: '#fff',
                  fontSize: 11, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 4,
                  opacity: adding === s.id ? 0.6 : 1,
                }}
              >
                {adding === s.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={11} />}
                Agregar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Department card ────────────────────────────────────────────────────────────

function DepartmentCard({
  dept, token, locations,
  onUpdated, onDeleted,
}: {
  dept: Department; token: string; locations: Location[]
  onUpdated: (d: Department) => void
  onDeleted: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editName, setEditName] = useState(dept.name)
  const [editType, setEditType] = useState(dept.type)
  const [editLocationId, setEditLocationId] = useState(dept.location_id ?? '')

  async function handleSave() {
    setBusy(true)
    try {
      const updated = await updateDepartment(token, dept.id, {
        name: editName,
        type: editType,
        location_id: editLocationId || null,
      })
      onUpdated(updated)
      setEditing(false)
    } finally { setBusy(false) }
  }

  async function handleDelete() {
    if (!confirm(`¿Desactivar el departamento "${dept.name}"?`)) return
    setBusy(true)
    try { await deleteDepartment(token, dept.id); onDeleted(dept.id) } finally { setBusy(false) }
  }

  async function handleRemoveMember(userId: string) {
    setBusy(true)
    try {
      await removeMember(token, dept.id, userId)
      onUpdated({ ...dept, members: dept.members.filter(m => m.user.id !== userId) })
    } finally { setBusy(false) }
  }

  return (
    <div style={{
      background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      <div
        style={{
          padding: '14px 18px', display: 'flex', alignItems: 'center',
          gap: 12, cursor: 'pointer',
        }}
        onClick={() => !editing && setExpanded(v => !v)}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: 'var(--mt-primary-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Building2 size={16} color="var(--mt-primary)" />
        </div>

        {editing ? (
          <div style={{ flex: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              style={{
                flex: 1, minWidth: 120, height: 34, borderRadius: 7,
                border: '1px solid var(--mt-border)', padding: '0 10px',
                fontSize: 13, color: 'var(--mt-text)', background: 'var(--mt-bg)',
              }}
            />
            <select
              value={editType}
              onChange={e => setEditType(e.target.value)}
              style={{
                height: 34, borderRadius: 7, border: '1px solid var(--mt-border)',
                padding: '0 8px', fontSize: 12, color: 'var(--mt-text)', background: 'var(--mt-bg)',
              }}
            >
              {DEPT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {locations.length > 0 && (
              <select
                value={editLocationId}
                onChange={e => setEditLocationId(e.target.value)}
                style={{
                  height: 34, borderRadius: 7, border: '1px solid var(--mt-border)',
                  padding: '0 8px', fontSize: 12, color: 'var(--mt-text)', background: 'var(--mt-bg)',
                }}
              >
                <option value="">Sin sede</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            <button onClick={handleSave} disabled={busy} style={{ height: 34, padding: '0 12px', borderRadius: 7, border: 'none', background: 'var(--mt-primary)', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              {busy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : 'Guardar'}
            </button>
            <button onClick={() => setEditing(false)} style={{ height: 34, padding: '0 10px', borderRadius: 7, border: '1px solid var(--mt-border)', background: 'none', cursor: 'pointer', color: 'var(--mt-muted)' }}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--mt-text)' }}>{dept.name}</div>
            <div style={{ fontSize: 12, color: 'var(--mt-muted)', marginTop: 1 }}>
              {DEPARTMENT_TYPE_LABELS[dept.type] ?? dept.type} · {dept.members.length} miembro{dept.members.length !== 1 ? 's' : ''}
              {dept.location_id && locations.find(l => l.id === dept.location_id) && (
                <span> · <MapPin size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> {locations.find(l => l.id === dept.location_id)!.name}</span>
              )}
            </div>
          </div>
        )}

        {!editing && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={e => { e.stopPropagation(); setEditing(true) }}
              style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid var(--mt-border)', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mt-muted)' }}
            ><Pencil size={13} /></button>
            <button
              onClick={e => { e.stopPropagation(); handleDelete() }}
              disabled={busy}
              style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid var(--mt-border)', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mt-danger)' }}
            ><Trash2 size={13} /></button>
            <ChevronRight size={16} color="var(--mt-muted)" style={{ transition: 'transform .2s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }} />
          </div>
        )}
      </div>

      {expanded && !editing && (
        <div style={{ borderTop: '1px solid var(--mt-border)', padding: '12px 18px' }}>
          {dept.members.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--mt-muted)', margin: 0 }}>Sin miembros asignados todavía.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dept.members.map(m => (
                <div key={m.user.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', background: 'var(--mt-elevated)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: 'var(--mt-primary)', flexShrink: 0,
                  }}>
                    {m.user.first_name[0]}{m.user.last_name[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text)' }}>
                      {m.user.first_name} {m.user.last_name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--mt-muted)' }}>
                      {ROLE_LABELS[m.user.role] ?? m.user.role}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveMember(m.user.id)}
                    disabled={busy}
                    style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--mt-border)', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mt-muted)' }}
                  ><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
          <AddMemberPanel
            token={token}
            dept={dept}
            onAdded={(s) => onUpdated({
              ...dept,
              members: [...dept.members, { user: s, joined_at: new Date().toISOString() }],
            })}
          />
        </div>
      )}
    </div>
  )
}

// ─── New department form ────────────────────────────────────────────────────────

function NewDepartmentForm({
  token, locations, onCreated,
}: {
  token: string; locations: Location[]; onCreated: (d: Department) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('GENERAL')
  const [locationId, setLocationId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      const dept = await createDepartment(token, {
        name: name.trim(),
        type,
        location_id: locationId || undefined,
      })
      onCreated(dept)
      setName(''); setType('GENERAL'); setLocationId(''); setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear departamento')
    } finally { setLoading(false) }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          height: 42, padding: '0 18px', borderRadius: 9,
          border: '1.5px dashed var(--mt-border)',
          background: 'transparent', color: 'var(--mt-text-2)',
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          justifyContent: 'center',
        }}
      >
        <Plus size={15} /> Nuevo departamento
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
      borderRadius: 12, padding: '18px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)', margin: 0 }}>Nuevo departamento</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nombre del departamento"
          required
          style={{
            height: 38, borderRadius: 8, border: '1px solid var(--mt-border)',
            padding: '0 12px', fontSize: 13, color: 'var(--mt-text)', background: 'var(--mt-bg)',
          }}
        />
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          style={{
            height: 38, borderRadius: 8, border: '1px solid var(--mt-border)',
            padding: '0 10px', fontSize: 13, color: 'var(--mt-text)', background: 'var(--mt-bg)',
          }}
        >
          {DEPT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {locations.length > 0 && (
        <div>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-text-2)', display: 'block', marginBottom: 4 }}>
            <MapPin size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Sede
          </label>
          <select
            value={locationId}
            onChange={e => setLocationId(e.target.value)}
            style={{
              width: '100%', height: 38, borderRadius: 8, border: '1px solid var(--mt-border)',
              padding: '0 10px', fontSize: 13, color: 'var(--mt-text)', background: 'var(--mt-bg)',
            }}
          >
            <option value="">Sin sede</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}
      {error && <p style={{ fontSize: 12, color: 'var(--mt-danger)', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={loading} style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: 'var(--mt-primary)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
          {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
          Crear
        </button>
        <button type="button" onClick={() => setOpen(false)} style={{ height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid var(--mt-border)', background: 'none', fontSize: 13, color: 'var(--mt-muted)', cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function HospitalSettingsPage() {
  const { token, user, refreshUser } = useAuth()
  const [isHospital, setIsHospital] = useState(user?.tenant_type === 'HOSPITAL')
  const [depts, setDepts] = useState<Department[]>([])
  const [locs, setLocs] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)

  const isAdmin = hasPermission(user?.role, PERMISSIONS.HOSPITAL_MANAGE, user?.permissions)
  const plan = normalizeBillingPlan(user?.tenant_plan)
  const canActivate = plan === 'clinic_complete'

  const load = useCallback(async (forceHospital = false) => {
    if (!token) return
    setLoading(true)
    try {
      const locData = await listLocations(token).catch(() => [] as Location[])
      setLocs(locData)

      if (!forceHospital && user?.tenant_type !== 'HOSPITAL') {
        setDepts([])
        setIsHospital(false)
        return
      }

      const data = await listDepartments(token)
      setDepts(data)
      setIsHospital(true)
    } catch (e) {
      // 403 NOT_HOSPITAL means we're still a clinic
      if (e instanceof Error && e.message.includes('hospital')) setIsHospital(false)
    } finally { setLoading(false) }
  }, [token, user?.tenant_type])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <Loader2 size={22} color="var(--mt-muted)" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px)' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--mt-text)', margin: '0 0 4px' }}>
          Ambiente hospital
        </h1>
        <p style={{ fontSize: 14, color: 'var(--mt-text-2)', margin: 0 }}>
          Organiza tu institución en departamentos y asigna personal especializado.
        </p>
      </div>

      {!isHospital ? (
        !isAdmin ? (
          <div style={{
            background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
            borderRadius: 12, padding: '28px 24px', textAlign: 'center',
          }}>
            <Building2 size={32} color="var(--mt-muted)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, color: 'var(--mt-text-2)', margin: 0 }}>
              Tu institución aún no ha activado el ambiente hospital.
              Contacta al administrador para habilitarlo.
            </p>
          </div>
        ) : canActivate ? (
          <ActivationCard
            token={token!}
            onUpgraded={async () => { setIsHospital(true); await refreshUser().catch(() => {}); await load(true) }}
          />
        ) : (
          <PlanRequiredCard />
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={16} color="var(--mt-muted)" />
              <span style={{ fontSize: 13, color: 'var(--mt-text-2)' }}>
                {depts.filter(d => d.is_active).length} departamento{depts.filter(d => d.is_active).length !== 1 ? 's' : ''} activo{depts.filter(d => d.is_active).length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {depts.filter(d => d.is_active).map(dept => (
            <DepartmentCard
              key={dept.id}
              dept={dept}
              token={token!}
              locations={locs}
              onUpdated={updated => setDepts(prev => prev.map(d => d.id === updated.id ? updated : d))}
              onDeleted={id => setDepts(prev => prev.map(d => d.id === id ? { ...d, is_active: false } : d))}
            />
          ))}

          {isAdmin && (
            <NewDepartmentForm
              token={token!}
              locations={locs}
              onCreated={dept => setDepts(prev => [...prev, dept])}
            />
          )}
        </div>
      )}
    </div>
  )
}
