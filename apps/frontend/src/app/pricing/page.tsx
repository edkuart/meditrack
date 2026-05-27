import Link from 'next/link'
import {
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { MTLogo } from '@/components/doctor/clinical-ui'
import { PRICING_FEATURE_GROUPS, PRICING_PLANS, type PricingPlan } from '@/lib/pricing/plans'

function PlanCard({ plan, featured = false }: { plan: PricingPlan; featured?: boolean }) {
  const border = featured ? 'var(--mt-purple)' : 'var(--mt-border)'
  const soft = featured ? 'var(--mt-purple-subtle)' : 'var(--mt-primary-subtle)'
  const fg = featured ? 'var(--mt-purple-deep)' : 'var(--mt-primary-deep)'

  return (
    <section
      style={{
        position: 'relative',
        border: `1px solid ${border}`,
        borderRadius: 16,
        background: 'var(--mt-surface)',
        boxShadow: featured ? 'var(--mt-shadow-lg)' : 'var(--mt-shadow-sm)',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      {featured && (
        <div
          style={{
            height: 4,
            background: 'var(--mt-gradient-accent)',
          }}
        />
      )}
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p className="mt-micro" style={{ color: featured ? 'var(--mt-purple)' : 'var(--mt-primary)' }}>
              {plan.eyebrow}
            </p>
            <h2 style={{ margin: '8px 0 0', fontSize: 24, lineHeight: 1.15, fontWeight: 800, color: 'var(--mt-text)' }}>
              {plan.name}
            </h2>
          </div>
          {plan.badge && (
            <span
              style={{
                border: '1px solid var(--mt-purple-light)',
                background: 'var(--mt-purple-subtle)',
                color: 'var(--mt-purple-deep)',
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {plan.badge}
            </span>
          )}
        </div>

        <p style={{ margin: 0, color: 'var(--mt-text-2)', fontSize: 14, lineHeight: 1.55 }}>
          {plan.description}
        </p>

        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--mt-text)' }}>
              {plan.price}
            </span>
            <span style={{ color: 'var(--mt-muted)', fontSize: 13 }}>{plan.period}</span>
          </div>
          <p style={{ margin: '4px 0 0', color: fg, fontSize: 13, fontWeight: 700 }}>{plan.bestFor}</p>
        </div>

        <Link
          href={plan.href}
          className={featured ? 'mt-btn-glow' : undefined}
          style={{
            height: 42,
            borderRadius: 8,
            border: featured ? 'none' : '1px solid var(--mt-border)',
            background: featured ? 'transparent' : 'var(--mt-surface)',
            color: featured ? '#fff' : 'var(--mt-text)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 700,
            boxShadow: featured ? 'var(--mt-shadow-md)' : 'var(--mt-shadow-xs)',
          }}
        >
          <span>{plan.cta}</span>
          <ArrowRight size={15} />
        </Link>

        <div style={{ borderTop: '1px solid var(--mt-border)', paddingTop: 18 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            {plan.highlights.map(item => (
              <div key={item} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <CheckCircle2 size={15} color={featured ? 'var(--mt-purple)' : 'var(--mt-primary)'} style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 13, color: 'var(--mt-text-2)', lineHeight: 1.45 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            border: '1px solid var(--mt-border)',
            borderRadius: 12,
            background: soft,
            padding: 14,
            display: 'grid',
            gap: 8,
          }}
        >
          {Object.entries(plan.limits).map(([key, value]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
              <span style={{ color: 'var(--mt-muted)', textTransform: 'capitalize' }}>{key}</span>
              <span style={{ color: fg, fontWeight: 700, textAlign: 'right' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return <CheckCircle2 size={16} color="var(--mt-success)" aria-label="Incluido" />
  }
  if (value === false) {
    return <X size={16} color="var(--mt-muted)" aria-label="No incluido" />
  }
  return <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--mt-text)' }}>{value}</span>
}

export default function PricingPage() {
  const [doctorPlan, clinicPlan] = PRICING_PLANS

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mt-bg)', fontFamily: 'var(--mt-font)' }}>
      <header
        style={{
          borderBottom: '1px solid var(--mt-border)',
          background: 'rgba(255,255,255,.88)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: '0 auto',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <MTLogo size={18} />
          <nav style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link
              href="/login"
              style={{
                color: 'var(--mt-text-2)',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 600,
                padding: '8px 10px',
              }}
            >
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              style={{
                color: '#fff',
                background: 'var(--mt-primary)',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 700,
                padding: '8px 12px',
                borderRadius: 8,
                boxShadow: 'var(--mt-shadow-sm)',
              }}
            >
              Solicitar acceso
            </Link>
          </nav>
        </div>
      </header>

      <section style={{ borderBottom: '1px solid var(--mt-border)', background: 'var(--mt-gradient-surface)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '56px 20px 32px' }}>
          <div style={{ maxWidth: 760 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                border: '1px solid var(--mt-primary-mist)',
                background: 'var(--mt-primary-subtle)',
                color: 'var(--mt-primary-deep)',
                borderRadius: 999,
                padding: '5px 10px',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <ShieldCheck size={14} />
              Planes diseñados para operación médica real
            </div>
            <h1
              style={{
                margin: '18px 0 0',
                maxWidth: 720,
                fontSize: 44,
                lineHeight: 1.04,
                fontWeight: 800,
                letterSpacing: '-0.025em',
                color: 'var(--mt-text)',
              }}
            >
              Empieza con una consulta ordenada. Escala cuando tu operación sea un equipo.
            </h1>
            <p style={{ margin: '16px 0 0', maxWidth: 640, color: 'var(--mt-text-2)', fontSize: 16, lineHeight: 1.6 }}>
              Dos planes claros para Meditrack: uno para el doctor individual y otro para clínicas que necesitan roles,
              permisos, reportes y coordinación operativa.
            </p>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '28px 20px 56px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 18 }}>
          <PlanCard plan={doctorPlan} />
          <PlanCard plan={clinicPlan} featured />
        </div>

        <div style={{ marginTop: 26, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          {[
            ['Seguridad incluida', 'Auditoría, controles de acceso y trazabilidad clínica desde el plan inicial.'],
            ['Sin castigar uso clínico', 'Consultas, tratamientos y dosis no son el lugar correcto para crear fricción.'],
            ['Preparado para crecer', 'Usuarios, reportes, sedes y módulos operativos se expanden con la clínica.'],
          ].map(([title, body]) => (
            <div key={title} style={{ border: '1px solid var(--mt-border)', background: 'var(--mt-surface)', borderRadius: 12, padding: 16 }}>
              <Sparkles size={16} color="var(--mt-purple)" />
              <h3 style={{ margin: '8px 0 4px', fontSize: 14, color: 'var(--mt-text)' }}>{title}</h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--mt-text-2)', lineHeight: 1.5 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: 'var(--mt-surface)', borderTop: '1px solid var(--mt-border)', borderBottom: '1px solid var(--mt-border)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '42px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
            <div>
              <p className="mt-micro" style={{ color: 'var(--mt-purple)' }}>Comparación</p>
              <h2 className="mt-heading" style={{ marginTop: 8 }}>Diferencias por operación, no por seguridad</h2>
            </div>
            <p style={{ maxWidth: 430, margin: 0, color: 'var(--mt-text-2)', fontSize: 13, lineHeight: 1.5 }}>
              El plan individual conserva el núcleo clínico. La clínica completa agrega coordinación, gobierno y escala.
            </p>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            {PRICING_FEATURE_GROUPS.map(group => (
              <section key={group.label} style={{ border: '1px solid var(--mt-border)', borderRadius: 12, overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(220px, 1fr) 180px 180px',
                    background: 'var(--mt-elevated)',
                    borderBottom: '1px solid var(--mt-border)',
                  }}
                >
                  <div style={{ padding: '12px 14px', fontSize: 13, fontWeight: 800, color: 'var(--mt-text)' }}>{group.label}</div>
                  <div style={{ padding: '12px 14px', fontSize: 12, fontWeight: 800, color: 'var(--mt-primary-deep)' }}>Doctor Individual</div>
                  <div style={{ padding: '12px 14px', fontSize: 12, fontWeight: 800, color: 'var(--mt-purple-deep)' }}>Clínica Completa</div>
                </div>
                {group.features.map(feature => {
                  const Icon = feature.icon
                  return (
                    <div
                      key={feature.label}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(220px, 1fr) 180px 180px',
                        borderBottom: '1px solid var(--mt-border)',
                        minHeight: 48,
                      }}
                    >
                      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <Icon size={15} color="var(--mt-muted)" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: 'var(--mt-text)', lineHeight: 1.35 }}>{feature.label}</span>
                      </div>
                      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center' }}>
                        <FeatureValue value={feature.doctor} />
                      </div>
                      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center' }}>
                        <FeatureValue value={feature.clinic} />
                      </div>
                    </div>
                  )
                })}
              </section>
            ))}
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '42px 20px 64px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, .8fr) minmax(0, 1.2fr)', gap: 24 }}>
          <div>
            <p className="mt-micro" style={{ color: 'var(--mt-purple)' }}>FAQ</p>
            <h2 className="mt-heading" style={{ marginTop: 8 }}>Preguntas antes de elegir plan</h2>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {[
              ['¿La auditoría es premium?', 'No. La trazabilidad clínica y el registro de actividad son parte de la base de confianza del producto.'],
              ['¿Puedo cambiar de plan después?', 'Sí. El modelo está pensado para empezar como doctor individual y crecer hacia clínica completa cuando agregues equipo.'],
              ['¿Qué pasa si supero pacientes o usuarios?', 'La experiencia ideal es avisar antes del límite y permitir upgrade, no bloquear una operación clínica crítica sin contexto.'],
              ['¿Por qué Clínica Completa cuesta más?', 'Porque agrega coordinación operativa: usuarios, roles, permisos, reportes, sedes, módulos administrativos y soporte prioritario.'],
            ].map(([q, a]) => (
              <details
                key={q}
                style={{
                  border: '1px solid var(--mt-border)',
                  borderRadius: 10,
                  background: 'var(--mt-surface)',
                  padding: '14px 16px',
                }}
              >
                <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--mt-text)', listStyle: 'none' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <HelpCircle size={15} color="var(--mt-purple)" />
                    {q}
                  </span>
                </summary>
                <p style={{ margin: '10px 0 0 23px', fontSize: 13, lineHeight: 1.55, color: 'var(--mt-text-2)' }}>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <style>{`
        @media (max-width: 860px) {
          main section div[style*="repeat(2"] {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          main section div[style*="repeat(3"] {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          main h1 {
            font-size: 32px !important;
          }
          main section div[style*="minmax(220px, 1fr) 180px 180px"] {
            grid-template-columns: minmax(160px, 1fr) 96px 96px !important;
          }
        }
        @media (max-width: 620px) {
          main header nav a:first-child {
            display: none !important;
          }
          main section div[style*="minmax(0, .8fr)"] {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </main>
  )
}
