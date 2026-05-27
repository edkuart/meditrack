import {
  Activity,
  BarChart3,
  BedDouble,
  Building2,
  CheckCircle2,
  Database,
  FileText,
  FlaskConical,
  LockKeyhole,
  ShieldCheck,
  Stethoscope,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type CommercialPlanCode = 'doctor_individual' | 'clinic_complete'
export type BillingPlanCode = CommercialPlanCode | 'free' | 'pro' | 'enterprise'

export interface PricingPlan {
  code: CommercialPlanCode
  name: string
  eyebrow: string
  price: string
  period: string
  description: string
  bestFor: string
  badge?: string
  cta: string
  href: string
  tone: 'blue' | 'purple'
  highlights: string[]
  limits: {
    doctors: string
    staff: string
    patients: string
    storage: string
    support: string
  }
}

export interface PricingFeatureGroup {
  label: string
  features: Array<{
    label: string
    doctor: string | boolean
    clinic: string | boolean
    icon: LucideIcon
  }>
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    code: 'doctor_individual',
    name: 'Doctor Individual',
    eyebrow: 'Consulta privada',
    price: 'Q350',
    period: 'mensuales',
    description:
      'Para un medico o consultorio pequeno que necesita operar pacientes, consultas, tratamientos y portal paciente sin complejidad administrativa.',
    bestFor: 'Ideal para consulta individual',
    cta: 'Empezar como doctor',
    href: '/register?plan=doctor_individual',
    tone: 'blue',
    highlights: [
      'Un doctor principal',
      'Pacientes, consultas SOAP y tratamientos',
      'Portal paciente con QR/PIN',
      'Dashboard clinico simple',
      'Auditoria y seguridad base incluidas',
    ],
    limits: {
      doctors: '1 doctor principal',
      staff: 'Sin personal adicional',
      patients: 'Hasta 500 pacientes activos',
      storage: '10 GB en documentos',
      support: 'Soporte estandar',
    },
  },
  {
    code: 'clinic_complete',
    name: 'Clinica Completa',
    eyebrow: 'Operacion multiusuario',
    price: 'Q1,200',
    period: 'mensuales',
    description:
      'Para clinicas que necesitan coordinar doctores, asistentes, enfermeria, permisos, reportes y operacion interna con trazabilidad.',
    bestFor: 'Mejor valor para equipos',
    badge: 'Recomendado para clinicas',
    cta: 'Configurar clinica',
    href: '/register?plan=clinic_complete',
    tone: 'purple',
    highlights: [
      'Hasta 3 doctores incluidos',
      'Hasta 12 usuarios totales',
      'Roles, permisos y roles personalizados',
      'Analytics, reportes y exportaciones',
      'Laboratorio, hospitalizacion y cumplimiento avanzado',
    ],
    limits: {
      doctors: 'Hasta 3 doctores incluidos',
      staff: 'Hasta 12 usuarios totales',
      patients: 'Hasta 2,500 pacientes activos',
      storage: '50 GB en documentos',
      support: 'Soporte prioritario',
    },
  },
]

export const PRICING_FEATURE_GROUPS: PricingFeatureGroup[] = [
  {
    label: 'Operacion clinica',
    features: [
      { label: 'Pacientes e historia clinica', doctor: true, clinic: true, icon: Stethoscope },
      { label: 'Consultas SOAP y signos vitales', doctor: true, clinic: true, icon: Activity },
      { label: 'Tratamientos, dosis y adherencia', doctor: true, clinic: true, icon: CheckCircle2 },
      { label: 'Portal paciente QR/PIN', doctor: true, clinic: true, icon: LockKeyhole },
      { label: 'Documentos clinicos', doctor: '10 GB', clinic: '50 GB', icon: FileText },
    ],
  },
  {
    label: 'Equipo y organizacion',
    features: [
      { label: 'Doctores incluidos', doctor: '1', clinic: '3', icon: Users },
      { label: 'Usuarios totales', doctor: '1', clinic: '12', icon: Users },
      { label: 'Roles y permisos por usuario', doctor: false, clinic: true, icon: ShieldCheck },
      { label: 'Roles personalizados', doctor: false, clinic: true, icon: ShieldCheck },
      { label: 'Sedes, departamentos y configuracion operativa', doctor: false, clinic: true, icon: Building2 },
    ],
  },
  {
    label: 'Reportes y modulos avanzados',
    features: [
      { label: 'Dashboard clinico', doctor: 'Basico', clinic: 'Avanzado', icon: BarChart3 },
      { label: 'Analytics de adherencia y cohortes', doctor: 'Resumen', clinic: 'Completo', icon: BarChart3 },
      { label: 'Exportacion CSV/reportes', doctor: false, clinic: true, icon: Database },
      { label: 'Laboratorio interno y externo', doctor: 'Basico', clinic: 'Completo', icon: FlaskConical },
      { label: 'Internados / censo hospitalario', doctor: false, clinic: true, icon: BedDouble },
    ],
  },
  {
    label: 'Seguridad, cumplimiento y soporte',
    features: [
      { label: 'Audit log clinico', doctor: true, clinic: true, icon: ShieldCheck },
      { label: 'Consentimientos base', doctor: true, clinic: true, icon: ShieldCheck },
      { label: 'Centro de cumplimiento', doctor: 'Base', clinic: 'Avanzado', icon: ShieldCheck },
      { label: 'Soporte', doctor: 'Estandar', clinic: 'Prioritario', icon: CheckCircle2 },
    ],
  },
]

export function normalizeBillingPlan(plan: BillingPlanCode | string | null | undefined): CommercialPlanCode | 'free' {
  if (plan === 'clinic_complete' || plan === 'enterprise') return 'clinic_complete'
  if (plan === 'doctor_individual' || plan === 'pro') return 'doctor_individual'
  return 'free'
}

export function getPricingPlan(code: CommercialPlanCode): PricingPlan {
  return PRICING_PLANS.find(plan => plan.code === code) ?? PRICING_PLANS[0]
}
