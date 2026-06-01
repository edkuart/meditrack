'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Module-level store: survives re-renders and component remounts within the session
const _dismissed = new Set<string>(
  (() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem('meditrack:dismissed-notifs') ?? '[]') as string[] }
    catch { return [] }
  })()
)
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutGrid,
  Users,
  TrendingUp,
  UserCog,
  CreditCard,
  Building2,
  ShieldCheck,
  Monitor,
  LogOut,
  Loader2,
  Bell,
  Search,
  Menu,
  X,
  FlaskConical,
  BrainCircuit,
  ArrowUpDown,
  BedDouble,
  MapPin,
  BookOpen,
  UserCircle,
  Upload,
  CalendarDays,
} from 'lucide-react'
import { AuthProvider, useAuth } from '@/lib/doctor/auth-context'
import { LegalAcceptanceBanner } from '@/components/doctor/LegalAcceptanceBanner'
import { MTAvatar, MTLogo } from '@/components/doctor/clinical-ui'
import { NotificationPanel } from '@/components/doctor/NotificationPanel'
import { SearchModal } from '@/components/doctor/SearchModal'
import { fetchClinicNotifications, type NotificationEntry } from '@/lib/doctor/notifications-api'
import {
  fetchDoctorNotifications, markDoctorNotificationRead, markAllDoctorNotificationsRead,
  type DoctorNotification,
} from '@/lib/doctor/referral-notifications-api'
import { hasCapability, hasPermission, PERMISSIONS, type Permission } from '@/lib/doctor/permissions'

const ROLE_LABELS: Record<string, string> = {
  DOCTOR:        'Médico/a',
  NURSE:         'Enfermero/a',
  ASSISTANT:     'Asistente',
  LAB_TECHNICIAN:'Técnico de lab.',
  RADIOLOGIST:   'Radiólogo/a',
  PHARMACIST:    'Farmacéutico/a',
  RECEPTIONIST:  'Recepcionista',
  WARD_NURSE:    'Enf. de sala',
  ADMIN_CLINIC:  'Administrador',
}

// ─────────────────────────────────────────────
// NavItem
// ─────────────────────────────────────────────
function NavItem({
  href,
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}: {
  href: string
  icon: React.ElementType
  label: string
  active: boolean
  badge?: string
  onClick?: () => void
}) {
  const [hover, setHover] = useState(false)

  const bg = active
    ? 'var(--mt-purple-subtle)'
    : hover
      ? 'var(--mt-primary-subtle)'
      : 'transparent'
  const color = active
    ? 'var(--mt-purple-deep)'
    : hover
      ? 'var(--mt-primary-deep)'
      : 'var(--mt-text-2)'
  const iconColor = active
    ? 'var(--mt-purple)'
    : hover
      ? 'var(--mt-primary)'
      : 'var(--mt-muted)'

  return (
    <Link
      href={href}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 10,
        minHeight: 38,
        padding: '9px 10px 9px 13px', borderRadius: 8,
        background: bg,
        color,
        fontSize: 13, fontWeight: active ? 600 : 500,
        transition: 'background .2s, color .2s',
        textDecoration: 'none',
        borderLeft: active ? '3px solid var(--mt-purple)' : '3px solid transparent',
        paddingLeft: 10,
      }}
    >
      {active && (
        <span style={{
          position: 'absolute', left: -3, top: 6, bottom: 6, width: 3, borderRadius: 2,
          background: 'var(--mt-purple)',
          animation: 'mt-slide-in-l .2s ease-out',
        }} />
      )}
      <span style={{
        width: 22, height: 22, borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'rgba(99,102,241,.10)' : 'transparent',
        transition: 'background .2s',
      }}>
        <Icon size={16} color={iconColor} />
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 999,
          background: active ? 'rgba(99,102,241,.15)' : 'var(--mt-elevated)',
          color: active ? 'var(--mt-purple-deep)' : 'var(--mt-muted)',
          fontVariantNumeric: 'tabular-nums',
        }}>{badge}</span>
      )}
    </Link>
  )
}

