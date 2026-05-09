'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  Info,
  Loader2,
  type LucideIcon,
} from 'lucide-react'

type Tone = 'blue' | 'green' | 'amber' | 'red' | 'slate'

const toneClasses: Record<Tone, {
  soft: string
  text: string
  border: string
  solid: string
}> = {
  blue: {
    soft: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-100',
    solid: 'bg-blue-500 text-white',
  },
  green: {
    soft: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-100',
    solid: 'bg-emerald-500 text-white',
  },
  amber: {
    soft: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-100',
    solid: 'bg-amber-500 text-white',
  },
  red: {
    soft: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-100',
    solid: 'bg-rose-500 text-white',
  },
  slate: {
    soft: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200',
    solid: 'bg-slate-700 text-white',
  },
}

export function ClinicalPage({
  children,
  size = 'wide',
}: {
  children: ReactNode
  size?: 'compact' | 'wide'
}) {
  return (
    <div className={`mx-auto flex w-full flex-col gap-5 px-4 py-6 sm:px-6 lg:py-8 ${
      size === 'compact' ? 'max-w-3xl' : 'max-w-6xl'
    }`}>
      {children}
    </div>
  )
}

export function ClinicalHeader({
  title,
  subtitle,
  eyebrow,
  icon: Icon,
  actions,
  meta,
}: {
  title: string
  subtitle?: string
  eyebrow?: string
  icon?: LucideIcon
  actions?: ReactNode
  meta?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 gap-3">
        {Icon && (
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Icon size={20} />
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{eyebrow}</p>}
          <h1 className="truncate text-2xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p>}
          {meta && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">{meta}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function ClinicalButton({
  children,
  icon: Icon,
  tone = 'blue',
  variant = 'solid',
  disabled,
  onClick,
  href,
  type = 'button',
}: {
  children: ReactNode
  icon?: LucideIcon
  tone?: Tone
  variant?: 'solid' | 'soft' | 'outline' | 'ghost'
  disabled?: boolean
  onClick?: () => void
  href?: string
  type?: 'button' | 'submit'
}) {
  const classes = [
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
    disabled ? 'cursor-not-allowed opacity-50' : '',
    variant === 'solid' ? toneClasses[tone].solid : '',
    variant === 'soft' ? `${toneClasses[tone].soft} ${toneClasses[tone].text}` : '',
    variant === 'outline' ? `border bg-white ${toneClasses[tone].border} ${toneClasses[tone].text}` : '',
    variant === 'ghost' ? `${toneClasses[tone].text} hover:${toneClasses[tone].soft}` : '',
  ].join(' ')

  const content = (
    <>
      {Icon && <Icon size={16} />}
      <span>{children}</span>
    </>
  )

  if (href) {
    return (
      <Link href={href} className={classes} aria-disabled={disabled}>
        {content}
      </Link>
    )
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
      {content}
    </button>
  )
}

export function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = 'blue',
}: {
  label: string
  value: number | string
  helper?: string
  icon: LucideIcon
  tone?: Tone
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClasses[tone].soft} ${toneClasses[tone].text}`}>
          <Icon size={18} />
        </div>
      </div>
      {helper && <p className="mt-3 text-xs text-slate-400">{helper}</p>}
    </div>
  )
}

export function StatusPill({
  children,
  tone = 'slate',
  icon: Icon,
}: {
  children: ReactNode
  tone?: Tone
  icon?: LucideIcon
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${toneClasses[tone].soft} ${toneClasses[tone].text} ${toneClasses[tone].border}`}>
      {Icon && <Icon size={13} />}
      {children}
    </span>
  )
}

export function ClinicalPanel({
  title,
  icon: Icon,
  actions,
  children,
}: {
  title: string
  icon?: LucideIcon
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon size={16} className="shrink-0 text-slate-500" />}
          <h2 className="truncate font-semibold text-slate-900">{title}</h2>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

export function LoadingState({ label = 'Cargando información clínica...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
      <Loader2 size={20} className="animate-spin" />
      {label}
    </div>
  )
}

export function EmptyClinicalState({
  title,
  description,
  icon: Icon = FileText,
  action,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
        <Icon size={22} />
      </div>
      <p className="font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm leading-6 text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ClinicalInsight({
  tone = 'blue',
  title,
  children,
}: {
  tone?: Tone
  title: string
  children: ReactNode
}) {
  const Icon = tone === 'green' ? CheckCircle2 : tone === 'amber' ? Clock3 : tone === 'red' ? AlertTriangle : Info

  return (
    <div className={`rounded-lg border p-4 ${toneClasses[tone].soft} ${toneClasses[tone].border}`}>
      <div className={`mb-1 flex items-center gap-2 text-sm font-semibold ${toneClasses[tone].text}`}>
        <Icon size={16} />
        {title}
      </div>
      <div className="text-sm leading-6 text-slate-600">{children}</div>
    </div>
  )
}

export interface TimelineItem {
  id: string
  title: string
  subtitle?: string
  date: string
  tone?: Tone
  href?: string
}

export function ClinicalTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="divide-y divide-slate-100">
      {items.map(item => {
        const content = (
          <div className="flex gap-3 px-5 py-4 transition-colors hover:bg-slate-50">
            <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${toneClasses[item.tone ?? 'blue'].solid}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
              {item.subtitle && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.subtitle}</p>}
            </div>
            <time className="shrink-0 text-xs text-slate-400">{item.date}</time>
          </div>
        )

        if (item.href) {
          return (
            <Link key={item.id} href={item.href} className="block">
              {content}
            </Link>
          )
        }

        return <div key={item.id}>{content}</div>
      })}
    </div>
  )
}
