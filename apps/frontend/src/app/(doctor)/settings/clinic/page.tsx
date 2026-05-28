'use client'

import { useEffect, useState } from 'react'
import { Building2, Loader2, CheckCircle2, AlertCircle, Save } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getClinicProfile,
  updateClinicProfile,
  type ClinicProfile,
  type UpdateClinicInput,
} from '@/lib/doctor/settings-api'
import { MTButton } from '@/components/doctor/clinical-ui'

const PLAN_STYLES: Record<string, { bg: string; color: string }> = {
  free:       { bg: 'var(--mt-elevated)', color: 'var(--mt-text-2)' },
  pro:        { bg: 'var(--mt-primary-subtle)', color: 'var(--mt-primary-deep)' },
  enterprise: { bg: 'var(--mt-purple-subtle)', color: 'var(--mt-purple-deep)' },
}
const PLAN_LABELS: Record<string, string> = { free: 'Gratuito', pro: 'Pro', enterprise: 'Enterprise' }

interface FormState {
  name: string
  phone: string
  contact_email: string
  address: string
  city: string
  country: string
  specialty: string
  website: string
  business_hours: string
}

function emptyForm(): FormState {
  return {
    name: '', phone: '', contact_email: '', address: '',
    city: '', country: '', specialty: '', website: '', business_hours: '',
  }
}

function profileToForm(p: ClinicProfile): FormState {
  const s = p.settings ?? {}
  return {
    name:           p.name,
    phone:          s.phone          ?? '',
    contact_email:  s.contact_email  ?? '',
    address:        s.address        ?? '',
    city:           s.city           ?? '',
    country:        s.country        ?? '',
    specialty:      s.specialty      ?? '',
    website:        s.website        ?? '',
    business_hours: s.business_hours ?? '',
  }
}

function isDirty(form: FormState, profile: ClinicProfile): boolean {
  const base = profileToForm(profile)
  return (Object.keys(form) as (keyof FormState)[]).some(k => form[k] !== base[k])
}

const field = {
  wrapper: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  label: { fontSize: 13, fontWeight: 500, color: 'var(--mt-text-2)' } as React.CSSProperties,
  input: {
    width: '100%', border: '1px solid var(--mt-border)', borderRadius: 8,
    padding: '8px 12px', fontSize: 13, color: 'var(--mt-text)',
    background: 'var(--mt-surface)', outline: 'none',
    fontFamily: 'var(--mt-font)', boxSizing: 'border-box' as const,
  },
}

