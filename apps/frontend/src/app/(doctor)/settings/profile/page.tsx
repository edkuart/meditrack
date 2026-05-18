'use client'

import { useState, useEffect } from 'react'
import { UserCircle, Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  ClinicalButton, ClinicalHeader, ClinicalPage, MTPanel,
} from '@/components/doctor/clinical-ui'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

async function patchMe(token: string, data: Record<string, string>) {
  const res = await fetch(`${API}/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Error al guardar cambios')
  return json.data
}

async function changePassword(token: string, currentPassword: string, newPassword: string) {
  // Re-login with current password to verify, then use forgot-password flow is not ideal.
  // Instead we call PATCH /auth/me with a dedicated password_change flow — but since our
  // backend updateProfile doesn't handle password, we do it via reset-password token flow.
  // Simpler: expose a dedicated endpoint. For now we'll skip the current-password check
  // and directly patch — the session is authenticated so we trust the user.
  const res = await fetch(`${API}/auth/me/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Error al cambiar contraseña')
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 100,
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 16px', borderRadius: 10,
      background: ok ? '#f0fdf4' : '#fef2f2',
      border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
      boxShadow: '0 4px 16px rgba(0,0,0,.1)', fontSize: 13,
      color: ok ? '#166534' : '#991b1b',
    }}>
      {ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
      {msg}
    </div>
  )
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, type = 'text', placeholder, disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--mt-text-2)' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          border: '1px solid var(--mt-border)', borderRadius: 8,
          padding: '8px 12px', fontSize: 13, color: disabled ? 'var(--mt-muted)' : 'var(--mt-text)',
          background: disabled ? 'var(--mt-elevated)' : 'var(--mt-surface)',
          outline: 'none', cursor: disabled ? 'not-allowed' : 'text',
        }}
      />
    </div>
  )
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN_CLINIC:    'Administrador de clínica',
  DOCTOR:          'Médico',
  NURSE:           'Enfermero/a',
  ASSISTANT:       'Asistente',
  LAB_TECHNICIAN:  'Técnico de Laboratorio',
  RADIOLOGIST:     'Radiólogo/a',
  PHARMACIST:      'Farmacéutico/a',
  RECEPTIONIST:    'Recepcionista',
  WARD_NURSE:      'Enfermero/a de Sala',
  SUPER_ADMIN:     'Super Admin',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfileSettingsPage() {
  const { user, token, refreshUser } = useAuth()

  const [firstName, setFirstName]     = useState('')
  const [lastName, setLastName]       = useState('')
  const [specialty, setSpecialty]     = useState('')
  const [professionalId, setProfId]   = useState('')

  const [saving, setSaving]           = useState(false)
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null)

  const [showPw, setShowPw]           = useState(false)
  const [currentPw, setCurrentPw]     = useState('')
  const [newPw, setNewPw]             = useState('')
  const [confirmPw, setConfirmPw]     = useState('')
  const [changingPw, setChangingPw]   = useState(false)

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name ?? '')
      setLastName(user.last_name ?? '')
      setSpecialty(user.specialty ?? '')
      setProfId(user.professional_id ?? '')
    }
  }, [user])

  const toast$ = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  async function handleSaveProfile() {
    if (!token) return
    setSaving(true)
    try {
      const data: Record<string, string> = {}
      if (firstName.trim()) data.first_name = firstName.trim()
      if (lastName.trim())  data.last_name  = lastName.trim()
      if (specialty)        data.specialty  = specialty
      if (professionalId)   data.professional_id = professionalId
      await patchMe(token, data)
      await refreshUser()
      toast$('Perfil actualizado')
    } catch (e) {
      toast$(e instanceof Error ? e.message : 'Error', false)
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    if (!token) return
    if (newPw !== confirmPw) { toast$('Las contraseñas no coinciden', false); return }
    if (newPw.length < 8)    { toast$('Mínimo 8 caracteres', false); return }
    setChangingPw(true)
    try {
      await changePassword(token, currentPw, newPw)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
      toast$('Contraseña actualizada. Las demás sesiones han sido cerradas.')
    } catch (e) {
      toast$(e instanceof Error ? e.message : 'Error al cambiar contraseña', false)
    } finally {
      setChangingPw(false)
    }
  }

  return (
    <ClinicalPage>
      {toast && <Toast {...toast} />}

      <ClinicalHeader
        title="Mi perfil"
        subtitle="Datos personales y credenciales de tu cuenta"
        icon={UserCircle}
      />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Account info (read-only) */}
        <MTPanel title="Información de cuenta" icon={UserCircle} accent="blue">
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Correo electrónico" value={user?.email ?? ''} onChange={() => {}} disabled />
              <Field label="Rol" value={ROLE_LABELS[user?.role ?? ''] ?? user?.role ?? ''} onChange={() => {}} disabled />
            </div>
            {user?.colegiado_number && (
              <Field
                label="Número de colegiado"
                value={user.colegiado_number}
                onChange={() => {}}
                disabled
              />
            )}
          </div>
        </MTPanel>

        {/* Editable profile */}
        <MTPanel title="Datos personales" icon={UserCircle} accent="blue">
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Nombre" value={firstName} onChange={setFirstName} placeholder="Tu nombre" />
              <Field label="Apellido" value={lastName} onChange={setLastName} placeholder="Tu apellido" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Especialidad" value={specialty} onChange={setSpecialty} placeholder="Ej. Medicina Interna" />
              <Field label="No. de cédula profesional" value={professionalId} onChange={setProfId} placeholder="Ej. C-12345" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <ClinicalButton variant="solid" size="sm" onClick={handleSaveProfile} disabled={saving}>
                {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                Guardar cambios
              </ClinicalButton>
            </div>
          </div>
        </MTPanel>

        {/* Password change */}
        <MTPanel title="Cambiar contraseña" icon={Lock} accent="slate">
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--mt-text-2)' }}>Contraseña actual</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{
                    width: '100%', border: '1px solid var(--mt-border)', borderRadius: 8,
                    padding: '8px 38px 8px 12px', fontSize: 13, color: 'var(--mt-text)',
                    background: 'var(--mt-surface)', outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mt-muted)',
                    display: 'flex', padding: 0,
                  }}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Nueva contraseña" value={newPw} onChange={setNewPw} type={showPw ? 'text' : 'password'} placeholder="Mín. 8 caracteres" />
              <Field label="Confirmar contraseña" value={confirmPw} onChange={setConfirmPw} type={showPw ? 'text' : 'password'} placeholder="Repite la nueva contraseña" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <ClinicalButton
                variant="solid" size="sm"
                onClick={handleChangePassword}
                disabled={changingPw || !currentPw || !newPw || !confirmPw}
              >
                {changingPw ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                Cambiar contraseña
              </ClinicalButton>
            </div>
          </div>
        </MTPanel>

      </div>
    </ClinicalPage>
  )
}
