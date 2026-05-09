'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
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

// ─────────────────────────────────────────────
// Tone system — matches design spec
// ─────────────────────────────────────────────
export type Tone = 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'purple' | 'sky'

const TONES: Record<Tone, { bg: string; fg: string; bd: string }> = {
  blue:   { bg: '#eff6ff', fg: '#1e40af', bd: '#bfdbfe' },
  green:  { bg: '#ecfdf5', fg: '#047857', bd: '#a7f3d0' },
  amber:  { bg: '#fffbeb', fg: '#b45309', bd: '#fde68a' },
  red:    { bg: '#fef2f2', fg: '#b91c1c', bd: '#fecaca' },
  slate:  { bg: '#f1f5f9', fg: '#475569', bd: '#e2e8f0' },
  purple: { bg: '#faf5ff', fg: '#6b21a8', bd: '#e9d5ff' },
  sky:    { bg: '#f0f9ff', fg: '#075985', bd: '#bae6fd' },
}

// ─────────────────────────────────────────────
// MTLogo
// ─────────────────────────────────────────────
export function MTLogo({ size = 16, mono = false }: { size?: number; mono?: boolean }) {
  const color = mono ? '#fff' : 'var(--mt-primary)'
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <svg width={size + 8} height={size + 8} viewBox="0 0 24 24" fill="none">
        <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill={mono ? 'rgba(255,255,255,.15)' : 'var(--mt-primary)'} />
        <path d="M5 13 H8 L9.5 9.5 L11.5 16 L13 12 H19"
          stroke="#fff" strokeWidth="1.8" fill="none"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{
        fontSize: size, fontWeight: 700, letterSpacing: '-0.02em',
        color, fontFamily: 'var(--mt-font)',
      }}>meditrack</span>
    </div>
  )
}

// ─────────────────────────────────────────────
// MTAvatar — colored-initials circle
// ─────────────────────────────────────────────
const AVATAR_TONES = [
  { bg: '#dbeafe', fg: '#1a56db' },
  { bg: '#d1fae5', fg: '#059669' },
  { bg: '#fef3c7', fg: '#b45309' },
  { bg: '#fee2e2', fg: '#b91c1c' },
  { bg: '#e0e7ff', fg: '#4338ca' },
  { bg: '#f3e8ff', fg: '#7e22ce' },
  { bg: '#cffafe', fg: '#0e7490' },
]
function hashIdx(s: string, n: number) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) >>> 0)
  return h % n
}

export function MTAvatar({
  name = '?',
  size = 32,
  square = false,
  tone,
}: {
  name?: string
  size?: number
  square?: boolean
  tone?: { bg: string; fg: string }
}) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?'
  const t = tone ?? AVATAR_TONES[hashIdx(name, AVATAR_TONES.length)]
  return (
    <div style={{
      width: size, height: size,
      borderRadius: square ? Math.round(size * 0.25) : '50%',
      background: t.bg, color: t.fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 600, fontSize: Math.round(size * 0.4),
      letterSpacing: '0.01em', flexShrink: 0,
    }}>{initials}</div>
  )
}

// ─────────────────────────────────────────────
// MTPill (replaces StatusPill)
// ─────────────────────────────────────────────
export function MTPill({
  tone = 'slate',
  children,
  dot = false,
  pulse = false,
  icon: Icon,
  style,
}: {
  tone?: Tone
  children: ReactNode
  dot?: boolean
  pulse?: boolean
  icon?: LucideIcon
  style?: React.CSSProperties
}) {
  const t = TONES[tone]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '2px 10px', borderRadius: 999,
      background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
      fontSize: 12, fontWeight: 500, lineHeight: 1.5, whiteSpace: 'nowrap',
      ...style,
    }}>
      {dot && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: t.fg, flexShrink: 0,
          animation: pulse ? 'mt-pulse-dot 1.4s infinite ease-in-out' : 'none',
        }} />
      )}
      {Icon && <Icon size={11} />}
      {children}
    </span>
  )
}

