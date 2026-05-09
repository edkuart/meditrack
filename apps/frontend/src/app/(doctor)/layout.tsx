'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutGrid,
  Users,
  ClipboardList,
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
  Stethoscope,
} from 'lucide-react'
import { AuthProvider, useAuth } from '@/lib/doctor/auth-context'
import { LegalAcceptanceBanner } from '@/components/doctor/LegalAcceptanceBanner'
import { MTAvatar, MTLogo } from '@/components/doctor/clinical-ui'

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
}: {
  href: string
  icon: React.ElementType
  label: string
  active: boolean
  badge?: string
}) {
  const [hover, setHover] = useState(false)

  return (
    <Link
      href={href}
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
function Sidebar() {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const isAdmin = user && ADMIN_ROLES.has(user.role)

  const main = [
    { href: '/dashboard',  icon: LayoutGrid,    label: 'Panel operativo', match: (p: string) => p === '/dashboard' },
    { href: '/patients',   icon: Users,          label: 'Pacientes',       match: (p: string) => p.startsWith('/patients') },
    { href: '/analytics',  icon: TrendingUp,     label: 'Analítica',       match: (p: string) => p.startsWith('/analytics'), adminOnly: true },
    { href: '/staff',      icon: UserCog,        label: 'Equipo clínico',  match: (p: string) => p === '/staff', adminOnly: true },
  ]

  const config = [
    { href: '/settings/clinic',     icon: Building2,   label: 'Clínica' },
    { href: '/settings/billing',    icon: CreditCard,  label: 'Plan y pagos' },
    { href: '/settings/audit',      icon: ShieldCheck, label: 'Auditoría' },
    { href: '/settings/sessions',   icon: Monitor,     label: 'Sesiones' },
    { href: '/settings/compliance', icon: ShieldCheck, label: 'Cumplimiento' },
  ]

  const doctorName = user ? `${user.first_name} ${user.last_name}` : ''

  return (
    <aside style={{
      width: 224, flexShrink: 0,
      height: '100%',
      background: 'var(--mt-surface)',
      borderRight: '1px solid var(--mt-border)',
      boxShadow: '2px 0 8px rgba(15,23,42,.04)',
      flexDirection: 'column',
      position: 'relative', zIndex: 1,
    }} className="hidden md:flex">
      {/* Logo */}
      <div style={{
        padding: '18px 18px 16px',
        borderBottom: '1px solid var(--mt-border)',
      }}>
        <MTLogo size={16} />
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
// Topbar (shared across all doctor pages)
// ─────────────────────────────────────────────
function Topbar() {
  const { user } = useAuth()
  const clinicName = 'Clínica'

  return (
    <header className="mt-topbar-pad" style={{
      height: 56,
      display: 'flex', alignItems: 'center', gap: 16,
      borderBottom: '1px solid var(--mt-border)',
      background: 'rgba(255,255,255,.85)',
      backdropFilter: 'blur(8px)',
      position: 'sticky', top: 0, zIndex: 10,
      flexShrink: 0,
    }}>
      {/* Search bar — text label hidden on mobile */}
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
        {/* Bell */}
        <button style={{
          position: 'relative', width: 34, height: 34, borderRadius: 8,
          border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--mt-text-2)', cursor: 'pointer',
        }}>
          <Bell size={16} />
          <span style={{
            position: 'absolute', top: 7, right: 7, width: 7, height: 7,
            borderRadius: '50%', background: 'var(--mt-danger)', border: '2px solid #fff',
          }} />
        </button>

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
    { href: '/dashboard', label: 'Inicio',    icon: LayoutGrid, active: pathname === '/dashboard' },
    { href: '/patients',  label: 'Pacientes', icon: Users,      active: pathname.startsWith('/patients') },
  ]

  if (user && ADMIN_ROLES.has(user.role)) {
    items.push({ href: '/staff',    label: 'Equipo', icon: UserCog,  active: pathname === '/staff' })
    items.push({ href: '/analytics', label: 'Stats', icon: TrendingUp, active: pathname.startsWith('/analytics') })
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
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <Topbar />
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
