'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, AlertCircle, Zap, Shield, Loader2, ExternalLink } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { getBillingStatus, createCheckoutSession, createPortalSession, type BillingStatus } from '@/lib/doctor/billing-api'
import { MTButton } from '@/components/doctor/clinical-ui'

const PLAN_LABELS: Record<string, string> = { free: 'Gratuito', pro: 'Pro', enterprise: 'Enterprise' }

function UsageBar({ used, max, label }: { used: number; max: number; label: string }) {
  const unlimited = max === -1
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / max) * 100))
  const nearLimit = !unlimited && pct >= 80

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ color: 'var(--mt-text-2)' }}>{label}</span>
        <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: nearLimit ? '#D97706' : 'var(--mt-text)' }}>
          {unlimited ? `${used} / Ilimitado` : `${used} / ${max}`}
        </span>
      </div>
      {!unlimited && (
        <div style={{ height: 8, width: '100%', borderRadius: 999, background: 'var(--mt-elevated)', overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%', borderRadius: 999,
            background: nearLimit ? '#FBBF24' : 'var(--mt-gradient-accent)',
            transition: 'width .6s cubic-bezier(0,0,.2,1)',
          }} />
        </div>
      )}
    </div>
  )
}

function Banner({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
      borderRadius: 12, fontSize: 13,
      background: ok ? 'var(--mt-success-subtle)' : ok === false ? 'var(--mt-danger-subtle)' : 'var(--mt-elevated)',
      color: ok ? '#065F46' : ok === false ? 'var(--mt-danger)' : 'var(--mt-text-2)',
      border: `1px solid ${ok ? '#6EE7B7' : ok === false ? '#fecaca' : 'var(--mt-border)'}`,
    }}>
      {ok ? <CheckCircle2 size={16} style={{ flexShrink: 0 }} /> : <AlertCircle size={16} style={{ flexShrink: 0 }} />}
      {children}
    </div>
  )
}

export default function BillingPage() {
  const { token } = useAuth()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upgraded = searchParams.get('upgraded') === 'true'
  const cancelled = searchParams.get('cancelled') === 'true'

  useEffect(() => {
    if (!token) return
    getBillingStatus(token).then(setStatus).catch(err => setError(err.message)).finally(() => setLoading(false))
  }, [token])

  async function handleUpgrade() {
    if (!token) return
    setActionLoading(true)
    try { window.location.href = (await createCheckoutSession(token)).url }
    catch (err) { setError(err instanceof Error ? err.message : 'Error al iniciar el pago'); setActionLoading(false) }
  }

  async function handleManage() {
    if (!token) return
    setActionLoading(true)
    try { window.location.href = (await createPortalSession(token)).url }
    catch (err) { setError(err instanceof Error ? err.message : 'Error al abrir el portal'); setActionLoading(false) }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '40vh', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={22} color="var(--mt-muted)" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: 20, fontFamily: 'var(--mt-font)' }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--mt-text)', margin: 0 }}>Plan y pagos</h1>
        <p style={{ fontSize: 13, color: 'var(--mt-muted)', marginTop: 4, marginBottom: 0 }}>Gestiona tu suscripción y revisa el uso de la clínica.</p>
      </div>

      {upgraded && <Banner ok={true}>¡Suscripción activada! Tu plan Pro ya está activo.</Banner>}
      {cancelled && <Banner ok={false}><span style={{ color: 'var(--mt-text-2)' }}>Proceso cancelado. No se realizó ningún cargo.</span></Banner>}
      {error && <Banner ok={false}>{error}</Banner>}

      {status && (
        <>
          <div style={{ borderRadius: 16, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)', boxShadow: 'var(--mt-shadow-sm)', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {status.plan === 'free'
                  ? <Shield size={22} color="var(--mt-muted)" />
                  : <Zap size={22} color="var(--mt-primary)" />
                }
                <div>
                  <p style={{ fontSize: 12, color: 'var(--mt-muted)', margin: 0 }}>Plan actual</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--mt-text)', margin: 0 }}>{PLAN_LABELS[status.plan] ?? status.plan}</p>
                </div>
              </div>
              {status.plan === 'free' ? (
                <MTButton variant="solid" icon={actionLoading ? Loader2 : Zap} disabled={actionLoading} onClick={handleUpgrade}>
                  Actualizar a Pro
                </MTButton>
              ) : (
                <MTButton variant="outline" icon={actionLoading ? Loader2 : ExternalLink} disabled={actionLoading} onClick={handleManage}>
                  Gestionar suscripción
                </MTButton>
              )}
            </div>

            {status.subscription?.current_period_end && (
              <p style={{ fontSize: 12, color: 'var(--mt-muted)', margin: 0 }}>
                Próxima renovación:{' '}
                {new Date(status.subscription.current_period_end).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}

            <div style={{ borderTop: '1px solid var(--mt-border)', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mt-muted)', margin: 0 }}>
                Uso del plan
              </p>
              <UsageBar used={status.usage.patients} max={status.limits.max_patients} label="Pacientes activos" />
              <UsageBar used={status.usage.staff} max={status.limits.max_staff} label="Miembros del equipo" />
            </div>
          </div>

          {status.plan === 'free' && (
            <div style={{
              borderRadius: 16, padding: 24,
              border: '1px solid var(--mt-primary-mist)',
              background: 'linear-gradient(135deg, var(--mt-primary-subtle) 0%, var(--mt-purple-subtle) 100%)',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Zap size={18} color="var(--mt-primary)" />
                <p style={{ fontWeight: 600, color: 'var(--mt-primary-deep)', margin: 0 }}>¿Qué incluye el plan Pro?</p>
              </div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
                {['Hasta 2,000 pacientes activos', 'Hasta 20 miembros del equipo', 'Exportación FHIR R4', 'Asistente IA para consultas', 'Soporte prioritario'].map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--mt-primary-deep)' }}>
                    <CheckCircle2 size={14} color="var(--mt-primary)" style={{ flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <MTButton variant="solid" icon={actionLoading ? Loader2 : Zap} disabled={actionLoading} onClick={handleUpgrade} style={{ width: '100%', justifyContent: 'center' }}>
                Actualizar ahora
              </MTButton>
            </div>
          )}
        </>
      )}
    </div>
  )
}
