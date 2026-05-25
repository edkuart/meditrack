'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Users, UserPlus, Mail, Shield, ChevronDown, Loader2,
  CheckCircle2, AlertCircle, Clock, Trash2, Send, X, Save,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  listStaff, inviteStaff, promoteStaff, deactivateStaff,
  cancelInvitation, resendInvitation, listStaffRoles, createCustomRole,
  type StaffMember, type PendingInvitation, type StaffRole, type CustomRole,
} from '@/lib/doctor/staff-api'
import { listDepartments, type Department } from '@/lib/doctor/departments-api'
import {
  ClinicalButton, ClinicalHeader, ClinicalPage, LoadingState, MTPanel, MTPill,
} from '@/components/doctor/clinical-ui'
import { hasPermission, PERMISSIONS, ROLE_PERMISSIONS, type Permission } from '@/lib/doctor/permissions'

// ─── Role config ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<StaffRole, string> = {
  ADMIN_CLINIC:    'Administrador',
  DOCTOR:          'Médico',
  NURSE:           'Enfermero/a',
  ASSISTANT:       'Asistente',
  LAB_TECHNICIAN:  'Téc. Laboratorio',
  RADIOLOGIST:     'Radiólogo/a',
  PHARMACIST:      'Farmacéutico/a',
  RECEPTIONIST:    'Recepcionista',
  WARD_NURSE:      'Enf. de Sala',
}

const ROLE_TONE: Record<StaffRole, 'blue' | 'green' | 'amber' | 'slate'> = {
  ADMIN_CLINIC:   'blue',
  DOCTOR:         'green',
  NURSE:          'green',
  ASSISTANT:      'slate',
  LAB_TECHNICIAN: 'amber',
  RADIOLOGIST:    'amber',
  PHARMACIST:     'amber',
  RECEPTIONIST:   'slate',
  WARD_NURSE:     'slate',
}

const INVITEABLE_ROLES: StaffRole[] = [
  'DOCTOR', 'NURSE', 'ASSISTANT', 'LAB_TECHNICIAN',
  'RADIOLOGIST', 'PHARMACIST', 'RECEPTIONIST', 'WARD_NURSE', 'ADMIN_CLINIC',
]

const PERMISSION_LABELS: Partial<Record<Permission, string>> = {
  'patient.read': 'Ver pacientes',
  'patient.write': 'Crear/editar pacientes',
  'patient.sensitive.read': 'Ver historia clínica completa',
  'patient.background.write': 'Editar antecedentes',
  'patient.problem.write': 'Editar problemas clínicos',
  'patient.access.manage': 'Compartir acceso por departamento',
  'encounter.read': 'Ver consultas',
  'encounter.write': 'Crear/cerrar consultas',
  'vitals.read': 'Ver signos vitales',
  'vitals.write': 'Registrar signos vitales',
  'lab.order.read': 'Ver laboratorios',
  'lab.order.write': 'Crear órdenes de laboratorio',
  'lab.result.write': 'Ingresar resultados',
  'lab.external.review': 'Revisar laboratorios externos',
  'document.read': 'Ver documentos',
  'document.write': 'Subir documentos',
  'document.process': 'Procesar documentos',
  'document.visibility.write': 'Cambiar visibilidad de documentos',
  'document.delete': 'Eliminar documentos',
  'treatment.read': 'Ver tratamientos',
  'treatment.write': 'Editar tratamientos',
  'treatment.adherence.read': 'Ver adherencia',
  'hospital.census.read': 'Ver internados',
  'admission.write': 'Internar/dar de alta',
  'referral.read': 'Ver referencias',
  'referral.write': 'Crear referencias',
  'staff.manage': 'Administrar personal',
  'hospital.manage': 'Administrar hospital',
  'analytics.read': 'Ver analítica',
}