// Keep old name as alias
export const StatusPill = MTPill

// ─────────────────────────────────────────────
// MTButton (replaces ClinicalButton)
// ─────────────────────────────────────────────
export function MTButton({
  children,
  icon: Icon,
  iconRight: IconRight,
  tone = 'blue',
  variant = 'solid',
  size = 'md',
  disabled,
  onClick,
  href,
  type = 'button',
  style,
}: {
  children?: ReactNode
  icon?: LucideIcon
  iconRight?: LucideIcon
  tone?: Tone
  variant?: 'solid' | 'soft' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  onClick?: () => void
  href?: string
  type?: 'button' | 'submit'
  style?: React.CSSProperties
}) {
  const [hover, setHover] = useState(false)
  const [pressed, setPressed] = useState(false)

  const sizeMap = {
    sm: { pad: '6px 10px', fs: 13, h: 30, gap: 6, icon: 13 },
    md: { pad: '8px 14px', fs: 13, h: 36, gap: 8, icon: 14 },
    lg: { pad: '10px 18px', fs: 14, h: 42, gap: 8, icon: 15 },
  }[size]

  let bg: string, fg: string, bd: string, sh: string
  if (variant === 'solid') {
    bg = hover ? 'var(--mt-primary-hover)' : 'var(--mt-primary)'
    fg = '#fff'; bd = 'transparent'
    sh = hover ? '0 4px 12px rgba(26,86,219,.30)' : '0 1px 3px rgba(26,86,219,.25)'
  } else if (variant === 'outline') {
    bg = hover ? 'var(--mt-elevated)' : 'var(--mt-surface)'
    fg = 'var(--mt-text-2)'; bd = hover ? 'var(--mt-border-2)' : 'var(--mt-border)'
    sh = 'var(--mt-shadow-xs)'
  } else if (variant === 'ghost') {
    bg = hover ? 'var(--mt-elevated)' : 'transparent'
    fg = 'var(--mt-text-2)'; bd = 'transparent'; sh = 'none'
  } else if (variant === 'soft') {
    bg = TONES[tone].bg; fg = TONES[tone].fg; bd = 'transparent'; sh = 'none'
  } else {
    // danger
    bg = hover ? '#b91c1c' : 'var(--mt-danger)'; fg = '#fff'; bd = 'transparent'
    sh = '0 1px 3px rgba(220,38,38,.30)'
  }

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: sizeMap.gap,
    padding: sizeMap.pad, height: sizeMap.h, fontSize: sizeMap.fs, fontWeight: 500,
    border: `1px solid ${bd}`, background: bg, color: fg, borderRadius: 8,
    boxShadow: sh, transition: 'background .2s, color .2s, box-shadow .2s, transform .1s, border-color .2s',
    transform: pressed ? 'scale(.97)' : 'scale(1)',
    whiteSpace: 'nowrap', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, fontFamily: 'var(--mt-font)',
    ...style,
  }

  const handlers = disabled ? {} : {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => { setHover(false); setPressed(false) },
    onMouseDown: () => setPressed(true),
    onMouseUp: () => setPressed(false),
  }

  const content = (
    <>
      {Icon && <Icon size={sizeMap.icon} />}
      {children && <span>{children}</span>}
      {IconRight && <IconRight size={sizeMap.icon} />}
    </>
  )

  if (href) {
    return (
      <Link href={href} style={baseStyle} aria-disabled={disabled} {...handlers}>
        {content}
      </Link>
    )
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} style={baseStyle} {...handlers}>
      {content}
    </button>
  )
}

// Keep old name as alias
export const ClinicalButton = MTButton

