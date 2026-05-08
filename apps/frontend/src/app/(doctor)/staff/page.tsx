'use client'

import { useEffect, useState, useCallback } from 'react'
import { UserPlus, Trash2, Loader2, Clock, CheckCircle, Users } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  listStaff, inviteStaff, deactivateStaff,
  type StaffMember, type PendingInvitation, type StaffRole,
} from '@/lib/doctor/api'

const ROLE_LABELS: Record<StaffRole, string> = {
  ADMIN_CLINIC: 'Admin',
  DOCTOR: 'Médico',
  NURSE: 'Enfermero/a',
  ASSISTANT: 'Asistente',
}

const ROLE_COLORS: Record<StaffRole, string> = {
  ADMIN_CLINIC: 'bg-purple-100 text-purple-700',
  DOCTOR: 'bg-blue-100 text-blue-700',
  NURSE: 'bg-green-100 text-green-700',
  ASSISTANT: 'bg-slate-100 text-slate-600',
}

export default function StaffPage() {
  const { token, user } = useAuth()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [pending, setPending] = useState<PendingInvitation[]>([])
  const [loading, setLoading] = useState(true)

  // Invite form
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<StaffRole>('DOCTOR')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  const isAdmin = user?.role === 'ADMIN_CLINIC' || user?.role === 'SUPER_ADMIN'

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await listStaff(token)
      setStaff(data.staff)
      setPending(data.pending_invitations)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setInviting(true)
    setInviteError('')
    setInviteSuccess('')
    try {
      await inviteStaff(token, inviteEmail, inviteRole)
      setInviteSuccess(`Invitación enviada a ${inviteEmail}`)
      setInviteEmail('')
      load()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Error al enviar la invitación')
    } finally {
      setInviting(false)
    }
  }

  async function handleDeactivate(member: StaffMember) {
    if (!token || !confirm(`¿Desactivar a ${member.first_name} ${member.last_name}?`)) return
    try {
      await deactivateStaff(token, member.id)
      setStaff(prev => prev.filter(s => s.id !== member.id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al desactivar')
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-800">Equipo</h1>
          <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
            {staff.length}
          </span>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setShowInvite(v => !v); setInviteError(''); setInviteSuccess('') }}
            className="flex items-center gap-1.5 bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            <UserPlus size={15} />
            Invitar
          </button>
        )}
      </div>

      {/* Invite form */}
      {isAdmin && showInvite && (
        <form onSubmit={handleInvite} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5 flex flex-col gap-4">
          <h2 className="font-semibold text-slate-800">Invitar nuevo miembro</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
              <label className="text-xs font-medium text-slate-500">Correo electrónico *</label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="doctor@ejemplo.com"
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Rol</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as StaffRole)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="DOCTOR">Médico</option>
                <option value="NURSE">Enfermero/a</option>
                <option value="ASSISTANT">Asistente</option>
                <option value="ADMIN_CLINIC">Admin</option>
              </select>
            </div>
          </div>

          {inviteError && <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{inviteError}</p>}
          {inviteSuccess && <p className="text-green-600 text-sm bg-green-50 rounded-lg px-3 py-2">{inviteSuccess}</p>}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowInvite(false)}
              className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2">
              Cancelar
            </button>
            <button type="submit" disabled={inviting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium disabled:opacity-60 hover:bg-blue-600 transition-colors">
              {inviting ? <><Loader2 size={14} className="animate-spin" /> Enviando...</> : 'Enviar invitación'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Active staff */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <Users size={15} className="text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-700">Miembros activos</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {staff.map(member => (
                <div key={member.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-semibold text-sm shrink-0">
                    {member.first_name[0]}{member.last_name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">
                        {member.first_name} {member.last_name}
                        {user?.id === member.id && <span className="text-xs text-slate-400 ml-1">(tú)</span>}
                      </p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${ROLE_COLORS[member.role]}`}>
                        {ROLE_LABELS[member.role]}
                      </span>
                      {!member.is_verified && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md">Sin verificar</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {member.email}
                      {member.specialty && ` · ${member.specialty}`}
                    </p>
                  </div>
                  {isAdmin && user?.id !== member.id && (
                    <button
                      onClick={() => handleDeactivate(member)}
                      className="text-slate-300 hover:text-red-500 transition-colors p-1"
                      title="Desactivar"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Pending invitations */}
          {pending.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <Clock size={15} className="text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-700">Invitaciones pendientes</h2>
              </div>
              <div className="divide-y divide-slate-50">
                {pending.map(inv => (
                  <div key={inv.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                    <div className="flex-1">
                      <p className="text-slate-600">{inv.email}</p>
                      <p className="text-xs text-slate-400">
                        {ROLE_LABELS[inv.role]} · Expira{' '}
                        {new Date(inv.expires_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pendiente</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {staff.length === 0 && pending.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Users size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay miembros en el equipo todavía</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
