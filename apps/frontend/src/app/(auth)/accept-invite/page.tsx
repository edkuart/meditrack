'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, CheckCircle, Eye, EyeOff, Loader2, User, Lock, Stethoscope, IdCard } from 'lucide-react'
import { acceptInvite } from '@/lib/doctor/staff-api'
import { getDefaultClinicalPath } from '@/lib/doctor/navigation'
import { MTInput, MTButton, MTLogo } from '@/components/doctor/clinical-ui'

function AcceptInviteForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    password: '',
    confirm_password: '',
    specialty: '',
    professional_id: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirm_password) {
      setError('Las contraseñas no coinciden')
      return
    }
    if (form.password.length < 15) {
      setError('La contraseña debe tener al menos 15 caracteres')
      return
    }
    if (!token) {
      setError('Token de invitación no válido')
      return
    }
    setError('')
    setLoading(true)
    try {
      const result = await acceptInvite({
        token,
        first_name: form.first_name,
        last_name: form.last_name,
        password: form.password,
        specialty: form.specialty || undefined,
        professional_id: form.professional_id || undefined,
      })
      localStorage.removeItem('meditrack_doctor_token')
      localStorage.removeItem('meditrack_doctor_refresh_token')
      router.replace(getDefaultClinicalPath(result.user))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aceptar la invitación')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <p style={{ color: 'var(--mt-danger)', fontSize: 13 }}>
          Enlace de invitación inválido o expirado.
        </p>
        <Link href="/login" style={{ color: 'var(--mt-purple)', fontSize: 13, marginTop: 8, display: 'inline-block' }}>
          Ir al inicio de sesión
        </Link>
      </div>
    )
  }

  const eyeBtn = (
    <button
      type="button"
      onClick={() => setShowPassword(v => !v)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mt-muted)', display: 'flex', padding: 0 }}
    >
      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  )

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'var(--mt-surface)',
      borderRadius: 16, border: '1px solid var(--mt-border)',
      boxShadow: 'var(--mt-shadow-sm)', padding: 24,
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        paddingBottom: 14, borderBottom: '1px solid var(--mt-border)',
      }}>
        <CheckCircle size={18} color="var(--mt-success)" />
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--mt-text)' }}>
          Configura tu cuenta
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <MTInput name="first_name" label="Nombre *" icon={User}
          required value={form.first_name} onChange={set('first_name')} />
        <MTInput name="last_name" label="Apellido *" icon={User}
          required value={form.last_name} onChange={set('last_name')} />
      </div>

      <MTInput name="password" label="Contraseña *" icon={Lock}
        type={showPassword ? 'text' : 'password'}
        required minLength={15}
        value={form.password} onChange={set('password')}
        placeholder="Mínimo 15 caracteres" autoComplete="new-password"
        suffix={eyeBtn} />

      <MTInput name="confirm_password" label="Confirmar contraseña *" icon={Lock}
        type={showPassword ? 'text' : 'password'}
        required value={form.confirm_password} onChange={set('confirm_password')}
        autoComplete="new-password" suffix={eyeBtn} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <MTInput name="specialty" label="Especialidad" icon={Stethoscope}
          value={form.specialty} onChange={set('specialty')} placeholder="Cardiología" />
        <MTInput name="professional_id" label="Cédula profesional" icon={IdCard}
          value={form.professional_id} onChange={set('professional_id')} />
      </div>

      {error && (
        <p style={{
          fontSize: 13, color: 'var(--mt-danger)',
          background: 'var(--mt-danger-subtle)',
          borderRadius: 8, padding: '8px 12px', margin: 0,
          border: '1px solid #fecaca',
        }}>{error}</p>
      )}

      <MTButton
        type="submit" variant="solid" size="lg" disabled={loading}
        icon={loading ? Loader2 : undefined}
        iconRight={loading ? undefined : ArrowRight}
        style={{ width: '100%', height: 44 }}
      >
        {loading ? 'Creando cuenta...' : 'Crear cuenta e ingresar'}
      </MTButton>
    </form>
  )
}

export default function AcceptInvitePage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '48px 16px', background: 'var(--mt-bg)', fontFamily: 'var(--mt-font)',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <MTLogo size={20} />
          </div>
          <p style={{ color: 'var(--mt-muted)', fontSize: 13, margin: 0 }}>
            Aceptar invitación de equipo
          </p>
        </div>
        <Suspense fallback={
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Loader2 size={24} color="var(--mt-muted)" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        }>
          <AcceptInviteForm />
        </Suspense>
      </div>
    </div>
  )
}
