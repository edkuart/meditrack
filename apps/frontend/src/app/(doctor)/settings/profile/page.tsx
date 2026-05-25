'use client'

import { useState, useEffect } from 'react'
import { UserCircle, Lock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
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

async function requestPasswordHelp(token: string, message: string) {
  const res = await fetch(`${API}/auth/me/password-help`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: message.trim() || undefined }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Error al enviar solicitud')
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

  const [passwordMessage, setPasswordMessage] = useState('')
  const [requestingPw, setRequestingPw] = useState(false)

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

  async function handlePasswordHelp() {
    if (!token) return
    setRequestingPw(true)
    try {
      await requestPasswordHelp(token, passwordMessage)
      setPasswordMessage('')
      toast$('Solicitud enviada al administrador de Meditrack')
    } catch (e) {
      toast$(e instanceof Error ? e.message : 'Error al enviar solicitud', false)
    } finally {
      setRequestingPw(false)
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

        {/* Password help */}
        <MTPanel title="Contraseña" icon={Lock} accent="slate">
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              border: '1px solid var(--mt-border)', borderRadius: 8,
              background: 'var(--mt-elevated)', padding: '12px 14px',
              color: 'var(--mt-text-2)', fontSize: 13, lineHeight: 1.5,
            }}>
              Por seguridad, los cambios de contraseña los revisa el administrador de Meditrack. Tu solicitud no se envía al administrador médico del hospital.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--mt-text-2)' }}>Mensaje para soporte</label>
              <textarea
                value={passwordMessage}
                onChange={e => setPasswordMessage(e.target.value)}
                placeholder="Describe brevemente por qué necesitas ayuda con tu contraseña."
                maxLength={1000}
                style={{
                  minHeight: 84, resize: 'vertical', border: '1px solid var(--mt-border)',
                  borderRadius: 8, padding: '10px 12px', fontSize: 13,
                  color: 'var(--mt-text)', background: 'var(--mt-surface)', outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <ClinicalButton
                variant="solid" size="sm"
                onClick={handlePasswordHelp}
                disabled={requestingPw}
              >
                {requestingPw ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                Enviar solicitud
              </ClinicalButton>
            </div>
          </div>
        </MTPanel>

      </div>
    </ClinicalPage>
  )
}
