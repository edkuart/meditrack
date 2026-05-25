'use client'

import { useEffect, useState, useCallback } from 'react'
import { Building2, Plus, Users, Trash2, Loader2, ChevronRight, X, Pencil, MapPin, UserPlus } from 'lucide-react'
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

const DEPT_TYPES = Object.entries(DEPARTMENT_TYPE_LABELS)

// ─── Upgrade banner ────────────────────────────────────────────────────────────

function UpgradeBanner({ token, onUpgraded }: { token: string; onUpgraded: () => void | Promise<void> }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleUpgrade() {
    if (!confirm('¿Confirmas convertir tu cuenta en un hospital? Esto habilitará departamentos, nuevos roles y funciones hospitalarias.')) return
    setLoading(true)
    try {
      await upgradeTenantToHospital(token)
      await onUpgraded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--mt-primary-subtle) 0%, #ede9fe 100%)',
      border: '1px solid var(--mt-primary)',
      borderRadius: 14, padding: '28px 32px',
    }}>
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
            Tu cuenta está configurada como clínica. Al activar el ambiente hospital podrás crear departamentos
            (Laboratorio, Radiología, Farmacia…), asignar roles especializados y compartir expedientes entre áreas.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
            {['Departamentos ilimitados', 'Roles especializados', 'Acceso inter-departamental', 'Red de doctores'].map(f => (
              <div key={f} style={{
                background: 'rgba(255,255,255,.7)', borderRadius: 8,
                padding: '8px 12px', fontSize: 12, color: 'var(--mt-text)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ color: 'var(--mt-primary)', fontSize: 14 }}>✓</span> {f}
              </div>
            ))}
          </div>
          {error && <p style={{ fontSize: 13, color: 'var(--mt-danger)', marginBottom: 12 }}>{error}</p>}
          <button
            onClick={handleUpgrade}
            disabled={loading}
            style={{
              height: 42, padding: '0 24px', borderRadius: 8, border: 'none',
              background: 'var(--mt-primary)', color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.75 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            {loading ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Activando...</> : <><Building2 size={15} /> Activar ambiente hospital</>}
          </button>
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
        isAdmin
          ? <UpgradeBanner token={token!} onUpgraded={async () => { setIsHospital(true); await refreshUser().catch(() => {}); await load(true) }} />
          : (
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
