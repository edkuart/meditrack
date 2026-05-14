'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
} from 'lucide-react'
import { AuthProvider, useAuth } from '@/lib/doctor/auth-context'
import { LegalAcceptanceBanner } from '@/components/doctor/LegalAcceptanceBanner'
import { MTAvatar, MTLogo } from '@/components/doctor/clinical-ui'
import { NotificationPanel } from '@/components/doctor/NotificationPanel'
import { fetchClinicNotifications, type NotificationEntry } from '@/lib/doctor/notifications-api'

const ADMIN_ROLES = new Set(['ADMIN_CLINIC', 'SUPER_ADMIN'])

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

  return (
    <Link
      href={href}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px 8px 13px', borderRadius: 8,
        background: active ? 'var(--mt-primary-subtle)' : hover ? 'var(--mt-elevated)' : 'transparent',
        color: active ? 'var(--mt-primary)' : hover ? 'var(--mt-text)' : 'var(--mt-text-2)',
        fontSize: 13, fontWeight: active ? 500 : 400,
        transition: 'background .2s, color .2s',
        textDecoration: 'none',
      }}
    >
      {active && (
        <span style={{
          position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, borderRadius: 2,
          background: 'var(--mt-primary)',
          animation: 'mt-slide-in-l .2s ease-out',
        }} />
      )}
      <Icon size={16} color={active ? 'var(--mt-primary)' : 'var(--mt-muted)'} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge && (
        <span style={{
          fontSize: 11, fontWeight: 500, padding: '1px 7px', borderRadius: 999,
          background: active ? 'rgba(26,86,219,.15)' : 'var(--mt-elevated)',
          color: active ? 'var(--mt-primary)' : 'var(--mt-muted)',
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
  const isAdmin = user && ADMIN_ROLES.has(user.role)

  const main = [
    { href: '/dashboard',  icon: LayoutGrid,   label: 'Panel operativo', match: (p: string) => p === '/dashboard' },
    { href: '/patients',   icon: Users,         label: 'Pacientes',       match: (p: string) => p.startsWith('/patients') },
    { href: '/lab',        icon: FlaskConical,  label: 'Laboratorio',     match: (p: string) => p.startsWith('/lab') },
    { href: '/analytics',  icon: TrendingUp,    label: 'Analítica',       match: (p: string) => p.startsWith('/analytics'), adminOnly: true },
    { href: '/staff',      icon: UserCog,       label: 'Equipo clínico',  match: (p: string) => p === '/staff', adminOnly: true },
  ]

  const config = [
    { href: '/settings/clinic',     icon: Building2,   label: 'Clínica' },
    { href: '/settings/billing',    icon: CreditCard,  label: 'Plan y pagos' },
    { href: '/settings/audit',      icon: ShieldCheck, label: 'Auditoría' },
    { href: '/settings/sessions',   icon: Monitor,     label: 'Sesiones' },
    { href: '/settings/compliance', icon: ShieldCheck, label: 'Cumplimiento' },
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
        'md:static md:translate-x-0 md:z-auto',
      ].join(' ')}
      style={{
        width: 224, flexShrink: 0,
        background: 'var(--mt-surface)',
        borderRight: '1px solid var(--mt-border)',
        boxShadow: open ? '8px 0 32px rgba(15,23,42,.18)' : '2px 0 8px rgba(15,23,42,.04)',
      }}
    >
      {/* Logo + mobile close */}
      <div style={{
        padding: '18px 18px 16px',
        borderBottom: '1px solid var(--mt-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
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
        padding: '14px 10px 6px', flex: 1,
        display: 'flex', flexDirection: 'column', gap: 2,
        overflowY: 'auto',
      }} className="mt-scroll">
        {main
          .filter(item => !item.adminOnly || isAdmin)
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

        {isAdmin && (
          <>
            <div style={{
              margin: '16px 10px 6px',
              fontSize: 10, fontWeight: 600,
              color: 'var(--mt-muted)',
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>Configuración</div>
            {config.map(item => (
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

      {/* Doctor info card */}
      <div style={{
        margin: 10, padding: 12,
        borderTop: '1px solid var(--mt-border)',
        background: 'var(--mt-bg)', borderRadius: 10,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <MTAvatar
          name={doctorName || 'Dr'}
          size={36}
          tone={{ bg: '#dbeafe', fg: '#1a56db' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--mt-text)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {user ? `Dr. ${user.last_name}` : '—'}
          </div>
          {user?.specialty && (
            <div style={{
              fontSize: 11, color: 'var(--mt-muted)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {user.specialty}
            </div>
          )}
        </div>
        <LogoutBtn onLogout={() => { logout(); router.replace('/login') }} />
      </div>
    </aside>
  )
}

function LogoutBtn({ onLogout }: { onLogout: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      title="Cerrar sesión"
      onClick={onLogout}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 28, height: 28, borderRadius: 6, border: 'none',
        background: hover ? 'var(--mt-danger-subtle, #fee2e2)' : 'transparent',
        color: hover ? 'var(--mt-danger)' : 'var(--mt-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all .2s', flexShrink: 0,
      }}
    >
      <LogOut size={14} />
    </button>
  )
}

// ─────────────────────────────────────────────
// Topbar
// ─────────────────────────────────────────────
function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, token } = useAuth()
  const clinicName = 'Clínica'

  const [panelOpen, setPanelOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationEntry[]>([])
  const [failedCount, setFailedCount] = useState(0)
  const [loadingNotif, setLoadingNotif] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  const loadNotifications = useCallback(async () => {
    if (!token) return
    setLoadingNotif(true)
    try {
      const res = await fetchClinicNotifications(token)
      setNotifications(res.data)
      setFailedCount(res.meta.failed)
    } catch {
      // silently fail — don't break the layout
    } finally {
      setLoadingNotif(false)
    }
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
    <header className="mt-topbar-pad" style={{
      height: 56,
      display: 'flex', alignItems: 'center', gap: 12,
      borderBottom: '1px solid var(--mt-border)',
      background: 'rgba(255,255,255,.85)',
      backdropFilter: 'blur(8px)',
      position: 'sticky', top: 0, zIndex: 10,
      flexShrink: 0,
    }}>
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

      {/* Search bar — label hidden on mobile */}
      <div style={{ flex: 1, maxWidth: 360 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px',
          border: '1px solid var(--mt-border)', borderRadius: 8,
          background: 'var(--mt-bg)', fontSize: 13, color: 'var(--mt-muted)',
          cursor: 'pointer',
        }}>
          <Search size={14} color="var(--mt-muted)" />
          <span className="hidden sm:block" style={{ flex: 1 }}>Buscar paciente…</span>
          <div className="hidden sm:flex" style={{ gap: 2 }}>
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
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
        {/* Bell with notification panel */}
        <div ref={bellRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setPanelOpen(v => !v)}
            style={{
              position: 'relative', width: 34, height: 34, borderRadius: 8,
              border: `1px solid ${panelOpen ? 'var(--mt-primary)' : 'var(--mt-border)'}`,
              background: panelOpen ? 'var(--mt-primary-subtle)' : 'var(--mt-surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: panelOpen ? 'var(--mt-primary)' : 'var(--mt-text-2)',
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
            {failedCount === 0 && notifications.length > 0 && (
              <span style={{
                position: 'absolute', top: 6, right: 6, width: 7, height: 7,
                borderRadius: '50%', background: 'var(--mt-primary)', border: '2px solid #fff',
              }} />
            )}
          </button>

          {panelOpen && (
            <NotificationPanel
              notifications={notifications}
              failedCount={failedCount}
              loading={loadingNotif}
              onRefresh={loadNotifications}
            />
          )}
        </div>

        <div style={{ height: 24, width: 1, background: 'var(--mt-border)' }} />

        {/* Clinic label — hidden on mobile */}
        <div className="hidden sm:block" style={{ fontSize: 13, color: 'var(--mt-text-2)' }}>
          {clinicName}{' '}
          {user && (
            <span style={{ fontWeight: 500, color: 'var(--mt-text)' }}>
              {user.first_name} {user.last_name}
            </span>
          )}
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

  const items = [
    { href: '/dashboard', label: 'Inicio',    icon: LayoutGrid,  active: pathname === '/dashboard' },
    { href: '/patients',  label: 'Pacientes', icon: Users,       active: pathname.startsWith('/patients') },
    { href: '/lab',       label: 'Lab',       icon: FlaskConical, active: pathname.startsWith('/lab') },
  ]

  if (user && ADMIN_ROLES.has(user.role)) {
    items.push({ href: '/staff',     label: 'Equipo', icon: UserCog,   active: pathname === '/staff' })
    items.push({ href: '/analytics', label: 'Stats',  icon: TrendingUp, active: pathname.startsWith('/analytics') })
  }

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
                textDecoration: 'none', color: item.active ? 'var(--mt-primary)' : 'var(--mt-muted)',
                fontSize: 11, fontWeight: item.active ? 500 : 400,
              }}
            >
              <span style={{
                padding: '4px 14px', borderRadius: 999,
                background: item.active ? 'var(--mt-primary-subtle)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background .2s',
              }}>
                <Icon size={18} color={item.active ? 'var(--mt-primary)' : 'var(--mt-muted)'} />
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
  const { token, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Auto-close sidebar when navigating
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  useEffect(() => {
    if (!isLoading && !token) router.replace('/login')
  }, [token, isLoading, router])

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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--mt-bg)' }}>
      <LegalAcceptanceBanner />

      {/* Mobile backdrop — shown when sidebar is open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(2px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <Topbar onMenu={() => setSidebarOpen(v => !v)} />
          <main style={{ flex: 1, overflowY: 'auto', paddingBottom: '96px' }} className="md:pb-0 mt-scroll">
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
