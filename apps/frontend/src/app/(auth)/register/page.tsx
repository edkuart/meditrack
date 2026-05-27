'use client'

import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Building2, CheckCircle2, Hash, User, Mail, Lock, Stethoscope, IdCard, Loader2 } from 'lucide-react'
import { register } from '@/lib/doctor/api'
import { MTInput, MTButton, MTLogo } from '@/components/doctor/clinical-ui'
import { getPricingPlan, PRICING_PLANS, type CommercialPlanCode } from '@/lib/pricing/plans'

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterShell />}>
      <RegisterForm />
    </Suspense>
  )
}

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const planParam = searchParams.get('plan')
  const initialPlan: CommercialPlanCode = planParam === 'clinic_complete' ? 'clinic_complete' : 'doctor_individual'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<CommercialPlanCode>(initialPlan)
  const selectedPlanData = useMemo(() => getPricingPlan(selectedPlan), [selectedPlan])
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
        selected_plan: selectedPlan,
      })
      window.localStorage.setItem('meditrack_selected_plan', selectedPlan)
      localStorage.removeItem('meditrack_doctor_token')
      localStorage.removeItem('meditrack_doctor_refresh_token')
      router.replace(`/pending-verification?plan=${selectedPlan}`)
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
      <div style={{ width: '100%', maxWidth: 980 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <MTLogo size={20} />
          </div>
          <p style={{ color: 'var(--mt-muted)', fontSize: 13, margin: 0 }}>
            Registra tu clínica o consultorio
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 18, alignItems: 'start' }}>
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
              {loading ? 'Registrando...' : `Solicitar acceso a ${selectedPlanData.name}`}
            </MTButton>

            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--mt-text-2)', margin: 0 }}>
              ¿Ya tienes cuenta?{' '}
              <Link href="/login" style={{ color: 'var(--mt-purple)', fontWeight: 500 }}>
                Iniciar sesión
              </Link>
            </p>
          </form>

          <aside style={{
            background: 'var(--mt-surface)',
            borderRadius: 16,
            border: '1px solid var(--mt-border)',
            boxShadow: 'var(--mt-shadow-sm)',
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            <div>
              <p className="mt-micro" style={{ color: 'var(--mt-purple)' }}>Plan seleccionado</p>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--mt-text)', margin: '6px 0 4px' }}>
                {selectedPlanData.name}
              </h2>
              <p style={{ margin: 0, color: 'var(--mt-muted)', fontSize: 13 }}>{selectedPlanData.bestFor}</p>
            </div>

            <div style={{
              borderRadius: 12,
              background: selectedPlan === 'clinic_complete' ? 'var(--mt-purple-subtle)' : 'var(--mt-primary-subtle)',
              padding: 14,
            }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--mt-text)', letterSpacing: '-0.025em' }}>
                {selectedPlanData.price}
              </span>
              <span style={{ fontSize: 12, color: 'var(--mt-muted)', marginLeft: 6 }}>
                {selectedPlanData.period}
              </span>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {PRICING_PLANS.map(plan => {
                const active = selectedPlan === plan.code
                return (
                  <button
                    key={plan.code}
                    type="button"
                    onClick={() => setSelectedPlan(plan.code)}
                    style={{
                      textAlign: 'left',
                      borderRadius: 10,
                      border: `1px solid ${active ? 'var(--mt-purple)' : 'var(--mt-border)'}`,
                      background: active ? 'var(--mt-purple-subtle)' : 'var(--mt-bg)',
                      padding: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--mt-text)' }}>{plan.name}</span>
                      {active && <CheckCircle2 size={16} color="var(--mt-purple)" />}
                    </span>
                    <span style={{ display: 'block', marginTop: 3, fontSize: 12, color: 'var(--mt-muted)' }}>
                      {plan.price}/mes
                    </span>
                  </button>
                )
              })}
            </div>

            <div style={{ borderTop: '1px solid var(--mt-border)', paddingTop: 12, display: 'grid', gap: 8 }}>
              {selectedPlanData.highlights.slice(0, 4).map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <CheckCircle2 size={14} color="var(--mt-purple)" style={{ marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: 'var(--mt-text-2)', lineHeight: 1.45 }}>{item}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
      <style>{`
        @media (max-width: 860px) {
          div[style*="340px"] {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </div>
  )
}

function RegisterShell() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '48px 16px', background: 'var(--mt-bg)', fontFamily: 'var(--mt-font)',
    }}>
      <Loader2 size={22} color="var(--mt-muted)" style={{ animation: 'spin 1s linear infinite' }} />
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