const PERMISSION_GROUPS: Array<{ label: string; permissions: Permission[] }> = [
  {
    label: 'Paciente',
    permissions: [
      PERMISSIONS.PATIENT_READ,
      PERMISSIONS.PATIENT_WRITE,
      PERMISSIONS.PATIENT_SENSITIVE_READ,
      PERMISSIONS.PATIENT_BACKGROUND_WRITE,
      PERMISSIONS.PATIENT_PROBLEM_WRITE,
      PERMISSIONS.PATIENT_ACCESS_MANAGE,
    ],
  },
  {
    label: 'Consulta',
    permissions: [
      PERMISSIONS.ENCOUNTER_READ,
      PERMISSIONS.ENCOUNTER_WRITE,
      PERMISSIONS.VITALS_READ,
      PERMISSIONS.VITALS_WRITE,
    ],
  },
  {
    label: 'Laboratorio',
    permissions: [
      PERMISSIONS.LAB_ORDER_READ,
      PERMISSIONS.LAB_ORDER_WRITE,
      PERMISSIONS.LAB_RESULT_WRITE,
      PERMISSIONS.LAB_EXTERNAL_REVIEW,
    ],
  },
  {
    label: 'Documentos',
    permissions: [
      PERMISSIONS.DOCUMENT_READ,
      PERMISSIONS.DOCUMENT_WRITE,
      PERMISSIONS.DOCUMENT_PROCESS,
      PERMISSIONS.DOCUMENT_VISIBILITY_WRITE,
      PERMISSIONS.DOCUMENT_DELETE,
    ],
  },
  {
    label: 'Tratamiento',
    permissions: [
      PERMISSIONS.TREATMENT_READ,
      PERMISSIONS.TREATMENT_WRITE,
      PERMISSIONS.TREATMENT_ADHERENCE_READ,
      PERMISSIONS.REFERRAL_READ,
      PERMISSIONS.REFERRAL_WRITE,
    ],
  },
  {
    label: 'Hospital',
    permissions: [
      PERMISSIONS.HOSPITAL_CENSUS_READ,
      PERMISSIONS.ADMISSION_WRITE,
      PERMISSIONS.STAFF_MANAGE,
      PERMISSIONS.HOSPITAL_MANAGE,
      PERMISSIONS.ANALYTICS_READ,
    ],
  },
]

const SENSITIVE_PERMISSIONS = new Set<Permission>([
  PERMISSIONS.PATIENT_SENSITIVE_READ,
  PERMISSIONS.PATIENT_BACKGROUND_WRITE,
  PERMISSIONS.PATIENT_PROBLEM_WRITE,
  PERMISSIONS.PATIENT_ACCESS_MANAGE,
  PERMISSIONS.ENCOUNTER_WRITE,
  PERMISSIONS.DOCUMENT_VISIBILITY_WRITE,
  PERMISSIONS.DOCUMENT_DELETE,
  PERMISSIONS.TREATMENT_WRITE,
  PERMISSIONS.ADMISSION_WRITE,
])

const ADMIN_ONLY_PERMISSIONS = new Set<Permission>([
  PERMISSIONS.STAFF_MANAGE,
  PERMISSIONS.HOSPITAL_MANAGE,
  PERMISSIONS.ANALYTICS_READ,
])

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
}

// ─── Inline role selector ─────────────────────────────────────────────────────

function RoleSelector({
  value, customRoleId, customRoles, onChange, disabled,
}: {
  value: StaffRole
  customRoleId?: string | null
  customRoles?: CustomRole[]
  onChange: (role: StaffRole, customRoleId?: string | null) => void
  disabled?: boolean
}) {
  const selectValue = customRoleId ? `custom:${customRoleId}` : `role:${value}`
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <select
        value={selectValue}
        onChange={e => {
          const next = e.target.value
          if (next.startsWith('custom:')) {
            const role = customRoles?.find(r => r.id === next.slice(7))
            if (role) onChange(role.base_role, role.id)
            return
          }
          onChange(next.slice(5) as StaffRole, null)
        }}
        disabled={disabled}
        style={{
          appearance: 'none', border: '1px solid var(--mt-border)',
          borderRadius: 6, padding: '4px 28px 4px 8px',
          fontSize: 12, color: 'var(--mt-text)', background: 'var(--mt-surface)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {INVITEABLE_ROLES.map(r => (
          <option key={r} value={`role:${r}`}>{ROLE_LABELS[r]}</option>
        ))}
        {(customRoles?.length ?? 0) > 0 && (
          <optgroup label="Roles personalizados">
            {customRoles?.map(r => (
              <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>
            ))}
          </optgroup>
        )}
      </select>
      <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--mt-muted)' }} />
    </div>
  )
}

