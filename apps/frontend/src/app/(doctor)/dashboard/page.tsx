'use client'

import { useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  Mail,
  Phone,
  Pill,
  Plus,
  Sparkles,
  Stethoscope,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { getClinicSummary, type ClinicSummary } from '@/lib/doctor/analytics-api'
import { listPatients, type Patient } from '@/lib/doctor/api'
import {
  ClinicalButton,
  ClinicalHeader,
  ClinicalInsight,
  ClinicalPage,
  CountUp,
  EmptyClinicalState,
  LoadingState,
  MTAvatar,
  MTPill,
  MTPanel,
  MTProgress,
  PriorityRow,
} from '@/components/doctor/clinical-ui'
import { OnboardingBanner } from '@/components/doctor/OnboardingBanner'

const ADMIN_ROLES = new Set(['ADMIN_CLINIC', 'SUPER_ADMIN'])
const SEX_LABELS: Record<string, string> = { male: 'M', female: 'F', other: 'O' }

function calcAge(dob: string | null): string | null {
  if (!dob) return null
  const diff = Date.now() - new Date(dob).getTime()
  return `${Math.floor(diff / (1000 * 60 * 60 * 24 * 365))} años`
}

// ─────────────────────────────────────────────
// Sparkline (14-day adherence trend)
// ─────────────────────────────────────────────
function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data), min = Math.min(...data)
  const w = 360, h = 64
  const step = w / (data.length - 1)
  const norm = (v: number) => h - ((v - min) / Math.max(1, max - min)) * (h - 8) - 4
  const path = data.map((v, i) => `${i ? 'L' : 'M'}${i * step},${norm(v)}`).join(' ')
  const fill = `${path} L${w},${h} L0,${h} Z`
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="spk-green" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#047857" stopOpacity="0.18" />
          <stop offset="1" stopColor="#047857" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#spk-green)" />
      <path d={path} fill="none" stroke="#047857" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─────────────────────────────────────────────
// QuickAction card
// ─────────────────────────────────────────────
function QuickAction({
  icon: Icon,
  label,
  sub,
  bg,
  fg,
  href,
}: {
  icon: React.ElementType
  label: string
  sub: string
  bg: string
  fg: string
  href: string
}) {
  const [hover, setHover] = useState(false)
  return (
    <a
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14,
        background: hover ? 'var(--mt-elevated)' : 'var(--mt-surface)',
        border: `1px solid ${hover ? fg + '40' : 'var(--mt-border)'}`,
        borderRadius: 10, textAlign: 'left', cursor: 'pointer',
        transition: 'all .2s',
        boxShadow: hover ? 'var(--mt-shadow-sm)' : 'none',
        textDecoration: 'none',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: bg, color: fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text)' }}>{label}</div>
        <div style={{ marginTop: 2, fontSize: 12, color: 'var(--mt-text-2)' }}>{sub}</div>
      </div>
    </a>
  )
}