// ─────────────────────────────────────────────
// MTPanel (replaces ClinicalPanel)
// ─────────────────────────────────────────────
export function MTPanel({
  title,
  icon: Icon,
  accent = 'blue',
  actions,
  children,
  padBody = false,
  style,
}: {
  title: string
  icon?: LucideIcon
  accent?: Tone
  actions?: ReactNode
  children: ReactNode
  padBody?: boolean
  style?: React.CSSProperties
}) {
  const t = TONES[accent]
  return (
    <section style={{
      background: 'var(--mt-surface)',
      border: '1px solid var(--mt-border)',
      borderRadius: 12,
      boxShadow: 'var(--mt-shadow-sm)',
      overflow: 'hidden',
      borderTop: `3px solid ${t.fg}`,
      ...style,
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 20px', borderBottom: '1px solid var(--mt-border)',
      }}>
        {Icon && (
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'var(--mt-elevated)', color: 'var(--mt-text-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon size={16} />
          </div>
        )}
        <h3 className="mt-subheading" style={{ flex: 1 }}>{title}</h3>
        {actions}
      </header>
      <div style={padBody ? { padding: 20 } : undefined}>{children}</div>
    </section>
  )
}

// Keep old name as alias
export const ClinicalPanel = MTPanel

// ─────────────────────────────────────────────
// MTInput — labeled text input with focus glow
// ─────────────────────────────────────────────
export function MTInput({
  label,
  hint,
  error,
  icon: Icon,
  prefix,
  suffix,
  style,
  ...rest
}: {
  label?: string
  hint?: string
  error?: string
  icon?: LucideIcon
  prefix?: ReactNode
  suffix?: ReactNode
  style?: React.CSSProperties
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'>) {
  const [focus, setFocus] = useState(false)
  const bd = error ? 'var(--mt-danger)' : focus ? 'var(--mt-primary)' : 'var(--mt-border)'
  const sh = focus ? 'var(--mt-shadow-focus)' : 'var(--mt-shadow-xs)'

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {label && (
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text-2)' }}>{label}</span>
      )}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px', height: 40, borderRadius: 8,
        border: `1px solid ${bd}`,
        background: focus ? 'var(--mt-surface)' : 'var(--mt-bg)',
        boxShadow: sh, transition: 'all .2s',
      }}>
        {Icon && <Icon size={16} color="var(--mt-muted)" />}
        {prefix}
        <input
          {...rest}
          onFocus={(e) => { setFocus(true); rest.onFocus?.(e) }}
          onBlur={(e) => { setFocus(false); rest.onBlur?.(e) }}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 14, color: 'var(--mt-text)', height: '100%', minWidth: 0,
            fontFamily: 'var(--mt-font)',
          }}
        />
        {suffix}
      </div>
      {hint && !error && <span style={{ fontSize: 12, color: 'var(--mt-muted)' }}>{hint}</span>}
      {error && <span style={{ fontSize: 12, color: 'var(--mt-danger)' }}>{error}</span>}
    </label>
  )
}

