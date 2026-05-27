'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  createCheckoutSession,
  createPortalSession,
  getBillingStatus,
  getInvoices,
  type BillingStatus,
  type BillingInvoice,
} from '@/lib/doctor/billing-api'
import { MTButton, MTPill } from '@/components/doctor/clinical-ui'
import {
  getPricingPlan,
  normalizeBillingPlan,
  PRICING_PLANS,
  type CommercialPlanCode,
} from '@/lib/pricing/plans'

function UsageBar({ used, max, label }: { used: number; max: number; label: string }) {
  const unlimited = max === -1
  const pct = unlimited || max === 0 ? 0 : Math.min(100, Math.round((used / max) * 100))
  const nearLimit = !unlimited && pct >= 80

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
        <span style={{ color: 'var(--mt-text-2)' }}>{label}</span>
        <span
          style={{
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: nearLimit ? '#B45309' : 'var(--mt-text)',
          }}
        >
          {unlimited ? `${used} / Ilimitado` : `${used} / ${max}`}
        </span>
      </div>
      {!unlimited && (
        <div style={{ height: 8, width: '100%', borderRadius: 999, background: 'var(--mt-elevated)', overflow: 'hidden' }}>
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              borderRadius: 999,
              background: nearLimit ? '#F59E0B' : 'var(--mt-gradient-accent)',
              transition: 'width .6s cubic-bezier(0,0,.2,1)',
            }}
          />
        </div>
      )}
    </div>
  )
}

function Banner({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 12,
        fontSize: 13,
        background: ok ? 'var(--mt-success-subtle)' : 'var(--mt-danger-subtle)',
        color: ok ? '#065F46' : 'var(--mt-danger)',
        border: `1px solid ${ok ? '#6EE7B7' : '#fecaca'}`,
      }}
    >
      {ok ? <CheckCircle2 size={16} style={{ flexShrink: 0 }} /> : <AlertCircle size={16} style={{ flexShrink: 0 }} />}
      {children}
    </div>
  )
}

function PlanOption({
  code,
  current,
  loading,
  onSelect,
}: {
  code: CommercialPlanCode
  current: boolean
  loading: boolean
  onSelect: (code: CommercialPlanCode) => void
}) {
  const plan = getPricingPlan(code)
  const featured = code === 'clinic_complete'

  return (
    <section
      style={{
        border: `1px solid ${featured ? 'var(--mt-purple)' : 'var(--mt-border)'}`,
        borderRadius: 14,
        background: 'var(--mt-surface)',
        boxShadow: featured ? 'var(--mt-shadow-md)' : 'var(--mt-shadow-sm)',
        overflow: 'hidden',
      }}
    >
      {featured && <div style={{ height: 3, background: 'var(--mt-gradient-accent)' }} />}
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <p className="mt-micro" style={{ color: featured ? 'var(--mt-purple)' : 'var(--mt-primary)' }}>
              {plan.eyebrow}
            </p>
            <h2 style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 800, color: 'var(--mt-text)' }}>{plan.name}</h2>
          </div>
          {current && <MTPill tone="green">Plan actual</MTPill>}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--mt-text)' }}>{plan.price}</span>
          <span style={{ fontSize: 12, color: 'var(--mt-muted)' }}>{plan.period}</span>
        </div>

        <p style={{ margin: 0, fontSize: 13, color: 'var(--mt-text-2)', lineHeight: 1.5 }}>{plan.description}</p>

        <div style={{ display: 'grid', gap: 8 }}>
          {plan.highlights.slice(0, 4).map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <CheckCircle2 size={14} color={featured ? 'var(--mt-purple)' : 'var(--mt-primary)'} style={{ marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: 'var(--mt-text-2)', lineHeight: 1.45 }}>{item}</span>
            </div>
          ))}
        </div>

        <MTButton
          variant={current ? 'outline' : featured ? 'solid' : 'outline'}
          icon={loading ? Loader2 : current ? CheckCircle2 : ArrowRight}
          disabled={loading || current}
          onClick={() => onSelect(code)}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {current ? 'Activo' : code === 'clinic_complete' ? 'Cambiar a Clínica Completa' : 'Elegir Doctor Individual'}
        </MTButton>
      </div>
    </section>
  )
}

const INVOICE_STATUS_LABEL: Record<BillingInvoice['status'], string> = {
  pending: 'Pendiente',
  paid: 'Pagada',
  overdue: 'Vencida',
  cancelled: 'Cancelada',
  refunded: 'Reembolsada',
}