// ─────────────────────────────────────────────
// Recent patient row
// ─────────────────────────────────────────────
function RecentPatientRow({ patient }: { patient: Patient }) {
  const [hover, setHover] = useState(false)
  const age = calcAge(patient.date_of_birth)

  return (
    <a
      href={`/patients/${patient.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
        background: hover ? 'var(--mt-elevated)' : 'transparent',
        borderBottom: '1px solid var(--mt-border)',
        transition: 'background .2s', cursor: 'pointer', textDecoration: 'none',
      }}
    >
      <MTAvatar name={`${patient.first_name} ${patient.last_name}`} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--mt-text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {patient.first_name} {patient.last_name}
          </span>
          {patient.sex && <MTPill tone="slate" style={{ fontSize: 11, padding: '1px 6px', flexShrink: 0 }}>{SEX_LABELS[patient.sex]}</MTPill>}
        </div>
        <div style={{ marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 13, color: 'var(--mt-text-2)', overflow: 'hidden' }}>
          {age && <span style={{ whiteSpace: 'nowrap' }}>{age}</span>}
          {patient.phone && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <Phone size={12} />{patient.phone}
            </span>
          )}
          {patient.email && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <Mail size={12} />{patient.email}
            </span>
          )}
        </div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke={hover ? 'var(--mt-text)' : 'var(--mt-muted)'}
        strokeWidth="2" style={{ transition: 'stroke .2s', flexShrink: 0 }}>
        <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  )
}

// ─────────────────────────────────────────────
// Dose progress bar
// ─────────────────────────────────────────────
function DoseProgressSection({
  confirmed,
  total,
  missed,
  pending,
}: {
  confirmed: number
  total: number
  missed: number
  pending: number
}) {
  const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0
  const tone = pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'red'

  return (
    <div className="mt-grid-halves">
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 16 }}>
          <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--mt-text)', letterSpacing: '-0.02em' }}>
            <CountUp value={pct} />
          </span>
          <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--mt-text-2)' }}>%</span>
          <MTPill tone={tone} style={{ marginLeft: 8 }}>
            {pct >= 80 ? 'Meta alcanzada' : pct >= 50 ? 'En curso' : 'Atención requerida'}
          </MTPill>
        </div>
        <MTProgress value={pct} tone={tone} height={8} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          { label: 'Confirmadas', value: confirmed, color: 'var(--mt-success)' },
          { label: 'Pendientes',  value: pending,   color: 'var(--mt-warning)' },
          { label: 'Perdidas',    value: missed,    color: 'var(--mt-danger)' },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color }} />
              <span style={{ fontSize: 13 }}>{row.label}</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{row.value}</span>
          </div>
        ))}
        <div style={{ height: 1, background: 'var(--mt-border)', margin: '4px 0' }} />
        <div style={{ fontSize: 12, color: 'var(--mt-text-2)', lineHeight: 1.5 }}>
          Meta clínica: <strong style={{ color: 'var(--mt-text)' }}>≥ 80%</strong> de adherencia mensual.
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Dashboard page
// ─────────────────────────────────────────────
export default function DashboardPage() {
  const { token, user } = useAuth()
  const [summary, setSummary] = useState<ClinicSummary | null>(null)
  const [recentPatients, setRecentPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const today = new Date().toLocaleDateString('es', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  useEffect(() => {
    if (!token) return
    setLoading(true)
    setError('')
    Promise.all([
      getClinicSummary(token),
      listPatients(token, undefined, 1, 6).catch(() => ({
        patients: [], meta: { page: 1, limit: 6, total: 0, pages: 1 },
      })),
    ])
      .then(([clinicSummary, patientPage]) => {
        setSummary(clinicSummary)
        setRecentPatients(patientPage.patients)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [token])

  const adherencePct = summary && summary.today_doses_total > 0
    ? Math.round((summary.today_doses_confirmed / summary.today_doses_total) * 100)
    : 0
  const adherenceTone = adherencePct >= 80 ? 'green' : summary?.today_doses_missed ? 'red' : 'amber'

  return (
    <ClinicalPage>
      <ClinicalHeader
        eyebrow="Centro clínico"
        title="Panel operativo"
        subtitle="Vista rápida de pacientes, tratamientos y adherencia del día."
        meta={
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--mt-text-2)' }}>
            <CalendarCheck size={14} color="var(--mt-muted)" />
            {today}
          </span>
        }
        actions={
          <>
            <ClinicalButton href="/patients" icon={Users} variant="outline">
              Buscar paciente
            </ClinicalButton>
            <ClinicalButton href="/patients/new" icon={Plus}>
              Nuevo paciente
            </ClinicalButton>
          </>
        }
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <div style={{
          background: 'var(--mt-danger-subtle)', color: 'var(--mt-danger)',
          fontSize: 14, borderRadius: 10, padding: 16,
        }}>{error}</div>
      ) : summary ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <OnboardingBanner />

          {/* 2×3 stat strip */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            border: '1px solid var(--mt-border)', borderRadius: 12,
            background: 'var(--mt-surface)', overflow: 'hidden',
            boxShadow: 'var(--mt-shadow-sm)',
          }}>
            {[
              { Icon: Users,       value: summary.active_patients,            label: 'Pacientes activos',     sub: `${summary.total_patients} totales`,           color: '#1e40af' },
              { Icon: Stethoscope, value: summary.active_treatments,          label: 'Tratamientos activos',  sub: 'bajo seguimiento',                            color: '#047857' },
              { Icon: UserPlus,    value: summary.monthly_new_patients,       label: 'Nuevos este mes',       sub: 'registrados este mes',                        color: '#b45309' },
              { Icon: Pill,        value: summary.today_doses_confirmed,      label: 'Dosis confirmadas',     sub: `de ${summary.today_doses_total} programadas`,  color: adherenceTone === 'red' ? '#b91c1c' : adherenceTone === 'green' ? '#047857' : '#b45309' },
              { Icon: BedDouble,   value: summary.active_admissions,          label: 'Pacientes internados',  sub: 'censo hospitalario activo',                   color: '#6b21a8' },
              { Icon: ArrowUpDown, value: summary.pending_incoming_referrals, label: 'Referencias pendientes', sub: 'esperando tu respuesta',                    color: summary.pending_incoming_referrals > 0 ? '#b91c1c' : '#64748b' },
            ].map(({ Icon, value, label, sub, color }, i) => (
              <div key={label} style={{
                padding: '12px 14px',
                borderLeft: i % 2 === 1 ? '1px solid var(--mt-border)' : 'none',
                borderTop: i >= 2 ? '1px solid var(--mt-border)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Icon size={13} color={color} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--mt-text-2)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{label}</span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--mt-text)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                  <CountUp value={value} />
                </div>
                <p style={{ fontSize: 11, color: 'var(--mt-text-2)', marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{sub}</p>
              </div>
            ))}
          </div>

          {/* Two-column body */}
          <div className="mt-grid-body">
            {/* Left column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              {/* Prioridades clínicas */}
              <MTPanel
                title="Prioridades clínicas"
                icon={ClipboardList}
                accent="red"
                collapsible
                defaultOpen={false}
              >
                {summary.pending_incoming_referrals > 0 && (
                  <PriorityRow
                    icon={ArrowUpDown}
                    title="Referencias sin responder"
                    subtitle="Pacientes derivados hacia ti que esperan aceptación."
                    badge={`${summary.pending_incoming_referrals} pendientes`}
                    badgeTone="red"
                    value={String(summary.pending_incoming_referrals)}
                    valueTone="red"
                    tone="red"
                    critical
                    href="/referrals"
                  />
                )}
                {summary.today_doses_missed > 0 && (
                  <PriorityRow
                    icon={AlertCircle}
                    title="Dosis perdidas hoy"
                    subtitle="Pacientes que no confirmaron sus dosis programadas."
                    badge={`${summary.today_doses_missed} dosis`}
                    badgeTone="red"
                    value={String(summary.today_doses_missed)}
                    valueTone="red"
                    tone="red"
                    critical
                    href="/patients/alerts/missed-doses"
                  />
                )}
                {summary.today_doses_pending > 0 && (
                  <PriorityRow
                    icon={Clock3}
                    title="Dosis pendientes hoy"
                    subtitle="Pacientes con dosis aún no confirmadas hoy."
                    badge={`${summary.today_doses_pending} pendientes`}
                    badgeTone="amber"
                    value={String(summary.today_doses_pending)}
                    valueTone="amber"
                    tone="amber"
                    href="/patients/alerts/pending-doses"
                  />
                )}
                {summary.active_treatments > 0 && (
                  <PriorityRow
                    icon={ClipboardList}
                    title="Tratamientos activos"
                    subtitle="Pacientes bajo seguimiento terapéutico activo."
                    badge={`${summary.active_treatments} activos`}
                    badgeTone="blue"
                    value={String(summary.active_treatments)}
                    valueTone="blue"
                    tone="blue"
                    href="/patients/alerts/active-treatments"
                  />
                )}
                {summary.pending_incoming_referrals === 0 &&
                  summary.today_doses_missed === 0 &&
                  summary.today_doses_pending === 0 &&
                  summary.active_treatments === 0 && (
                    <EmptyClinicalState
                      icon={CheckCircle2}
                      title="Sin prioridades críticas"
                      description="No hay dosis pendientes ni alertas clínicas para hoy."
                    />
                  )}
              </MTPanel>

              {/* Adherencia del día */}
              {summary.today_doses_total > 0 && (
                <MTPanel
                  title="Adherencia del día"
                  icon={CheckCircle2}
                  accent="green"
                  padBody
                  collapsible
                  defaultOpen={false}
                  actions={
                    user && ADMIN_ROLES.has(user.role) ? (
                      <ClinicalButton href="/analytics" variant="ghost" size="sm" iconRight={ArrowRight}>
                        Detalle
                      </ClinicalButton>
                    ) : undefined
                  }
                >
                  <DoseProgressSection
                    confirmed={summary.today_doses_confirmed}
                    total={summary.today_doses_total}
                    missed={summary.today_doses_missed}
                    pending={summary.today_doses_pending}
                  />
                </MTPanel>
              )}
            </div>

            {/* Right column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              {/* Pacientes recientes */}
              <MTPanel
                title="Pacientes recientes"
                icon={Users}
                accent="blue"
                collapsible
                defaultOpen={false}
                actions={
                  <ClinicalButton href="/patients" variant="ghost" size="sm" iconRight={ArrowRight}>
                    Ver todos
                  </ClinicalButton>
                }
              >
                {recentPatients.length > 0 ? (
                  <div>
                    {recentPatients.map((p, i) => (
                      <div key={p.id} style={{ borderBottom: i === recentPatients.length - 1 ? 'none' : '1px solid var(--mt-border)' }}>
                        <RecentPatientRow patient={p} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyClinicalState
                    icon={Users}
                    title="Sin pacientes recientes"
                    description="Cuando registres pacientes, aparecerán aquí para acceso rápido."
                  />
                )}
              </MTPanel>

              {/* Acciones rápidas */}
              <MTPanel title="Acciones rápidas" icon={Sparkles} accent="purple" padBody collapsible defaultOpen={false}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <QuickAction
                    icon={UserPlus} label="Registrar paciente" sub="Nueva ficha clínica"
                    bg="#eff6ff" fg="#1e40af" href="/patients/new"
                  />
                  <QuickAction
                    icon={Stethoscope} label="Ver pacientes" sub="Lista completa"
                    bg="#ecfdf5" fg="#047857" href="/patients"
                  />
                  <QuickAction
                    icon={BedDouble} label="Censo hospitalario" sub="Pacientes internados"
                    bg="#faf5ff" fg="#6b21a8" href="/hospital"
                  />
                  <QuickAction
                    icon={ArrowUpDown} label="Referencias" sub="Bandeja de referidos"
                    bg="#fff1f2" fg="#be123c" href="/referrals"
                  />
                  {user && ADMIN_ROLES.has(user.role) && (
                    <>
                      <QuickAction
                        icon={TrendingUp} label="Analítica" sub="Reportes de adherencia"
                        bg="#fffbeb" fg="#b45309" href="/analytics"
                      />
                      <QuickAction
                        icon={FileText} label="Auditoría" sub="Registros de actividad"
                        bg="#f8fafc" fg="#475569" href="/settings/audit"
                      />
                    </>
                  )}
                </div>
              </MTPanel>
            </div>
          </div>

          {summary.pending_incoming_referrals > 0 && (
            <ClinicalInsight tone="red" title="Referencias sin responder">
              Tienes {summary.pending_incoming_referrals} referencia{summary.pending_incoming_referrals > 1 ? 's' : ''} entrante{summary.pending_incoming_referrals > 1 ? 's' : ''} pendiente{summary.pending_incoming_referrals > 1 ? 's' : ''} de respuesta.
              Acepta o rechaza desde la bandeja de referencias.
            </ClinicalInsight>
          )}
          {summary.today_doses_missed > 0 && (
            <ClinicalInsight tone="amber" title="Seguimiento sugerido">
              Hay {summary.today_doses_missed} dosis marcadas como perdidas hoy. Prioriza contactar
              a los pacientes con tratamiento activo antes del cierre del día.
            </ClinicalInsight>
          )}

          {summary.total_patients === 0 && (
            <EmptyClinicalState
              icon={Users}
              title="Aún no hay pacientes"
              description="Comienza agregando tu primer paciente y crea su plan de tratamiento desde una consulta clínica."
              action={<ClinicalButton href="/patients/new" icon={Plus}>Nuevo paciente</ClinicalButton>}
            />
          )}
        </div>
      ) : null}
    </ClinicalPage>
  )
}
