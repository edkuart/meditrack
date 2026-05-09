'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Mail,
  Phone,
  Plus,
  Search,
  TrendingUp,
  UserCog,
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
  ClinicalPanel,
  EmptyClinicalState,
  LoadingState,
  MetricCard,
  StatusPill,
} from '@/components/doctor/clinical-ui'
import { OnboardingBanner } from '@/components/doctor/OnboardingBanner'

const ADMIN_ROLES = new Set(['ADMIN_CLINIC', 'SUPER_ADMIN'])
const SEX_LABELS: Record<string, string> = { male: 'M', female: 'F', other: 'O' }

type PriorityTone = 'green' | 'amber' | 'red' | 'blue'

interface ClinicalPriority {
  id: string
  title: string
  detail: string
  value: string
  href: string
  tone: PriorityTone
  icon: typeof AlertTriangle
}

function calcAge(dob: string | null): string | null {
  if (!dob) return null
  const diff = Date.now() - new Date(dob).getTime()
  return `${Math.floor(diff / (1000 * 60 * 60 * 24 * 365))} años`
}

function buildPriorities(summary: ClinicSummary): ClinicalPriority[] {
  const priorities: ClinicalPriority[] = []

  if (summary.today_doses_missed > 0) {
    priorities.push({
      id: 'missed-doses',
      title: 'Dosis perdidas',
      detail: 'Revisar barreras de adherencia y contacto oportuno.',
      value: String(summary.today_doses_missed),
      href: '/patients',
      tone: 'red',
      icon: AlertTriangle,
    })
  }

  if (summary.today_doses_pending > 0) {
    priorities.push({
      id: 'pending-doses',
      title: 'Dosis pendientes hoy',
      detail: 'Mantener seguimiento de confirmaciones antes del cierre.',
      value: String(summary.today_doses_pending),
      href: '/patients',
      tone: 'amber',
      icon: Clock3,
    })
  }

  if (summary.active_treatments > 0) {
    priorities.push({
      id: 'active-treatments',
      title: 'Tratamientos activos',
      detail: 'Pacientes actualmente bajo seguimiento terapéutico.',
      value: String(summary.active_treatments),
      href: '/patients',
      tone: 'blue',
      icon: ClipboardList,
    })
  }

  if (summary.today_doses_total > 0 && summary.today_doses_confirmed === summary.today_doses_total) {
    priorities.push({
      id: 'all-confirmed',
      title: 'Dosis del día completas',
      detail: 'No hay confirmaciones pendientes registradas.',
      value: '100%',
      href: '/patients',
      tone: 'green',
      icon: CheckCircle2,
    })
  }

  if (summary.monthly_new_patients > 0) {
    priorities.push({
      id: 'new-patients',
      title: 'Pacientes nuevos',
      detail: 'Completar primera consulta y plan si corresponde.',
      value: String(summary.monthly_new_patients),
      href: '/patients',
      tone: 'blue',
      icon: TrendingUp,
    })
  }

  return priorities.slice(0, 4)
}

function DoseProgressBar({ confirmed, total }: { confirmed: number; total: number }) {
  const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0
  const color = pct >= 80 ? 'bg-green-400' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarCheck size={16} className="text-slate-500" />
          <h3 className="font-semibold text-slate-800">Dosis de hoy</h3>
        </div>
        <span className="text-sm font-bold text-slate-700">{pct}%</span>
      </div>

      <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" />
          Confirmadas: <strong className="text-slate-700 ml-1">{confirmed}</strong>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 inline-block" />
          Total: <strong className="text-slate-700 ml-1">{total}</strong>
        </span>
      </div>
    </div>
  )
}

function PriorityCard({ item }: { item: ClinicalPriority }) {
  const Icon = item.icon
  const toneClasses: Record<PriorityTone, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    red: 'bg-rose-50 text-rose-700 border-rose-100',
  }

  return (
    <Link
      href={item.href}
      className="group flex items-center gap-3 border-b border-slate-100 px-5 py-4 transition-colors last:border-b-0 hover:bg-slate-50"
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${toneClasses[item.tone]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-800">{item.title}</p>
          <StatusPill tone={item.tone === 'red' ? 'red' : item.tone === 'amber' ? 'amber' : item.tone === 'green' ? 'green' : 'blue'}>
            {item.value}
          </StatusPill>
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">{item.detail}</p>
      </div>
      <ArrowRight size={16} className="shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
    </Link>
  )
}