// ─────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────
function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const can = (permission: Permission) => hasPermission(user?.role, permission, user?.permissions)
  const canUse = (capability?: string) => hasCapability(user?.tenant_capabilities, capability)

  const main = [
    { href: '/dashboard',  icon: LayoutGrid,   label: 'Panel operativo', match: (p: string) => p === '/dashboard', permission: PERMISSIONS.PATIENT_READ },
    { href: '/agenda',     icon: CalendarDays, label: 'Agenda',          match: (p: string) => p.startsWith('/agenda'), permission: PERMISSIONS.APPOINTMENT_READ },
    { href: '/patients',   icon: Users,         label: 'Pacientes',       match: (p: string) => p.startsWith('/patients'), permission: PERMISSIONS.PATIENT_READ },
    { href: '/lab',        icon: FlaskConical,  label: 'Laboratorio',     match: (p: string) => p.startsWith('/lab') && !p.startsWith('/lab/external'), permission: PERMISSIONS.LAB_ORDER_READ },
    { href: '/lab/external', icon: Upload, label: 'Lab externo', match: (p: string) => p.startsWith('/lab/external'), permission: PERMISSIONS.LAB_ORDER_READ, capability: 'lab.external' },
    { href: '/referrals',  icon: ArrowUpDown,   label: 'Referencias',     match: (p: string) => p.startsWith('/referrals'), permission: PERMISSIONS.REFERRAL_READ },
    { href: '/hospital',   icon: BedDouble,     label: 'Internados',      match: (p: string) => p.startsWith('/hospital'), permission: PERMISSIONS.HOSPITAL_CENSUS_READ, capability: 'hospital.census' },
    { href: '/clinical-intelligence', icon: BrainCircuit, label: 'Inteligencia clínica', match: (p: string) => p.startsWith('/clinical-intelligence'), permission: PERMISSIONS.PATIENT_SENSITIVE_READ },
    { href: '/analytics',     icon: TrendingUp,    label: 'Analítica',          match: (p: string) => p.startsWith('/analytics'), permission: PERMISSIONS.ANALYTICS_READ, capability: 'analytics.advanced' },
    { href: '/notifications', icon: Bell,           label: 'Notificaciones',     match: (p: string) => p.startsWith('/notifications'), permission: PERMISSIONS.PATIENT_READ },
  ]

  const config = [
    { href: '/settings/clinic',    icon: Building2,   label: 'Clínica', permission: PERMISSIONS.HOSPITAL_MANAGE },
    { href: '/settings/hospital',  icon: Building2,   label: 'Hospital', permission: PERMISSIONS.HOSPITAL_MANAGE },
    { href: '/settings/staff',     icon: UserCog,     label: 'Personal', permission: PERMISSIONS.STAFF_MANAGE, capability: 'staff.invites' },
    { href: '/settings/locations', icon: MapPin,      label: 'Sedes', permission: PERMISSIONS.HOSPITAL_MANAGE, capability: 'hospital.census' },
    { href: '/settings/protocols', icon: BookOpen,   label: 'Protocolos', permission: PERMISSIONS.TREATMENT_WRITE },
    { href: '/settings/billing',   icon: CreditCard,  label: 'Plan y pagos', permission: PERMISSIONS.HOSPITAL_MANAGE },
    { href: '/settings/audit',     icon: ShieldCheck, label: 'Auditoría', permission: PERMISSIONS.HOSPITAL_MANAGE, capability: 'audit.export' },
    { href: '/settings/sessions',  icon: Monitor,     label: 'Sesiones', permission: PERMISSIONS.PATIENT_READ },
    { href: '/settings/compliance',icon: ShieldCheck, label: 'Cumplimiento', permission: PERMISSIONS.HOSPITAL_MANAGE, capability: 'compliance.center' },
  ]

  const doctorName = user ? `${user.first_name} ${user.last_name}` : ''

  // On desktop the sidebar is always in the flex flow. On mobile it slides in/out
  // as a fixed overlay. We use Tailwind classes exclusively for position/display
  // to avoid inline-style specificity conflicts.
  return (
    <aside
      className={[
        // Mobile: fixed overlay, slide in/out
        'fixed inset-y-0 left-0 z-50 flex flex-col',
        'transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full',
        // Desktop: static, always visible, reset transform
        'md:sticky md:top-0 md:translate-x-0 md:z-auto',
      ].join(' ')}
      style={{
        width: 232, flexShrink: 0,
        height: '100dvh',
        maxHeight: '100dvh',
        background: 'var(--mt-surface)',
        borderRight: '1px solid var(--mt-border)',
        boxShadow: open ? '8px 0 32px rgba(15,23,42,.18)' : '2px 0 8px rgba(37,99,235,.06)',
      }}
    >
      {/* Logo + mobile close */}
      <div style={{
        padding: '18px 16px 14px',
        borderBottom: '1px solid var(--mt-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <MTLogo size={16} />
        <button
          onClick={onClose}
          className="md:hidden"
          style={{
            width: 28, height: 28, borderRadius: 6, border: 'none',
            background: 'var(--mt-elevated)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--mt-text-2)',
          }}
        >
          <X size={15} />
        </button>
      </div>

      {/* Nav */}
      <nav style={{
        padding: '14px 10px 10px', flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column', gap: 2,
        overflowY: 'auto',
      }} className="mt-scroll">
        <div style={{
          margin: '0 10px 7px',
          fontSize: 10, fontWeight: 700,
          color: 'var(--mt-muted)',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>Clínica</div>
        {main
          .filter(item => can(item.permission) && canUse(item.capability))
          .map(item => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={item.match(pathname)}
              onClick={onClose}
            />
          ))}

        {config.some(item => can(item.permission) && canUse(item.capability)) && (
          <>
            <div style={{
              margin: '18px 10px 7px',
              fontSize: 10, fontWeight: 700,
              color: 'var(--mt-muted)',
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>Configuración</div>
            {config.filter(item => can(item.permission) && canUse(item.capability)).map(item => (
              <NavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={pathname.startsWith(item.href)}
                onClick={onClose}
              />
            ))}
          </>
        )}
      </nav>

      {/* Doctor account */}
      <div style={{
        padding: 10,
        borderTop: '1px solid var(--mt-border)',
        flexShrink: 0,
      }}>
        <div style={{
          padding: 10,
          border: '1px solid var(--mt-border)',
          background: 'var(--mt-bg)',
          borderRadius: 10,
        }}>
          <Link
            href="/settings/profile"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              textDecoration: 'none', color: 'inherit',
            }}
          >
            <MTAvatar
              name={doctorName || 'Dr'}
              size={34}
              tone={{ bg: '#DBEAFE', fg: '#1D4ED8' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: 'var(--mt-text)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {user ? `Dr. ${user.last_name}` : '—'}
              </div>
              <div style={{
                fontSize: 11, color: 'var(--mt-muted)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {user?.specialty || (user?.role ? ROLE_LABELS[user.role] : undefined) || 'Cuenta clínica'}
              </div>
            </div>
            <UserCircle size={14} color="var(--mt-muted)" style={{ flexShrink: 0 }} />
          </Link>
          <button
            onClick={() => { logout(); router.replace('/login') }}
            style={{
              marginTop: 10,
              width: '100%',
              minHeight: 34,
              border: '1px solid var(--mt-border)',
              borderRadius: 8,
              background: 'var(--mt-surface)',
              color: 'var(--mt-text-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <LogOut size={14} />
            Cerrar sesión
          </button>
          {user?.email && (
            <div style={{
              marginTop: 8,
              fontSize: 10, color: 'var(--mt-muted)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {user.email}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

// ─────────────────────────────────────────────
// Topbar
// ─────────────────────────────────────────────
function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, token } = useAuth()
  const clinicName = 'Clínica'

  const [searchOpen, setSearchOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationEntry[]>([])
  const [doctorNotifications, setDoctorNotifications] = useState<DoctorNotification[]>([])
  const [loadingNotif, setLoadingNotif] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(v => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const [, rerender] = useState(0)

  const handleDismiss = useCallback((id: string) => {
    _dismissed.add(id)
    try { localStorage.setItem('meditrack:dismissed-notifs', JSON.stringify([..._dismissed])) } catch {}
    rerender(n => n + 1)
  }, [])

  const visibleNotifications = notifications.filter(n => !_dismissed.has(n.id))
  const failedCount = visibleNotifications.filter(n => n.status === 'FAILED' || n.status === 'BOUNCED').length
  const unreadReferralCount = doctorNotifications.filter(n => !n.is_read).length

  const loadNotifications = useCallback(async () => {
    if (!token) return
    setLoadingNotif(true)
    try {
      const [patientRes, doctorRes] = await Promise.allSettled([
        fetchClinicNotifications(token),
        fetchDoctorNotifications(token),
      ])
      if (patientRes.status === 'fulfilled') setNotifications(patientRes.value.data)
      if (doctorRes.status === 'fulfilled') setDoctorNotifications(doctorRes.value.data)
    } finally {
      setLoadingNotif(false)
    }
  }, [token])

  const handleDoctorNotifRead = useCallback(async (id: string) => {
    if (!token) return
    setDoctorNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    await markDoctorNotificationRead(token, id).catch(() => {})
  }, [token])

  const handleMarkAllRead = useCallback(async () => {
    if (!token) return
    setDoctorNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    await markAllDoctorNotificationsRead(token).catch(() => {})
  }, [token])

  // Initial load + 60-second polling
  useEffect(() => {
    loadNotifications()
    const id = setInterval(loadNotifications, 60_000)
    return () => clearInterval(id)
  }, [loadNotifications])

  // Close panel on outside click
  useEffect(() => {
    if (!panelOpen) return
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [panelOpen])

  return (
    <header
      className="mt-topbar-pad"
      style={{
        height: 56,
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(248, 250, 252, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
        boxShadow: '0 1px 0 rgba(37, 99, 235, 0.06), 0 4px 16px rgba(15, 23, 42, 0.04)',
        position: 'sticky', top: 0, zIndex: 10,
        flexShrink: 0,
      }}
    >
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenu}
        className="md:hidden"
        style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--mt-text-2)', cursor: 'pointer',
        }}
      >
        <Menu size={18} />
      </button>

      {/* Search bar — full bar on desktop only */}
      <div className="hidden md:block" style={{ flex: 1, maxWidth: 360 }}>
        <button
          onClick={() => setSearchOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px',
            border: '1px solid var(--mt-border)', borderRadius: 8, width: '100%',
            background: 'rgba(255,255,255,.7)', fontSize: 13, color: 'var(--mt-muted)',
            cursor: 'pointer', textAlign: 'left',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          <Search size={14} color="var(--mt-muted)" />
          <span style={{ flex: 1 }}>Buscar paciente…</span>
          <div style={{ display: 'flex', gap: 2 }}>
            <kbd style={{
              fontSize: 10, fontFamily: 'var(--mt-font-mono)',
              padding: '1px 5px', background: 'var(--mt-surface)',
              border: '1px solid var(--mt-border)', borderRadius: 4,
              color: 'var(--mt-text-2)',
            }}>⌘</kbd>
            <kbd style={{
              fontSize: 10, fontFamily: 'var(--mt-font-mono)',
              padding: '1px 5px', background: 'var(--mt-surface)',
              border: '1px solid var(--mt-border)', borderRadius: 4,
              color: 'var(--mt-text-2)',
            }}>K</kbd>
          </div>
        </button>
      </div>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}

      {/* Spacer — pushes right group to the edge on mobile */}
      <div className="flex-1 md:hidden" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Search icon button — mobile only */}
        <button
          onClick={() => setSearchOpen(true)}
          className="md:hidden"
          style={{
            width: 34, height: 34, borderRadius: 8, flexShrink: 0,
            border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--mt-text-2)', cursor: 'pointer',
          }}
        >
          <Search size={16} />
        </button>

        {/* Bell with notification panel */}
        <div ref={bellRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setPanelOpen(v => !v)}
            style={{
              position: 'relative', width: 34, height: 34, borderRadius: 8,
              border: `1px solid ${panelOpen ? 'var(--mt-purple)' : 'var(--mt-border)'}`,
              background: panelOpen ? 'var(--mt-purple-subtle)' : 'var(--mt-surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: panelOpen ? 'var(--mt-purple-deep)' : 'var(--mt-text-2)',
              cursor: 'pointer', transition: 'all .2s',
            }}
          >
            <Bell size={16} />
            {failedCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                minWidth: 16, height: 16, borderRadius: 999,
                background: 'var(--mt-danger)', border: '2px solid #fff',
                fontSize: 10, fontWeight: 700, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px',
              }}>
                {failedCount > 99 ? '99+' : failedCount}
              </span>
            )}
            {failedCount === 0 && unreadReferralCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                minWidth: 16, height: 16, borderRadius: 999,
                background: 'var(--mt-purple)', border: '2px solid #fff',
                fontSize: 10, fontWeight: 700, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px',
              }}>
                {unreadReferralCount > 9 ? '9+' : unreadReferralCount}
              </span>
            )}
            {failedCount === 0 && unreadReferralCount === 0 && notifications.length > 0 && (
              <span style={{
                position: 'absolute', top: 6, right: 6, width: 7, height: 7,
                borderRadius: '50%', background: 'var(--mt-purple)', border: '2px solid #fff',
              }} />
            )}
          </button>

          {panelOpen && (
            <NotificationPanel
              notifications={visibleNotifications}
              doctorNotifications={doctorNotifications}
              failedCount={failedCount}
              unreadReferralCount={unreadReferralCount}
              loading={loadingNotif}
              onRefresh={loadNotifications}
              onDismiss={handleDismiss}
              onDoctorNotifRead={handleDoctorNotifRead}
              onMarkAllRead={handleMarkAllRead}
            />
          )}
        </div>

        {/* Divider + clinic label — desktop only */}
        <div className="hidden sm:flex" style={{ alignItems: 'center', gap: 12 }}>
          <div style={{ height: 24, width: 1, background: 'var(--mt-border)' }} />
          <div style={{ fontSize: 13, color: 'var(--mt-text-2)' }}>
            {clinicName}{' '}
            {user && (
              <span style={{ fontWeight: 600, color: 'var(--mt-text)' }}>
                {user.first_name} {user.last_name}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

// ─────────────────────────────────────────────
// Mobile nav
// ─────────────────────────────────────────────
function MobileNav() {
  const { user } = useAuth()
  const pathname = usePathname()
  const can = (permission: Permission) => hasPermission(user?.role, permission, user?.permissions)
  const canUse = (capability?: string) => hasCapability(user?.tenant_capabilities, capability)

  const items = [
    { href: '/dashboard',              label: 'Panel',     icon: LayoutGrid,   active: pathname === '/dashboard', permission: PERMISSIONS.PATIENT_READ },
    { href: '/patients',               label: 'Pacientes', icon: Users,        active: pathname.startsWith('/patients'), permission: PERMISSIONS.PATIENT_READ },
    { href: '/lab',                    label: 'Lab',       icon: FlaskConical, active: pathname.startsWith('/lab'), permission: PERMISSIONS.LAB_ORDER_READ },
    { href: '/clinical-intelligence',  label: 'Clínica IA', icon: BrainCircuit, active: pathname.startsWith('/clinical-intelligence'), permission: PERMISSIONS.PATIENT_SENSITIVE_READ },
    { href: '/staff',                  label: 'Equipo',    icon: UserCog,      active: pathname === '/staff', permission: PERMISSIONS.STAFF_MANAGE, capability: 'staff.invites' },
    { href: '/analytics',              label: 'Stats',     icon: TrendingUp,   active: pathname.startsWith('/analytics'), permission: PERMISSIONS.ANALYTICS_READ, capability: 'analytics.advanced' },
  ].filter(item => can(item.permission) && canUse(item.capability))

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
      borderTop: '1px solid var(--mt-border)',
      background: 'rgba(255,255,255,.95)',
      backdropFilter: 'blur(10px)',
      paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      paddingTop: 8, paddingLeft: 12, paddingRight: 12,
    }} className="md:hidden">
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${items.length}, 1fr)`,
        gap: 4, maxWidth: 400, margin: '0 auto',
      }}>
        {items.map(item => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                textDecoration: 'none', color: item.active ? 'var(--mt-purple-deep)' : 'var(--mt-muted)',
                fontSize: 11, fontWeight: item.active ? 600 : 500,
              }}
            >
              <span style={{
                padding: '4px 14px', borderRadius: 999,
                background: item.active ? 'var(--mt-purple-subtle)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background .2s',
              }}>
                <Icon size={18} color={item.active ? 'var(--mt-purple)' : 'var(--mt-muted)'} />
              </span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

// ─────────────────────────────────────────────
// DoctorGuard
// ─────────────────────────────────────────────
function DoctorGuard({ children }: { children: React.ReactNode }) {
  const { token, user, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Auto-close sidebar when navigating
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  const BILLING_PATHS = ['/settings/billing', '/settings/sessions']

  useEffect(() => {
    if (isLoading) return
    if (!token) { router.replace('/login'); return }
    if (user && !user.is_verified) { router.replace('/pending-verification'); return }
    if (user && user.tenant_plan === 'free' && !BILLING_PATHS.some(p => pathname.startsWith(p))) {
      router.replace('/settings/billing')
      return
    }
  }, [token, user, isLoading, router, pathname])

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--mt-bg)',
      }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--mt-muted)' }} />
      </div>
    )
  }

  if (!token) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', minHeight: '100dvh', background: 'var(--mt-bg)', overflow: 'hidden' }}>
      <LegalAcceptanceBanner />

      {/* Mobile backdrop — shown when sidebar is open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(2px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          <Topbar onMenu={() => setSidebarOpen(v => !v)} />
          <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }} className="md:pb-0 mt-scroll">
            {children}
          </main>
        </div>
      </div>
      <MobileNav />
    </div>
  )
}

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DoctorGuard>{children}</DoctorGuard>
    </AuthProvider>
  )
}