function RolePermissionPreview({ role, customRole }: { role: StaffRole; customRole?: CustomRole | null }) {
  const permissions = customRole ? customRole.permissions as Permission[] : Array.from(ROLE_PERMISSIONS[role] ?? [])
  const title = customRole ? customRole.name : ROLE_LABELS[role]

  return (
    <div style={{
      marginTop: 14,
      border: '1px solid var(--mt-border)',
      borderRadius: 10,
      background: 'var(--mt-elevated)',
      padding: '12px 14px',
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mt-text)', marginBottom: 10 }}>
        Habilidades incluidas para {title}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {permissions.map(permission => (
          <span
            key={permission}
            style={{
              fontSize: 11,
              color: 'var(--mt-text-2)',
              border: '1px solid var(--mt-border)',
              background: 'var(--mt-surface)',
              borderRadius: 999,
              padding: '4px 8px',
            }}
          >
            {PERMISSION_LABELS[permission] ?? permission}
          </span>
        ))}
      </div>
    </div>
  )
}

function PermissionSkill({
  permission, checked, recommended, sensitive, locked, onToggle,
}: {
  permission: Permission
  checked: boolean
  recommended: boolean
  sensitive: boolean
  locked: boolean
  onToggle: () => void
}) {
  return (
    <label
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        gap: 9,
        alignItems: 'start',
        border: `1px solid ${checked ? 'var(--mt-primary-mist)' : 'var(--mt-border)'}`,
        borderRadius: 8,
        padding: '9px 10px',
        fontSize: 12,
        color: locked ? 'var(--mt-muted)' : 'var(--mt-text)',
        background: checked ? 'var(--mt-primary-subtle)' : 'var(--mt-surface)',
        opacity: locked ? 0.62 : 1,
        cursor: locked ? 'not-allowed' : 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={locked}
        onChange={onToggle}
        style={{ marginTop: 2 }}
      />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, lineHeight: 1.25 }}>
          {PERMISSION_LABELS[permission] ?? permission}
        </span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
          {recommended && (
            <span style={skillBadgeStyle('#2563eb', '#dbeafe', '#bfdbfe')}>Recomendado</span>
          )}
          {sensitive && (
            <span style={skillBadgeStyle('#b45309', '#fef3c7', '#fde68a')}>Sensible</span>
          )}
          {locked && (
            <span style={skillBadgeStyle('#64748b', '#f1f5f9', '#cbd5e1')}>Solo admin</span>
          )}
        </span>
      </span>
    </label>
  )
}

function skillBadgeStyle(color: string, background: string, border: string): React.CSSProperties {
  return {
    border: `1px solid ${border}`,
    background,
    color,
    borderRadius: 999,
    padding: '1px 7px',
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1.4,
  }
}

// ─── Staff row ────────────────────────────────────────────────────────────────

function StaffRow({
  member, currentUserId, isAdmin,
  customRoles, onPromote, onDeactivate,
}: {
  member: StaffMember
  currentUserId: string
  isAdmin: boolean
  customRoles: CustomRole[]
  onPromote: (id: string, role: StaffRole, customRoleId?: string | null) => Promise<void>
  onDeactivate: (id: string) => Promise<void>
}) {
  const [promoting, setPromoting] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const isSelf = member.id === currentUserId

  async function handleRoleChange(newRole: StaffRole, customRoleId?: string | null) {
    if (newRole === member.role && (customRoleId ?? null) === (member.custom_role_id ?? null)) return
    setPromoting(true)
    try { await onPromote(member.id, newRole, customRoleId ?? null) } finally { setPromoting(false) }
  }

  async function handleDeactivate() {
    if (!confirm(`¿Desactivar a ${member.first_name} ${member.last_name}? Perderá acceso al sistema.`)) return
    setDeactivating(true)
    try { await onDeactivate(member.id) } finally { setDeactivating(false) }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 20px', borderBottom: '1px solid var(--mt-border)',
      opacity: member.is_active ? 1 : 0.5,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: 'var(--mt-primary-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 600, color: 'var(--mt-primary)',
      }}>
        {member.first_name[0]}{member.last_name[0]}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--mt-text)' }}>
            {member.first_name} {member.last_name}
          </span>
          {isSelf && <MTPill tone="blue" style={{ fontSize: 10 }}>Tú</MTPill>}
          {!member.is_active && <MTPill tone="slate" style={{ fontSize: 10 }}>Inactivo</MTPill>}
          {!member.is_verified && <MTPill tone="amber" style={{ fontSize: 10 }}>Pendiente</MTPill>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--mt-muted)', marginTop: 1 }}>{member.email}</div>
      </div>

      <div style={{ flexShrink: 0 }}>
        {isAdmin && !isSelf && member.is_active && (member.role as string) !== 'SUPER_ADMIN' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {promoting ? (
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--mt-muted)' }} />
            ) : (
              <RoleSelector
                value={member.role as StaffRole}
                customRoleId={member.custom_role_id}
                customRoles={customRoles}
                onChange={handleRoleChange}
              />
            )}
          </div>
        ) : (
          <MTPill tone={ROLE_TONE[member.role as StaffRole] ?? 'slate'}>
            {member.custom_role?.name ?? ROLE_LABELS[member.role as StaffRole] ?? member.role}
          </MTPill>
        )}
      </div>

      {isAdmin && !isSelf && member.is_active && (
        <button
          onClick={handleDeactivate}
          disabled={deactivating}
          title="Desactivar acceso"
          style={{
            border: 'none', background: 'none', cursor: 'pointer',
            color: 'var(--mt-muted)', padding: 4, borderRadius: 4,
            display: 'flex', alignItems: 'center',
          }}
        >
          {deactivating
            ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
            : <Trash2 size={15} />
          }
        </button>
      )}
    </div>
  )
}

