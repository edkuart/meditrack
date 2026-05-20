'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Users, UserPlus, Mail, Shield, ChevronDown, Loader2,
  CheckCircle2, AlertCircle, Clock, Trash2, Send, X,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  listStaff, inviteStaff, promoteStaff, deactivateStaff,
  cancelInvitation, resendInvitation,
  type StaffMember, type PendingInvitation, type StaffRole,
} from '@/lib/doctor/staff-api'
import { listDepartments, type Department } from '@/lib/doctor/departments-api'
import {
  ClinicalButton, ClinicalHeader, ClinicalPage, LoadingState, MTPanel, MTPill,
} from '@/components/doctor/clinical-ui'

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

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
}

// ─── Inline role selector ─────────────────────────────────────────────────────

function RoleSelector({
  value, onChange, disabled,
}: { value: StaffRole; onChange: (r: StaffRole) => void; disabled?: boolean }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value as StaffRole)}
        disabled={disabled}
        style={{
          appearance: 'none', border: '1px solid var(--mt-border)',
          borderRadius: 6, padding: '4px 28px 4px 8px',
          fontSize: 12, color: 'var(--mt-text)', background: 'var(--mt-surface)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {INVITEABLE_ROLES.map(r => (
          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
        ))}
      </select>
      <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--mt-muted)' }} />
    </div>
  )
}

// ─── Staff row ────────────────────────────────────────────────────────────────

function StaffRow({
  member, currentUserId, isAdmin,
  onPromote, onDeactivate,
}: {
  member: StaffMember
  currentUserId: string
  isAdmin: boolean
  onPromote: (id: string, role: StaffRole) => Promise<void>
  onDeactivate: (id: string) => Promise<void>
}) {
  const [promoting, setPromoting] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const isSelf = member.id === currentUserId

  async function handleRoleChange(newRole: StaffRole) {
    if (newRole === member.role) return
    setPromoting(true)
    try { await onPromote(member.id, newRole) } finally { setPromoting(false) }
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
              <RoleSelector value={member.role as StaffRole} onChange={handleRoleChange} />
            )}
          </div>
        ) : (
          <MTPill tone={ROLE_TONE[member.role as StaffRole] ?? 'slate'}>
            {ROLE_LABELS[member.role as StaffRole] ?? member.role}
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
        {ROLE_LABELS[inv.role] ?? inv.role}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StaffSettingsPage() {
  const { token, user } = useAuth()
  const isAdmin = user?.role === 'ADMIN_CLINIC' || user?.role === 'SUPER_ADMIN'

  const [staff, setStaff] = useState<StaffMember[]>([])
  const [pending, setPending] = useState<PendingInvitation[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)

  // Invite form
  const [showInvite, setShowInvite] = useState(false)
  const [invEmail, setInvEmail] = useState('')
  const [invRole, setInvRole] = useState<StaffRole>('DOCTOR')
  const [invDept, setInvDept] = useState('')
  const [inviting, setInviting] = useState(false)
  const [invFeedback, setInvFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    const [staffData, deptData] = await Promise.all([
      listStaff(token).catch(() => ({ staff: [], pending_invitations: [] })),
      listDepartments(token).catch(() => []),
    ])
    setStaff(staffData.staff)
    setPending(staffData.pending_invitations)
    setDepartments(deptData)
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
        department_id: invDept || undefined,
      })
      setInvFeedback({ ok: true, msg: `Invitación enviada a ${invEmail}` })
      setInvEmail('')
      setInvDept('')
      void load()
    } catch (err) {
      setInvFeedback({ ok: false, msg: err instanceof Error ? err.message : 'Error al enviar invitación' })
    } finally {
      setInviting(false)
    }
  }

  async function handlePromote(userId: string, role: StaffRole) {
    if (!token) return
    await promoteStaff(token, userId, role)
    setStaff(s => s.map(m => m.id === userId ? { ...m, role } : m))
  }

  async function handleDeactivate(userId: string) {
    if (!token) return
    await deactivateStaff(token, userId)
    setStaff(s => s.map(m => m.id === userId ? { ...m, is_active: false } : m))
  }

  const activeStaff = staff.filter(m => m.is_active)
  const inactiveStaff = staff.filter(m => !m.is_active)

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
                  <select value={invRole} onChange={e => setInvRole(e.target.value as StaffRole)}
                    style={{
                      appearance: 'none', padding: '8px 28px 8px 12px',
                      border: '1px solid var(--mt-border)', borderRadius: 8,
                      fontSize: 14, color: 'var(--mt-text)', background: 'var(--mt-surface)', cursor: 'pointer',
                    }}>
                    {INVITEABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
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