// ─────────────────────────────────────────────
// CountUp — animated number
// ─────────────────────────────────────────────
export function CountUp({
  value,
  duration = 800,
  suffix: sfx,
}: {
  value: number
  duration?: number
  suffix?: string
}) {
  const [v, setV] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    let start: number | null = null
    const step = (t: number) => {
      if (!start) start = t
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setV(Math.round(value * eased))
      if (p < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  return <>{v}{sfx}</>
}

// ─────────────────────────────────────────────
// MTProgress — horizontal progress bar
// ─────────────────────────────────────────────
export function MTProgress({
  value = 0,
  tone = 'blue',
  height = 8,
  label,
  sub,
}: {
  value?: number
  tone?: Tone
  height?: number
  label?: string
  sub?: string
}) {
  const t = TONES[tone]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {(label || sub) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          {label && <span className="mt-small" style={{ color: 'var(--mt-text)', fontWeight: 500 }}>{label}</span>}
          {sub && <span className="mt-small">{sub}</span>}
        </div>
      )}
      <div style={{ height, background: 'var(--mt-elevated)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: '100%', background: t.fg, borderRadius: 999,
          transition: 'width .8s cubic-bezier(0,0,.2,1)',
        }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PriorityRow — row inside Prioridades panel
// ─────────────────────────────────────────────
export function PriorityRow({
  icon: Icon,
  title,
  subtitle,
  badge,
  badgeTone = 'slate',
  value,
  valueTone = 'slate',
  tone = 'blue',
  critical,
  last,
}: {
  icon: LucideIcon
  title: string
  subtitle?: string
  badge?: string
  badgeTone?: Tone
  value?: string
  valueTone?: Tone
  tone?: Tone
  critical?: boolean
  last?: boolean
}) {
  const [hover, setHover] = useState(false)
  const t = TONES[tone]

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: `14px ${hover ? 17 : 20}px 14px 20px`,
        background: hover ? 'var(--mt-elevated)' : 'transparent',
        borderBottom: last ? 'none' : '1px solid var(--mt-border)',
        borderLeft: `3px solid ${hover ? t.fg : 'transparent'}`,
        transition: 'all .2s', cursor: 'pointer', position: 'relative',
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 8, background: t.bg, color: t.fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        position: 'relative',
      }}>
        <Icon size={18} />
        {critical && (
          <span style={{
            position: 'absolute', top: -2, right: -2, width: 8, height: 8,
            borderRadius: '50%', background: 'var(--mt-danger)',
            boxShadow: '0 0 0 2px var(--mt-surface)',
            animation: 'mt-pulse-dot 1.4s infinite ease-in-out',
          }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--mt-text)' }}>{title}</span>
          {badge && <MTPill tone={badgeTone}>{badge}</MTPill>}
        </div>
        {subtitle && <div className="mt-small" style={{ marginTop: 2 }}>{subtitle}</div>}
      </div>
      {value && (
        <div style={{
          fontSize: 18, fontWeight: 600, color: TONES[valueTone].fg,
          fontVariantNumeric: 'tabular-nums',
        }}>{value}</div>
      )}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke={hover ? 'var(--mt-text)' : 'var(--mt-muted)'} strokeWidth="2"
        style={{ transition: 'transform .2s, stroke .2s', transform: hover ? 'translateX(2px)' : 'none', flexShrink: 0 }}>
        <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────────
// MetricCard — dashboard stat card with hover lift
// ─────────────────────────────────────────────
export function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = 'blue',
  trend,
  animate = true,
}: {
  label: string
  value: number | string
  helper?: string
  icon: LucideIcon
  tone?: Tone
  trend?: { dir: 'up' | 'down'; value: string }
  animate?: boolean
}) {
  const [hover, setHover] = useState(false)
  const t = TONES[tone]
  const numValue = typeof value === 'number' ? value : parseFloat(value) || 0
  const isNum = typeof value === 'number'

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--mt-surface)',
        border: '1px solid var(--mt-border)',
        borderRadius: 12, padding: 20, position: 'relative',
        boxShadow: hover ? 'var(--mt-shadow-md)' : 'var(--mt-shadow-sm)',
        transform: hover ? 'translateY(-2px)' : 'none',
        transition: 'box-shadow .2s, transform .2s',
      }}
    >
      <div style={{
        position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%',
        background: t.bg, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} />
      </div>
      <div style={{ fontSize: 13, color: 'var(--mt-text-2)', marginBottom: 12 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 12 }}>
        <span style={{
          fontSize: 28, fontWeight: 700, color: 'var(--mt-text)',
          letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
        }}>
          {isNum && animate ? <CountUp value={numValue} /> : value}
        </span>
      </div>
      <div style={{ height: 1, background: 'var(--mt-border)', marginBottom: 10 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {trend && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            color: trend.dir === 'up' ? 'var(--mt-success)' : 'var(--mt-danger)',
            fontSize: 12, fontWeight: 500,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              style={{ transform: trend.dir === 'down' ? 'rotate(90deg)' : 'none' }}>
              <path d="M7 17L17 7M17 7H7M17 7v10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {trend.value}
          </span>
        )}
        {helper && <span style={{ fontSize: 12, color: 'var(--mt-muted)' }}>{helper}</span>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ClinicalPage — page wrapper
// ─────────────────────────────────────────────
export function ClinicalPage({
  children,
  size = 'wide',
}: {
  children: ReactNode
  size?: 'compact' | 'wide'
}) {
  return (
    <div className="mt-page-in" style={{
      maxWidth: size === 'compact' ? 768 : 1200,
      margin: '0 auto',
      padding: '28px 32px 48px',
      display: 'flex', flexDirection: 'column', gap: 20,
    }}>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────
// ClinicalHeader — page header
// ─────────────────────────────────────────────
export function ClinicalHeader({
  title,
  subtitle,
  eyebrow,
  icon: _Icon,
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
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      paddingBottom: 24, borderBottom: '1px solid var(--mt-border)',
      flexWrap: 'wrap', gap: 16,
    }}>
      <div>
        {eyebrow && (
          <div className="mt-micro" style={{ color: 'var(--mt-primary)', marginBottom: 8 }}>{eyebrow}</div>
        )}
        <h1 className="mt-display">{title}</h1>
        {subtitle && (
          <p className="mt-small" style={{ marginTop: 6, maxWidth: 560 }}>{subtitle}</p>
        )}
        {meta && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {meta}
          </div>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{actions}</div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// LoadingState — skeleton shimmer loader
// ─────────────────────────────────────────────
export function LoadingState({ label = 'Cargando información clínica...' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '64px 0', color: 'var(--mt-muted)', fontSize: 14 }}>
      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--mt-muted)' }} />
      {label}
    </div>
  )
}

// ─────────────────────────────────────────────
// EmptyClinicalState
// ─────────────────────────────────────────────
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
    <div className="mt-fade-scale-in" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '48px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: 'var(--mt-elevated)', color: 'var(--mt-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
      }}>
        <Icon size={22} />
      </div>
      <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--mt-text)', margin: 0 }}>{title}</p>
      {description && (
        <p style={{ marginTop: 6, maxWidth: 320, fontSize: 14, color: 'var(--mt-muted)', lineHeight: 1.55, margin: '6px auto 0' }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────
// ClinicalInsight — alert box
// ─────────────────────────────────────────────
export function ClinicalInsight({
  tone = 'blue',
  title,
  children,
}: {
  tone?: Tone
  title: string
  children: ReactNode
}) {
  const t = TONES[tone]
  const Icon = tone === 'green' ? CheckCircle2 : tone === 'amber' ? Clock3 : tone === 'red' ? AlertTriangle : Info

  return (
    <div style={{
      borderRadius: 10, border: `1px solid ${t.bd}`, padding: 16,
      background: t.bg,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 14, fontWeight: 600, color: t.fg }}>
        <Icon size={16} />
        {title}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--mt-text-2)' }}>{children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ClinicalTimeline
// ─────────────────────────────────────────────
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
    <div style={{ borderTop: '1px solid var(--mt-border)' }}>
      {items.map(item => {
        const t = TONES[item.tone ?? 'blue']
        const content = (
          <TimelineRow item={item} t={t} />
        )
        if (item.href) {
          return <Link key={item.id} href={item.href} style={{ display: 'block', textDecoration: 'none' }}>{content}</Link>
        }
        return <div key={item.id}>{content}</div>
      })}
    </div>
  )
}

function TimelineRow({ item, t }: { item: TimelineItem; t: { bg: string; fg: string; bd: string } }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', gap: 12, padding: '14px 20px',
        borderBottom: '1px solid var(--mt-border)',
        background: hover ? 'var(--mt-elevated)' : 'transparent',
        transition: 'background .2s',
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.fg, flexShrink: 0, marginTop: 4 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--mt-text)', margin: 0 }}>{item.title}</p>
        {item.subtitle && <p style={{ marginTop: 4, fontSize: 13, color: 'var(--mt-text-2)', margin: '4px 0 0' }}>{item.subtitle}</p>}
      </div>
      <time style={{ fontSize: 12, color: 'var(--mt-muted)', flexShrink: 0 }}>{item.date}</time>
    </div>
  )
}