const INVOICE_STATUS_COLOR: Record<BillingInvoice['status'], string> = {
  pending: '#D97706',
  paid: '#059669',
  overdue: '#DC2626',
  cancelled: 'var(--mt-muted)',
  refunded: 'var(--mt-muted)',
}

const PROVIDER_LABEL: Record<BillingInvoice['provider'], string> = {
  recurrente: 'Recurrente',
  stripe: 'Stripe',
  manual: 'Manual',
}

const PLAN_LABEL: Record<string, string> = {
  doctor_individual: 'Doctor Individual',
  clinic_complete: 'Clínica Completa',
}

function InvoiceRow({ invoice }: { invoice: BillingInvoice }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr 90px 100px 80px',
        gap: 12,
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: '1px solid var(--mt-border)',
        fontSize: 13,
      }}
    >
      <span style={{ fontFamily: 'monospace', color: 'var(--mt-text)', fontWeight: 700, fontSize: 12 }}>
        {invoice.invoice_number}
      </span>
      <div>
        <p style={{ margin: 0, color: 'var(--mt-text)', fontWeight: 600 }}>
          {PLAN_LABEL[invoice.plan_type] ?? invoice.plan_type}
        </p>
        <p style={{ margin: '2px 0 0', color: 'var(--mt-muted)', fontSize: 11 }}>
          {invoice.paid_at
            ? `Pagada ${new Date(invoice.paid_at).toLocaleDateString('es-GT')}`
            : new Date(invoice.created_at).toLocaleDateString('es-GT')}
          {' · '}{PROVIDER_LABEL[invoice.provider]}
        </p>
      </div>
      <span style={{ color: 'var(--mt-text)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
        Q{Number(invoice.amount_gtq).toLocaleString('es-GT', { minimumFractionDigits: 2 })}
      </span>
      {invoice.period_end && (
        <span style={{ color: 'var(--mt-muted)', fontSize: 11, textAlign: 'center' }}>
          hasta {new Date(invoice.period_end).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      )}
      {!invoice.period_end && <span />}
      <span
        style={{
          display: 'inline-block',
          padding: '3px 8px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          background: `${INVOICE_STATUS_COLOR[invoice.status]}22`,
          color: INVOICE_STATUS_COLOR[invoice.status],
          textAlign: 'center',
        }}
      >
        {INVOICE_STATUS_LABEL[invoice.status]}
      </span>
    </div>
  )
}

export default function BillingPage() {
  const { token } = useAuth()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [invoices, setInvoices] = useState<BillingInvoice[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<CommercialPlanCode | 'portal' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const upgraded = searchParams.get('upgraded') === 'true'
  const cancelled = searchParams.get('cancelled') === 'true'
  const requestedPlanParam = searchParams.get('plan')
  const requestedPlan: CommercialPlanCode | null = requestedPlanParam === 'doctor_individual' || requestedPlanParam === 'clinic_complete'
    ? requestedPlanParam
    : null

  useEffect(() => {
    if (!token) return
    getBillingStatus(token)
      .then(setStatus)
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudo cargar la suscripción'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (!token) return
    setInvoicesLoading(true)
    getInvoices(token)
      .then(r => setInvoices(r.invoices))
      .catch(() => {})
      .finally(() => setInvoicesLoading(false))
  }, [token])

  useEffect(() => {
    if (upgraded) window.localStorage.removeItem('meditrack_selected_plan')
  }, [upgraded])

  const normalizedPlan = useMemo(() => normalizeBillingPlan(status?.plan), [status?.plan])
  const normalizedBasePlan = useMemo(() => normalizeBillingPlan(status?.base_plan), [status?.base_plan])
  const effectiveCommercialPlan = normalizedPlan === 'free' ? null : normalizedPlan
  const paidCommercialPlan = normalizedBasePlan === 'free' ? null : normalizedBasePlan
  const currentPlan = effectiveCommercialPlan ? getPricingPlan(effectiveCommercialPlan) : null
  const trialStatus = status?.commercial_state.trial_status ?? 'none'
  const isTrialAccess = trialStatus === 'active' || trialStatus === 'expiring'
  const conversionPlan = effectiveCommercialPlan ?? requestedPlan ?? 'doctor_individual'

  async function handleCheckout(plan: CommercialPlanCode) {
    if (!token) return
    setActionLoading(plan)
    setError(null)
    try {
      window.location.href = (await createCheckoutSession(token, plan)).url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar el pago')
      setActionLoading(null)
    }
  }

  async function handleManage() {
    if (!token) return
    setActionLoading('portal')
    setError(null)
    try {
      window.location.href = (await createPortalSession(token)).url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al abrir el portal')
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '40vh', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={22} color="var(--mt-muted)" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  return (
    <div
      style={{
        maxWidth: 1040,
        margin: '0 auto',
        padding: '32px 16px 56px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        fontFamily: 'var(--mt-font)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p className="mt-micro" style={{ color: 'var(--mt-purple)' }}>Suscripción</p>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--mt-text)', margin: '6px 0 0' }}>Plan y pagos</h1>
          <p style={{ fontSize: 13, color: 'var(--mt-muted)', marginTop: 5, marginBottom: 0 }}>
            Revisa tu plan, uso actual y opciones para escalar Meditrack.
          </p>
        </div>
        {status?.subscription && status.subscription.provider !== 'recurrente' && (
          <MTButton variant="outline" icon={actionLoading === 'portal' ? Loader2 : ExternalLink} disabled={actionLoading !== null} onClick={handleManage}>
            Gestionar suscripción
          </MTButton>
        )}
      </div>

      {upgraded && <Banner ok={true}>Suscripción actualizada correctamente.</Banner>}
      {cancelled && <Banner ok={false}><span style={{ color: 'var(--mt-text-2)' }}>Proceso cancelado. No se realizó ningún cargo.</span></Banner>}
      {requestedPlan && paidCommercialPlan !== requestedPlan && (
        <Banner ok={true}>
          <span>
            Tu cuenta ya está lista. Completa el pago de <strong>{getPricingPlan(requestedPlan).name}</strong> para activar el plan seleccionado.
          </span>
        </Banner>
      )}
      {isTrialAccess && status?.access_grant && (
        <div
          style={{
            border: '1px solid var(--mt-primary-mist)',
            borderRadius: 14,
            background: 'linear-gradient(135deg, var(--mt-primary-subtle), var(--mt-purple-subtle))',
            padding: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
            <Sparkles size={18} color="var(--mt-purple)" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, color: 'var(--mt-primary-deep)', fontSize: 14, fontWeight: 800 }}>
                {trialStatus === 'expiring' ? 'Tu prueba está por vencer' : 'Estás usando Meditrack en prueba'}
              </p>
              <p style={{ margin: '4px 0 0', color: 'var(--mt-primary-deep)', fontSize: 13, lineHeight: 1.5 }}>
                Acceso temporal a <strong>{currentPlan?.name}</strong>
                {status.commercial_state.days_remaining !== null ? ` · ${status.commercial_state.days_remaining} días restantes` : ''}.
                Activa el pago para conservar el plan sin interrupciones.
              </p>
            </div>
          </div>
          <MTButton
            variant="solid"
            icon={actionLoading === conversionPlan ? Loader2 : CreditCard}
            disabled={actionLoading !== null}
            onClick={() => handleCheckout(conversionPlan)}
            style={{ flexShrink: 0 }}
          >
            Activar pago
          </MTButton>
        </div>
      )}
      {trialStatus === 'expired' && !paidCommercialPlan && (
        <Banner ok={false}>
          <span>
            Tu prueba finalizó. Puedes seguir consultando información clínica, pero necesitas activar un plan para continuar creando y usando funciones avanzadas.
          </span>
        </Banner>
      )}
      {error && <Banner ok={false}>{error}</Banner>}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, .92fr) minmax(0, 1.08fr)',
          gap: 16,
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            borderRadius: 16,
            border: '1px solid var(--mt-border)',
            background: 'var(--mt-surface)',
            boxShadow: 'var(--mt-shadow-sm)',
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: currentPlan ? 'var(--mt-primary-subtle)' : 'var(--mt-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: currentPlan ? 'var(--mt-primary)' : 'var(--mt-muted)',
              }}
            >
              <CreditCard size={20} />
            </div>
            <div>
              <p style={{ fontSize: 12, color: 'var(--mt-muted)', margin: 0 }}>Plan actual</p>
              <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--mt-text)', margin: 0 }}>
                {currentPlan?.name ?? 'Sin plan activo'}
              </p>
              {isTrialAccess && <MTPill tone="purple">Prueba temporal</MTPill>}
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--mt-text-2)' }}>
            {currentPlan
              ? currentPlan.description
              : 'Tu cuenta está activa en modo pendiente de suscripción. Elige un plan para habilitar el modelo comercial definitivo.'}
          </p>

          {status?.subscription?.current_period_end && (
            <div style={{ border: '1px solid var(--mt-border)', borderRadius: 10, padding: 12, background: 'var(--mt-bg)' }}>
              <p style={{ fontSize: 12, color: 'var(--mt-muted)', margin: 0 }}>Próxima renovación</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--mt-text)', margin: '3px 0 0' }}>
                {new Date(status.subscription.current_period_end).toLocaleDateString('es-GT', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--mt-border)', paddingTop: 18, display: 'grid', gap: 15 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={15} color="var(--mt-purple)" />
              <p style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mt-muted)', margin: 0 }}>
                Uso del plan
              </p>
            </div>
            <UsageBar used={status?.usage.patients ?? 0} max={status?.limits.max_patients ?? 0} label="Pacientes activos" />
            <UsageBar used={status?.usage.staff ?? 0} max={status?.limits.max_staff ?? 0} label="Miembros del equipo" />
          </div>
        </div>

        <div
          style={{
            borderRadius: 16,
            border: '1px solid var(--mt-primary-mist)',
            background: 'linear-gradient(135deg, var(--mt-primary-subtle) 0%, var(--mt-purple-subtle) 100%)',
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldCheck size={18} color="var(--mt-primary)" />
              <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--mt-primary-deep)', margin: 0 }}>
                Base segura en ambos planes
              </p>
            </div>
            <p style={{ margin: '10px 0 0', color: 'var(--mt-primary-deep)', fontSize: 13, lineHeight: 1.55 }}>
              Meditrack no vende la seguridad clínica como lujo. Auditoría, trazabilidad, controles de acceso y continuidad del historial son parte del fundamento del producto.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {[
              ['Consultas', 'Ilimitadas'],
              ['Tratamientos', 'Ilimitados'],
              ['Dosis', 'Ilimitadas'],
              ['Portal paciente', 'Incluido'],
            ].map(([label, value]) => (
              <div key={label} style={{ border: '1px solid rgba(37,99,235,.18)', borderRadius: 10, background: 'rgba(255,255,255,.62)', padding: 12 }}>
                <p style={{ margin: 0, color: 'var(--mt-muted)', fontSize: 11 }}>{label}</p>
                <p style={{ margin: '3px 0 0', color: 'var(--mt-text)', fontWeight: 800, fontSize: 14 }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Sparkles size={16} color="var(--mt-purple)" />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--mt-text)' }}>Planes disponibles</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
          {PRICING_PLANS.map(plan => (
            <PlanOption
              key={plan.code}
              code={plan.code}
              current={paidCommercialPlan === plan.code}
              loading={actionLoading === plan.code}
              onSelect={handleCheckout}
            />
          ))}
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <FileText size={16} color="var(--mt-purple)" />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--mt-text)' }}>Historial de facturas</h2>
        </div>
        <div
          style={{
            borderRadius: 14,
            border: '1px solid var(--mt-border)',
            background: 'var(--mt-surface)',
            boxShadow: 'var(--mt-shadow-sm)',
            padding: '4px 20px 12px',
          }}
        >
          {invoicesLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <Loader2 size={18} color="var(--mt-muted)" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          )}
          {!invoicesLoading && invoices.length === 0 && (
            <p style={{ margin: '20px 0', textAlign: 'center', color: 'var(--mt-muted)', fontSize: 13 }}>
              No hay facturas registradas aún.
            </p>
          )}
          {!invoicesLoading && invoices.length > 0 && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr 90px 100px 80px',
                  gap: 12,
                  padding: '10px 0 6px',
                  borderBottom: '2px solid var(--mt-border)',
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: 'var(--mt-muted)',
                }}
              >
                <span>No. Factura</span>
                <span>Plan</span>
                <span style={{ textAlign: 'right' }}>Monto</span>
                <span style={{ textAlign: 'center' }}>Período</span>
                <span style={{ textAlign: 'center' }}>Estado</span>
              </div>
              {invoices.map(inv => <InvoiceRow key={inv.id} invoice={inv} />)}
            </>
          )}
        </div>
      </section>

      <style>{`
        @media (max-width: 860px) {
          div[style*="minmax(0, .92fr)"] {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          div[style*="repeat(2, minmax(0, 1fr))"] {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </div>
  )
}
