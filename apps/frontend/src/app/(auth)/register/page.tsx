'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Building2, Hash, User, Mail, Lock, Stethoscope, IdCard, Loader2 } from 'lucide-react'
import { register } from '@/lib/doctor/api'
import { MTInput, MTButton, MTLogo } from '@/components/doctor/clinical-ui'

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    clinic_name: '',
    clinic_slug: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    specialty: '',
    professional_id: '',
    colegiado_number: '',
  })

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register({
        ...form,
        specialty: form.specialty || undefined,
        professional_id: form.professional_id || undefined,
      })
      localStorage.removeItem('meditrack_doctor_token')
      localStorage.removeItem('meditrack_doctor_refresh_token')
      router.replace('/pending-verification')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrarse')
    } finally {
      setLoading(false)
    }
  }

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
            Registra tu clínica o consultorio
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{
          background: 'var(--mt-surface)',
          borderRadius: 16,
          border: '1px solid var(--mt-border)',
          boxShadow: 'var(--mt-shadow-sm)',
          padding: 24,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>

          <SectionLabel>Clínica / consultorio</SectionLabel>
          <MTInput name="clinic_name" label="Nombre de la clínica" icon={Building2}
            required value={form.clinic_name} onChange={set('clinic_name')}
            placeholder="Consultorio Dr. García" />
          <MTInput name="clinic_slug" label="Slug (identificador único)" icon={Hash}
            required value={form.clinic_slug} onChange={set('clinic_slug')}
            placeholder="dr-garcia" />

          <SectionLabel>Médico responsable</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <MTInput name="first_name" label="Nombre" icon={User}
              required value={form.first_name} onChange={set('first_name')} />
            <MTInput name="last_name" label="Apellido" icon={User}
              required value={form.last_name} onChange={set('last_name')} />
          </div>
          <MTInput name="email" label="Correo electrónico" icon={Mail}
            type="email" required value={form.email} onChange={set('email')}
            placeholder="doctor@ejemplo.com" />
          <MTInput name="password" label="Contraseña" icon={Lock}
            type="password" required minLength={15}
            value={form.password} onChange={set('password')}
            placeholder="Mínimo 15 caracteres" autoComplete="new-password" />

          <SectionLabel>Credenciales profesionales</SectionLabel>
          <MTInput name="colegiado_number" label="Número de colegiado" icon={IdCard}
            required value={form.colegiado_number} onChange={set('colegiado_number')}
            placeholder="CMCGT-12345" />
          <MTInput name="specialty" label="Especialidad (opcional)" icon={Stethoscope}
            value={form.specialty} onChange={set('specialty')} placeholder="Cardiología" />
          <MTInput name="professional_id" label="Cédula / matrícula (opcional)" icon={IdCard}
            value={form.professional_id} onChange={set('professional_id')} placeholder="12345678" />

          <p style={{
            fontSize: 12, color: 'var(--mt-muted)',
            background: 'var(--mt-elevated)', borderRadius: 8,
            padding: '10px 12px', lineHeight: 1.5, margin: 0,
          }}>
            Tu cuenta será revisada por el equipo de Meditrack antes de activarse.
            Recibirás un correo cuando sea aprobada (generalmente en menos de 24 h).
          </p>

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
            {loading ? 'Registrando...' : 'Solicitar acceso'}
          </MTButton>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--mt-text-2)', margin: 0 }}>
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" style={{ color: 'var(--mt-purple)', fontWeight: 500 }}>
              Iniciar sesión
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 600, color: 'var(--mt-muted)',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      margin: '4px 0 -4px',
    }}>
      {children}
    </p>
  )
}