// ─── Pending invite row ───────────────────────────────────────────────────────

function PendingInviteRow({
  inv, token, isAdmin, onResent, onCancelled,
}: {
  inv: PendingInvitation
  token: string
  isAdmin: boolean
  onResent: () => void
  onCancelled: () => void
}) {
  const [busy, setBusy] = useState<'resend' | 'cancel' | null>(null)
  const days = daysUntil(inv.expires_at)

  async function handleResend() {
    setBusy('resend')
    try {
      await resendInvitation(token, inv.id)
      onResent()
    } finally { setBusy(null) }
  }

  async function handleCancel() {
    if (!confirm(`¿Cancelar la invitación para ${inv.email}?`)) return
    setBusy('cancel')
    try {
      await cancelInvitation(token, inv.id)
      onCancelled()
    } finally { setBusy(null) }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 20px', borderBottom: '1px solid var(--mt-border)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: 'var(--mt-warning-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Clock size={16} color="var(--mt-warning)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--mt-text)' }}>{inv.email}</div>
        <div style={{ fontSize: 12, color: 'var(--mt-muted)', marginTop: 1 }}>
          Expira en {days} día{days !== 1 ? 's' : ''}
        </div>
      </div>
      <MTPill tone={ROLE_TONE[inv.role] ?? 'slate'}>
        {inv.custom_role?.name ?? ROLE_LABELS[inv.role] ?? inv.role}
      </MTPill>
      {isAdmin && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={handleResend}
            disabled={busy !== null}
            title="Reenviar invitación"
            style={{
              height: 30, padding: '0 10px', borderRadius: 7,
              border: '1px solid var(--mt-border)', background: 'none',
              fontSize: 12, color: 'var(--mt-primary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              opacity: busy !== null ? 0.5 : 1,
            }}
          >
            {busy === 'resend' ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={12} />}
            Reenviar
          </button>
          <button
            onClick={handleCancel}
            disabled={busy !== null}
            title="Cancelar invitación"
            style={{
              width: 30, height: 30, borderRadius: 7,
              border: '1px solid var(--mt-border)', background: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--mt-danger)', opacity: busy !== null ? 0.5 : 1,
            }}
          >
            {busy === 'cancel' ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <X size={13} />}
          </button>
        </div>
      )}
    </div>
  )
}