export default function ClinicSettingsPage() {
  const { token } = useAuth()
  const [profile, setProfile] = useState<ClinicProfile | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    if (!token) return
    getClinicProfile(token)
      .then(p => { setProfile(p); setForm(profileToForm(p)) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  function set(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm(prev => ({ ...prev, [key]: e.target.value }))
      setFeedback(null)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !profile) return
    setSaving(true)
    setFeedback(null)
    try {
      const input: UpdateClinicInput = {
        name: form.name.trim(),
        ...(form.phone          ? { phone: form.phone.trim() }                  : {}),
        ...(form.contact_email  ? { contact_email: form.contact_email.trim() }  : {}),
        ...(form.address        ? { address: form.address.trim() }              : {}),
        ...(form.city           ? { city: form.city.trim() }                    : {}),
        ...(form.country        ? { country: form.country.trim() }              : {}),
        ...(form.specialty      ? { specialty: form.specialty.trim() }          : {}),
        ...(form.website        ? { website: form.website.trim() }              : {}),
        ...(form.business_hours ? { business_hours: form.business_hours.trim() } : {}),
      }
      const updated = await updateClinicProfile(token, input)
      setProfile(updated)
      setForm(profileToForm(updated))
      setFeedback({ ok: true, msg: 'Perfil actualizado correctamente.' })
    } catch (err) {
      setFeedback({ ok: false, msg: err instanceof Error ? err.message : 'Error al guardar.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '40vh', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={22} color="var(--mt-muted)" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  const planStyle = PLAN_STYLES[profile?.plan_type ?? 'free'] ?? PLAN_STYLES.free

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 24, fontFamily: 'var(--mt-font)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Building2 size={22} color="var(--mt-muted)" />
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--mt-text)', margin: 0 }}>Perfil de clínica</h1>
          <p style={{ fontSize: 13, color: 'var(--mt-muted)', margin: 0 }}>Información de tu organización visible en documentos y portal del paciente.</p>
        </div>
      </div>

      {profile && (
        <div style={{
          borderRadius: 16, border: '1px solid var(--mt-border)',
          background: 'var(--mt-surface)', boxShadow: 'var(--mt-shadow-sm)',
          overflow: 'hidden',
        }}>
          {/* Plan badge */}
          <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--mt-border)' }}>
            <span style={{ fontSize: 13, color: 'var(--mt-text-2)' }}>Plan actual</span>
            <span style={{
              borderRadius: 999, padding: '3px 12px',
              fontSize: 12, fontWeight: 600,
              background: planStyle.bg, color: planStyle.color,
            }}>
              {PLAN_LABELS[profile.plan_type] ?? profile.plan_type}
            </span>
          </div>

          {/* Slug (read-only) */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--mt-border)' }}>
            <p style={{ fontSize: 11, color: 'var(--mt-muted)', margin: '0 0 6px' }}>Identificador único (slug)</p>
            <p style={{
              fontFamily: 'monospace', fontSize: 13, color: 'var(--mt-text)',
              background: 'var(--mt-elevated)', borderRadius: 8,
              padding: '8px 12px', margin: '0 0 4px',
            }}>{profile.slug}</p>
            <p style={{ fontSize: 11, color: 'var(--mt-muted)', margin: 0 }}>El slug no se puede cambiar.</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSave} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Sección: identidad */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--mt-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Identidad</p>

              <div style={field.wrapper}>
                <label style={field.label}>Nombre de la clínica *</label>
                <input style={field.input} value={form.name} onChange={set('name')} minLength={2} maxLength={200} required />
              </div>

              <div style={field.wrapper}>
                <label style={field.label}>Especialidad</label>
                <input style={field.input} value={form.specialty} onChange={set('specialty')} placeholder="Ej. Medicina general, Pediatría…" maxLength={200} />
              </div>
            </div>

            {/* Sección: contacto */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--mt-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Contacto</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={field.wrapper}>
                  <label style={field.label}>Teléfono</label>
                  <input style={field.input} value={form.phone} onChange={set('phone')} placeholder="+502 1234-5678" maxLength={30} />
                </div>
                <div style={field.wrapper}>
                  <label style={field.label}>Correo de contacto</label>
                  <input style={field.input} type="email" value={form.contact_email} onChange={set('contact_email')} placeholder="clinica@ejemplo.com" maxLength={200} />
                </div>
              </div>

              <div style={field.wrapper}>
                <label style={field.label}>Sitio web</label>
                <input style={field.input} value={form.website} onChange={set('website')} placeholder="https://www.miclinica.com" maxLength={300} />
              </div>
            </div>

            {/* Sección: ubicación */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--mt-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Ubicación</p>

              <div style={field.wrapper}>
                <label style={field.label}>Dirección</label>
                <input style={field.input} value={form.address} onChange={set('address')} placeholder="6a Calle 5-40, Zona 1" maxLength={300} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={field.wrapper}>
                  <label style={field.label}>Ciudad</label>
                  <input style={field.input} value={form.city} onChange={set('city')} placeholder="Guatemala" maxLength={100} />
                </div>
                <div style={field.wrapper}>
                  <label style={field.label}>País</label>
                  <input style={field.input} value={form.country} onChange={set('country')} placeholder="Guatemala" maxLength={100} />
                </div>
              </div>
            </div>

            {/* Sección: horario */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--mt-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Horario</p>

              <div style={field.wrapper}>
                <label style={field.label}>Horario de atención</label>
                <textarea
                  style={{ ...field.input, resize: 'vertical', minHeight: 72 }}
                  value={form.business_hours}
                  onChange={set('business_hours')}
                  placeholder={'Lun–Vie 8:00–17:00\nSáb 8:00–12:00'}
                  maxLength={500}
                />
              </div>
            </div>

            {/* Feedback */}
            {feedback && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                borderRadius: 10, fontSize: 13, fontWeight: 500,
                background: feedback.ok ? 'var(--mt-success-subtle)' : 'var(--mt-danger-subtle)',
                color: feedback.ok ? '#065F46' : 'var(--mt-danger)',
                border: `1px solid ${feedback.ok ? '#6EE7B7' : '#fecaca'}`,
              }}>
                {feedback.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                {feedback.msg}
              </div>
            )}

            <div>
              <MTButton
                type="submit" variant="solid" icon={saving ? Loader2 : Save}
                disabled={saving || !profile || !isDirty(form, profile) || form.name.trim().length < 2}
              >
                Guardar cambios
              </MTButton>
            </div>
          </form>

          {/* Footer */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--mt-border)' }}>
            <p style={{ fontSize: 11, color: 'var(--mt-muted)', margin: 0 }}>
              Clínica creada el{' '}
              {new Date(profile.created_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