function RecentPatientRow({ patient }: { patient: Patient }) {
  const age = calcAge(patient.date_of_birth)

  return (
    <Link
      href={`/patients/${patient.id}`}
      className="group flex items-center gap-3 border-b border-slate-100 px-5 py-3.5 transition-colors last:border-b-0 hover:bg-slate-50"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-semibold text-blue-600">
        {patient.first_name[0]}{patient.last_name[0]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-800">
            {patient.first_name} {patient.last_name}
          </p>
          {patient.sex && <StatusPill>{SEX_LABELS[patient.sex]}</StatusPill>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          {age && <span>{age}</span>}
          {patient.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone size={12} />
              {patient.phone}
            </span>
          )}
          {patient.email && (
            <span className="inline-flex items-center gap-1">
              <Mail size={12} />
              {patient.email}
            </span>
          )}
        </div>
      </div>
      <ArrowRight size={16} className="shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
    </Link>
  )
}

export default function DashboardPage() {
  const { token, user } = useAuth()
  const [summary, setSummary] = useState<ClinicSummary | null>(null)
  const [recentPatients, setRecentPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    setLoading(true)
    setError('')
    Promise.all([
      getClinicSummary(token),
      listPatients(token, undefined, 1, 6).catch(() => ({ patients: [], meta: { page: 1, limit: 6, total: 0, pages: 1 } })),
    ])
      .then(([clinicSummary, patientPage]) => {
        setSummary(clinicSummary)
        setRecentPatients(patientPage.patients)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [token])

  return (
    <ClinicalPage>
      <ClinicalHeader
        eyebrow="Centro clínico"
        title="Panel operativo"
        subtitle="Vista rápida de pacientes, tratamientos y adherencia del día para priorizar seguimiento clínico."
        icon={Activity}
        meta={<span>{new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>}
        actions={
          <>
            <ClinicalButton href="/patients" icon={Search} variant="outline" tone="slate">
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
        <div className="bg-red-50 text-red-600 text-sm rounded-xl p-4">{error}</div>
      ) : summary ? (
        <div className="flex flex-col gap-4">
          <OnboardingBanner />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard
              icon={Users}
              label="Pacientes activos"
              value={summary.active_patients}
              helper={`${summary.total_patients} totales`}
              tone="blue"
            />
            <MetricCard
              icon={Activity}
              label="Tratamientos activos"
              value={summary.active_treatments}
              tone="green"
            />
            <MetricCard
              icon={TrendingUp}
              label="Nuevos este mes"
              value={summary.monthly_new_patients}
              tone="amber"
            />
            <MetricCard
              icon={CalendarCheck}
              label="Dosis confirmadas hoy"
              value={summary.today_doses_confirmed}
              helper={`de ${summary.today_doses_total} programadas`}
              tone={summary.today_doses_total > 0 && (summary.today_doses_confirmed / summary.today_doses_total) >= 0.8 ? 'green' : summary.today_doses_missed > 0 ? 'red' : 'amber'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
            <div className="flex flex-col gap-4">
              <ClinicalPanel title="Prioridades clínicas" icon={ClipboardList}>
                {buildPriorities(summary).length > 0 ? (
                  <div>
                    {buildPriorities(summary).map(item => <PriorityCard key={item.id} item={item} />)}
                  </div>
                ) : (
                  <EmptyClinicalState
                    icon={CheckCircle2}
                    title="Sin prioridades críticas"
                    description="No hay dosis pendientes ni alertas clínicas derivadas del resumen del día."
                  />
                )}
              </ClinicalPanel>

              {summary.today_doses_total > 0 && (
                <ClinicalPanel title="Adherencia del día" icon={CalendarCheck}>
                  <DoseProgressBar
                    confirmed={summary.today_doses_confirmed}
                    total={summary.today_doses_total}
                  />
                </ClinicalPanel>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <ClinicalPanel
                title="Pacientes recientes"
                icon={Users}
                actions={
                  <ClinicalButton href="/patients" icon={Search} variant="ghost" tone="slate">
                    Ver todos
                  </ClinicalButton>
                }
              >
                {recentPatients.length > 0 ? (
                  <div>
                    {recentPatients.map(patient => <RecentPatientRow key={patient.id} patient={patient} />)}
                  </div>
                ) : (
                  <EmptyClinicalState
                    icon={Users}
                    title="Sin pacientes recientes"
                    description="Cuando registres pacientes, aparecerán aquí para acceso rápido."
                  />
                )}
              </ClinicalPanel>

              <ClinicalPanel title="Acciones rápidas" icon={Activity}>
                <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <ClinicalButton href="/patients/new" icon={Plus}>
                    Nuevo paciente
                  </ClinicalButton>
                  <ClinicalButton href="/patients" icon={Search} variant="outline" tone="slate">
                    Buscar paciente
                  </ClinicalButton>
                  {user && ADMIN_ROLES.has(user.role) && (
                    <ClinicalButton href="/staff" icon={UserCog} variant="outline" tone="slate">
                      Equipo clínico
                    </ClinicalButton>
                  )}
                </div>
              </ClinicalPanel>
            </div>
          </div>

          {summary.today_doses_missed > 0 && (
            <ClinicalInsight tone="amber" title="Seguimiento sugerido">
              Hay {summary.today_doses_missed} dosis marcadas como perdidas hoy. Prioriza contactar a los pacientes con tratamiento activo antes del cierre del día.
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
