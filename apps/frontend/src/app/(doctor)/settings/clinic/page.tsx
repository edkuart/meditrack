'use client'

import { useEffect, useState } from 'react'
import { Building2, Loader2, CheckCircle2, AlertCircle, Save } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { getClinicProfile, updateClinicProfile, type ClinicProfile } from '@/lib/doctor/settings-api'
import { MTButton } from '@/components/doctor/clinical-ui'

const PLAN_STYLES: Record<string, { bg: string; color: string }> = {
  free:       { bg: 'var(--mt-elevated)', color: 'var(--mt-text-2)' },
  pro:        { bg: 'var(--mt-primary-subtle)', color: 'var(--mt-primary-deep)' },
  enterprise: { bg: 'var(--mt-purple-subtle)', color: 'var(--mt-purple-deep)' },
}
const PLAN_LABELS: Record<string, string> = { free: 'Gratuito', pro: 'Pro', enterprise: 'Enterprise' }

export default function ClinicSettingsPage() {
  const { token } = useAuth()
  const [profile, setProfile] = useState<ClinicProfile | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    if (!token) return
    getClinicProfile(token)
      .then(p => { setProfile(p); setName(p.name) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !name.trim() || name === profile?.name) return
    setSaving(true)
    setFeedback(null)
    try {
      const updated = await updateClinicProfile(token, name.trim())
      setProfile(updated)
      setFeedback({ ok: true, msg: 'Nombre actualizado correctamente.' })
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
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 24, fontFamily: 'var(--mt-font)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Building2 size={22} color="var(--mt-muted)" />
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--mt-text)', margin: 0 }}>Perfil de clínica</h1>
          <p style={{ fontSize: 13, color: 'var(--mt-muted)', margin: 0 }}>Información básica de tu organización.</p>
        </div>
      </div>

      {profile && (
        <div style={{
          borderRadius: 16, border: '1px solid var(--mt-border)',
          background: 'var(--mt-surface)', boxShadow: 'var(--mt-shadow-sm)',
          display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden',
        }}>
          {/* Plan badge */}
          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--mt-border)' }}>
            <span style={{ fontSize: 13, color: 'var(--mt-text-2)' }}>Plan actual</span>
            <span style={{
              borderRadius: 999, padding: '3px 12px',
              fontSize: 12, fontWeight: 600,
              background: planStyle.bg, color: planStyle.color,
            }}>
              {PLAN_LABELS[profile.plan_type] ?? profile.plan_type}
            </span>
          </div>

          {/* Slug */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--mt-border)' }}>
            <p style={{ fontSize: 11, color: 'var(--mt-muted)', marginBottom: 6, margin: '0 0 6px' }}>Identificador único (slug)</p>
            <p style={{
              fontFamily: 'monospace', fontSize: 13, color: 'var(--mt-text)',
              background: 'var(--mt-elevated)', borderRadius: 8,
              padding: '8px 12px', margin: '0 0 4px',
            }}>{profile.slug}</p>
            <p style={{ fontSize: 11, color: 'var(--mt-muted)', margin: 0 }}>El slug no se puede cambiar.</p>
          </div>

          {/* Edit name form */}
          <form onSubmit={handleSave} style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--mt-text-2)', marginBottom: 6 }}>
                Nombre de la clínica
              </label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                minLength={2} maxLength={200} required
                style={{
                  width: '100%', border: '1px solid var(--mt-border)', borderRadius: 8,
                  padding: '8px 12px', fontSize: 13, color: 'var(--mt-text)',
                  background: 'var(--mt-surface)', outline: 'none',
                  fontFamily: 'var(--mt-font)', boxSizing: 'border-box',
                }}
              />
            </div>

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
                disabled={saving || name === profile.name || name.trim().length < 2}
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
