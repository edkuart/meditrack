'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, Download, Loader2, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { getLegalStatus, acceptLegal, type LegalStatus } from '@/lib/doctor/compliance-api'
import { MTButton } from '@/components/doctor/clinical-ui'

const TOS_EFFECTIVE = '2025-01-01'
const PRIVACY_EFFECTIVE = '2025-01-01'

function needsAcceptance(acceptedAt: string | null, effectiveDate: string): boolean {
  if (!acceptedAt) return true
  return new Date(acceptedAt) < new Date(effectiveDate)
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof ShieldCheck; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 16, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)', overflow: 'hidden', boxShadow: 'var(--mt-shadow-sm)' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--mt-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={16} color="var(--mt-muted)" />
        <h2 style={{ fontWeight: 600, fontSize: 14, color: 'var(--mt-text)', margin: 0 }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

export default function ComplianceSettingsPage() {
  const { token } = useAuth()
  const [status, setStatus] = useState<LegalStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState<'tos' | 'privacy' | null>(null)

  useEffect(() => {
    if (!token) return
    getLegalStatus(token).then(setStatus).finally(() => setLoading(false))
  }, [token])

  async function handleAccept(type: 'tos' | 'privacy') {
    if (!token) return
    setAccepting(type)
    try {
      const result = await acceptLegal(token, type)
      setStatus(prev => prev ? {
        ...prev,
        tos_accepted_at: type === 'tos' ? result.accepted_at : prev.tos_accepted_at,
        privacy_policy_accepted_at: type === 'privacy' ? result.accepted_at : prev.privacy_policy_accepted_at,
      } : null)
    } finally { setAccepting(null) }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <Loader2 size={24} color="var(--mt-muted)" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  const tosPending = status ? needsAcceptance(status.tos_accepted_at, TOS_EFFECTIVE) : true
  const privacyPending = status ? needsAcceptance(status.privacy_policy_accepted_at, PRIVACY_EFFECTIVE) : true

  const policies = [
    {
      key: 'tos' as const,
      label: 'Términos de Servicio',
      acceptedAt: status?.tos_accepted_at,
      pending: tosPending,
    },
    {
      key: 'privacy' as const,
      label: 'Política de Privacidad',
      acceptedAt: status?.privacy_policy_accepted_at,
      pending: privacyPending,
    },
  ]

  const retention = [
    { label: 'Registros clínicos', value: '10 años', note: 'Historia clínica obligatoria' },
    { label: 'Logs de auditoría', value: '5 años', note: 'Trazabilidad regulatoria' },
    { label: 'Consentimientos', value: 'Indefinido', note: 'Hasta retiro o erasure' },
    { label: 'Sesiones inactivas', value: '30 días', note: 'Expiración automática' },
  ]

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, fontFamily: 'var(--mt-font)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: 'var(--mt-success-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ShieldCheck size={20} color="var(--mt-success)" />
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--mt-text)', margin: 0 }}>Cumplimiento & Legal</h1>
          <p style={{ fontSize: 13, color: 'var(--mt-muted)', margin: 0 }}>Aceptación de políticas y estado de cumplimiento normativo</p>
        </div>
      </div>

      <Section title="Políticas legales" icon={ShieldCheck}>
        <div>
          {policies.map((policy, i) => (
            <div key={policy.key} style={{
              padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
              borderTop: i > 0 ? '1px solid var(--mt-border)' : 'none',
            }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text)', margin: 0 }}>{policy.label}</p>
                <p style={{ fontSize: 11, color: 'var(--mt-muted)', margin: '3px 0 0' }}>
                  {policy.acceptedAt
                    ? `Aceptado el ${new Date(policy.acceptedAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`
                    : 'No aceptado aún'}
                </p>
              </div>
              {policy.pending ? (
                <MTButton
                  variant="solid" size="sm"
                  icon={accepting === policy.key ? Loader2 : undefined}
                  disabled={accepting === policy.key}
                  onClick={() => handleAccept(policy.key)}
                  style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  Aceptar
                </MTButton>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--mt-success)', fontWeight: 500, flexShrink: 0 }}>
                  <CheckCircle2 size={14} /> Al día
                </span>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Retención de datos" icon={Clock}>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {retention.map(r => (
              <div key={r.label} style={{ borderRadius: 10, background: 'var(--mt-elevated)', padding: 14 }}>
                <p style={{ fontSize: 11, color: 'var(--mt-muted)', margin: '0 0 4px' }}>{r.label}</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--mt-text)', margin: '0 0 4px' }}>{r.value}</p>
                <p style={{ fontSize: 11, color: 'var(--mt-muted)', margin: 0 }}>{r.note}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--mt-muted)', margin: 0 }}>
            Los periodos de retención siguen las obligaciones legales de registros médicos aplicables.
            Para solicitar eliminación de datos fuera de estos periodos, contacta con soporte.
          </p>
        </div>
      </Section>

      <div style={{
        borderRadius: 14, border: '1px solid #FDE68A',
        background: '#FFFBEB', padding: '16px 20px',
        display: 'flex', gap: 14,
      }}>
        <AlertTriangle size={18} color="#D97706" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, color: '#92400E', margin: '0 0 6px' }}>Derechos RGPD de pacientes</p>
          <p style={{ fontSize: 12, color: '#B45309', margin: '0 0 12px', lineHeight: 1.5 }}>
            Los pacientes pueden ejercer el derecho de portabilidad (exportar datos) y el derecho al olvido (anonimización) desde la pestaña <strong>Cumplimiento</strong> en su expediente clínico. Los datos médicos se conservan según obligación legal aunque se aplique la anonimización.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { icon: Download, label: 'Portabilidad: exportar datos' },
              { icon: ShieldCheck, label: 'Erasure: anonimización PII' },
            ].map(({ icon: Icon, label }) => (
              <span key={label} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11,
                background: '#fff', border: '1px solid #FDE68A', color: '#92400E',
                borderRadius: 8, padding: '4px 10px',
              }}>
                <Icon size={11} /> {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