function CustomRoleBuilder({
  token, customRoles, onCreated,
}: {
  token: string
  customRoles: CustomRole[]
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [baseRole, setBaseRole] = useState<StaffRole>('LAB_TECHNICIAN')
  const [permissions, setPermissions] = useState<string[]>(Array.from(ROLE_PERMISSIONS.LAB_TECHNICIAN))
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  function applyTemplate(role: StaffRole) {
    setBaseRole(role)
    setPermissions(Array.from(ROLE_PERMISSIONS[role] ?? []))
  }

  function isLocked(permission: Permission) {
    return baseRole !== 'ADMIN_CLINIC' && ADMIN_ONLY_PERMISSIONS.has(permission)
  }

  function togglePermission(permission: Permission) {
    if (isLocked(permission)) return
    setPermissions(current => (
      current.includes(permission)
        ? current.filter(p => p !== permission)
        : [...current, permission]
    ))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    const allowedPermissions = permissions.filter(permission => !isLocked(permission as Permission))
    try {
      await createCustomRole(token, {
        name,
        description: description || undefined,
        base_role: baseRole,
        permissions: allowedPermissions,
      })
      setFeedback({ ok: true, msg: 'Rol personalizado creado' })
      setName('')
      setDescription('')
      applyTemplate('LAB_TECHNICIAN')
      onCreated()
    } catch (err) {
      setFeedback({ ok: false, msg: err instanceof Error ? err.message : 'Error al crear rol' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <MTPanel title={`Roles personalizados (${customRoles.length})`} icon={Shield} accent="blue">
      <div style={{ padding: '16px 20px', borderBottom: open ? '1px solid var(--mt-border)' : 'none' }}>
        <ClinicalButton icon={UserPlus} variant="outline" onClick={() => setOpen(v => !v)}>
          Crear rol
        </ClinicalButton>
      </div>

      {open && (
        <form onSubmit={handleSubmit} style={{ padding: 20, borderBottom: '1px solid var(--mt-border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(160px, 220px)', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--mt-text-2)', display: 'block', marginBottom: 4 }}>Nombre del rol</label>
              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Laboratorio externo"
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid var(--mt-border)',
                  borderRadius: 8, fontSize: 14, color: 'var(--mt-text)', background: 'var(--mt-surface)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--mt-text-2)', display: 'block', marginBottom: 4 }}>Plantilla base</label>
              <div style={{ position: 'relative' }}>
                <select
                  value={baseRole}
                  onChange={e => applyTemplate(e.target.value as StaffRole)}
                  style={{
                    width: '100%', appearance: 'none', padding: '8px 28px 8px 12px',
                    border: '1px solid var(--mt-border)', borderRadius: 8,
                    fontSize: 14, color: 'var(--mt-text)', background: 'var(--mt-surface)',
                  }}
                >
                  {INVITEABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--mt-muted)' }} />
              </div>
            </div>
          </div>
          <label style={{ fontSize: 12, color: 'var(--mt-text-2)', display: 'block', margin: '12px 0 4px' }}>Descripción</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Acceso limitado para crear y revisar resultados de laboratorio"
            style={{
              width: '100%', padding: '8px 12px', border: '1px solid var(--mt-border)',
              borderRadius: 8, fontSize: 14, color: 'var(--mt-text)', background: 'var(--mt-surface)',
              boxSizing: 'border-box',
            }}
          />

          <div style={{
            marginTop: 14,
            border: '1px solid var(--mt-border)',
            borderRadius: 10,
            overflow: 'hidden',
            background: 'var(--mt-surface)',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              padding: '10px 12px',
              borderBottom: '1px solid var(--mt-border)',
              background: 'var(--mt-elevated)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mt-text)' }}>
                Matriz de habilidades
              </div>
              <div style={{ fontSize: 12, color: 'var(--mt-muted)' }}>
                {permissions.filter(permission => !isLocked(permission as Permission)).length} habilitadas
              </div>
            </div>
            <div style={{ display: 'grid', gap: 0 }}>
              {PERMISSION_GROUPS.map(group => (
                <div key={group.label} style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr)',
                  gap: 10,
                  padding: 12,
                  borderBottom: '1px solid var(--mt-border)',
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mt-text)' }}>{group.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--mt-muted)', marginTop: 4 }}>
                      {group.permissions.filter(permission => permissions.includes(permission)).length} de {group.permissions.length}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
                    {group.permissions.map(permission => {
                      const recommended = ROLE_PERMISSIONS[baseRole]?.has(permission) ?? false
                      const locked = isLocked(permission)
                      return (
                        <PermissionSkill
                          key={permission}
                          permission={permission}
                          checked={permissions.includes(permission) && !locked}
                          recommended={recommended}
                          sensitive={SENSITIVE_PERMISSIONS.has(permission)}
                          locked={locked}
                          onToggle={() => togglePermission(permission)}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {feedback && (
            <div style={{
              marginTop: 12, display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 13, color: feedback.ok ? 'var(--mt-success)' : 'var(--mt-danger)',
            }}>
              {feedback.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {feedback.msg}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <ClinicalButton type="submit" icon={Save} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar rol'}
            </ClinicalButton>
          </div>
        </form>
      )}

      {customRoles.length > 0 && (
        <div style={{ padding: '12px 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {customRoles.map(role => (
            <MTPill key={role.id} tone="slate">
              {role.name} · {role.permissions.length} habilidades
            </MTPill>
          ))}
        </div>
      )}
    </MTPanel>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StaffSettingsPage() {
  const { token, user } = useAuth()
  const isAdmin = hasPermission(user?.role, PERMISSIONS.STAFF_MANAGE, user?.permissions)

  const [staff, setStaff] = useState<StaffMember[]>([])
  const [pending, setPending] = useState<PendingInvitation[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([])
  const [loading, setLoading] = useState(true)

  // Invite form
  const [showInvite, setShowInvite] = useState(false)
  const [invEmail, setInvEmail] = useState('')
  const [invRole, setInvRole] = useState<StaffRole>('DOCTOR')
  const [invCustomRoleId, setInvCustomRoleId] = useState<string | null>(null)
  const [invDept, setInvDept] = useState('')
  const [inviting, setInviting] = useState(false)
  const [invFeedback, setInvFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    const [staffData, deptData, roleData] = await Promise.all([
      listStaff(token).catch(() => ({ staff: [], pending_invitations: [] })),
      listDepartments(token).catch(() => []),
      listStaffRoles(token).catch(() => ({ system_roles: [], custom_roles: [] })),
    ])
    setStaff(staffData.staff)
    setPending(staffData.pending_invitations)
    setDepartments(deptData)
    setCustomRoles(roleData.custom_roles)
    setLoading(false)
  }, [token])

  useEffect(() => { void load() }, [load])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setInviting(true)
    setInvFeedback(null)
    try {
      await inviteStaff(token, {
        email: invEmail,
        role: invRole,
        custom_role_id: invCustomRoleId ?? undefined,
        department_id: invDept || undefined,
      })
      setInvFeedback({ ok: true, msg: `Invitación enviada a ${invEmail}` })
      setInvEmail('')
      setInvCustomRoleId(null)
      setInvDept('')
      void load()
    } catch (err) {
      setInvFeedback({ ok: false, msg: err instanceof Error ? err.message : 'Error al enviar invitación' })
    } finally {
      setInviting(false)
    }
  }

  async function handlePromote(userId: string, role: StaffRole, customRoleId?: string | null) {
    if (!token) return
    const result = await promoteStaff(token, userId, role, customRoleId)
    setStaff(s => s.map(m => m.id === userId ? {
      ...m,
      role: result.role,
      custom_role_id: result.custom_role_id,
      custom_role: result.custom_role,
    } : m))
  }

  async function handleDeactivate(userId: string) {
    if (!token) return
    await deactivateStaff(token, userId)
    setStaff(s => s.map(m => m.id === userId ? { ...m, is_active: false } : m))
  }

  const activeStaff = staff.filter(m => m.is_active)
  const inactiveStaff = staff.filter(m => !m.is_active)
  const selectedCustomRole = invCustomRoleId ? customRoles.find(r => r.id === invCustomRoleId) ?? null : null

  return (
    <ClinicalPage>
      <ClinicalHeader
        eyebrow="Configuración"
        title="Gestión de personal"
        subtitle="Invita a tu equipo, asigna roles y gestiona el acceso al sistema."
        actions={
          isAdmin ? (
            <ClinicalButton icon={UserPlus} onClick={() => setShowInvite(v => !v)}>
              Invitar miembro
            </ClinicalButton>
          ) : undefined
        }
      />

      {/* Invite form */}
      {showInvite && isAdmin && (
        <div style={{
          background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
          borderRadius: 12, padding: 20, marginBottom: 4,
          boxShadow: 'var(--mt-shadow-sm)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--mt-text)' }}>Nueva invitación</span>
            <button onClick={() => { setShowInvite(false); setInvFeedback(null) }}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--mt-muted)' }}>
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleInvite}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--mt-text-2)', display: 'block', marginBottom: 4 }}>
                  Correo electrónico *
                </label>
                <input
                  type="email" required value={invEmail}
                  onChange={e => setInvEmail(e.target.value)}
                  placeholder="doctor@clinica.com"
                  style={{
                    width: '100%', padding: '8px 12px', border: '1px solid var(--mt-border)',
                    borderRadius: 8, fontSize: 14, color: 'var(--mt-text)', background: 'var(--mt-surface)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--mt-text-2)', display: 'block', marginBottom: 4 }}>
                  Rol
                </label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={invCustomRoleId ? `custom:${invCustomRoleId}` : `role:${invRole}`}
                    onChange={e => {
                      const next = e.target.value
                      if (next.startsWith('custom:')) {
                        const role = customRoles.find(r => r.id === next.slice(7))
                        if (role) {
                          setInvRole(role.base_role)
                          setInvCustomRoleId(role.id)
                        }
                        return
                      }
                      setInvRole(next.slice(5) as StaffRole)
                      setInvCustomRoleId(null)
                    }}
                    style={{
                      appearance: 'none', padding: '8px 28px 8px 12px',
                      border: '1px solid var(--mt-border)', borderRadius: 8,
                      fontSize: 14, color: 'var(--mt-text)', background: 'var(--mt-surface)', cursor: 'pointer',
                    }}>
                    {INVITEABLE_ROLES.map(r => <option key={r} value={`role:${r}`}>{ROLE_LABELS[r]}</option>)}
                    {customRoles.length > 0 && (
                      <optgroup label="Roles personalizados">
                        {customRoles.map(r => <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--mt-muted)' }} />
                </div>
              </div>
              {departments.length > 0 && (
                <div>
                  <label style={{ fontSize: 12, color: 'var(--mt-text-2)', display: 'block', marginBottom: 4 }}>
                    Departamento (opc.)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select value={invDept} onChange={e => setInvDept(e.target.value)}
                      style={{
                        appearance: 'none', padding: '8px 28px 8px 12px',
                        border: '1px solid var(--mt-border)', borderRadius: 8,
                        fontSize: 14, color: 'var(--mt-text)', background: 'var(--mt-surface)', cursor: 'pointer',
                      }}>
                      <option value="">Sin asignar</option>
                      {departments.filter(d => d.is_active).map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--mt-muted)' }} />
                  </div>
                </div>
              )}
            </div>

            <RolePermissionPreview role={invRole} customRole={selectedCustomRole} />

            {invFeedback && (
              <div style={{
                marginTop: 12, display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 13, color: invFeedback.ok ? 'var(--mt-success)' : 'var(--mt-danger)',
              }}>
                {invFeedback.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {invFeedback.msg}
              </div>
            )}

            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <ClinicalButton type="submit" icon={Send} disabled={inviting}>
                {inviting ? 'Enviando…' : 'Enviar invitación'}
              </ClinicalButton>
            </div>
          </form>
        </div>
      )}

      {loading ? <LoadingState /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isAdmin && token && (
            <CustomRoleBuilder
              token={token}
              customRoles={customRoles}
              onCreated={() => void load()}
            />
          )}

          {/* Active staff */}
          <MTPanel
            title={`Personal activo (${activeStaff.length})`}
            icon={Users}
            accent="blue"
          >
            {activeStaff.length > 0 ? (
              activeStaff.map(m => (
                <StaffRow
                  key={m.id}
                  member={m}
                  currentUserId={user?.id ?? ''}
                  isAdmin={isAdmin}
                  customRoles={customRoles}
                  onPromote={handlePromote}
                  onDeactivate={handleDeactivate}
                />
              ))
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--mt-muted)', fontSize: 13 }}>
                No hay personal activo
              </div>
            )}
          </MTPanel>

          {/* Pending invitations */}
          {pending.length > 0 && (
            <MTPanel
              title={`Invitaciones pendientes (${pending.length})`}
              icon={Mail}
              accent="amber"
            >
              {pending.map(inv => (
                <PendingInviteRow
                  key={inv.id}
                  inv={inv}
                  token={token!}
                  isAdmin={isAdmin}
                  onResent={() => void load()}
                  onCancelled={() => setPending(p => p.filter(i => i.id !== inv.id))}
                />
              ))}
            </MTPanel>
          )}

          {/* Inactive staff */}
          {inactiveStaff.length > 0 && (
            <MTPanel
              title={`Personal inactivo (${inactiveStaff.length})`}
              icon={Shield}
              accent="slate"
              collapsible
              defaultOpen={false}
            >
              {inactiveStaff.map(m => (
                <StaffRow
                  key={m.id}
                  member={m}
                  currentUserId={user?.id ?? ''}
                  isAdmin={false}
                  customRoles={[]}
                  onPromote={async () => {}}
                  onDeactivate={async () => {}}
                />
              ))}
            </MTPanel>
          )}
        </div>
      )}
    </ClinicalPage>
  )
}
