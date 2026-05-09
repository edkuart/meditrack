'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Users, LayoutDashboard, UserCog, CreditCard, Building2, ShieldCheck, Monitor, LogOut, Loader2, TrendingUp } from 'lucide-react'
import { AuthProvider, useAuth } from '@/lib/doctor/auth-context'
import { LegalAcceptanceBanner } from '@/components/doctor/LegalAcceptanceBanner'

const ADMIN_ROLES = new Set(['ADMIN_CLINIC', 'SUPER_ADMIN'])

function Sidebar() {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  function handleLogout() {
    logout()
    router.replace('/login')
  }

  return (
    <aside className="w-56 shrink-0 hidden md:flex flex-col bg-white border-r border-slate-100 min-h-screen">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-100">
        <span className="text-lg font-bold text-blue-600">meditrack</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        <Link
          href="/dashboard"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            pathname === '/dashboard'
              ? 'bg-blue-50 text-blue-700'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
          }`}
        >
          <LayoutDashboard size={16} />
          Dashboard
        </Link>
        <Link
          href="/patients"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            pathname.startsWith('/patients')
              ? 'bg-blue-50 text-blue-700'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
          }`}
        >
          <Users size={16} />
          Pacientes
        </Link>
        {user && ADMIN_ROLES.has(user.role) && (
          <>
            <Link
              href="/staff"
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/staff'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <UserCog size={16} />
              Equipo
            </Link>
            <Link
              href="/analytics"
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith('/analytics')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <TrendingUp size={16} />
              Analytics
            </Link>

            {/* Settings submenu */}
            <div className="pt-1">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Configuración
              </p>
              {[
                { href: '/settings/clinic',      icon: Building2,   label: 'Clínica' },
                { href: '/settings/billing',     icon: CreditCard,  label: 'Plan y pagos' },
                { href: '/settings/audit',       icon: ShieldCheck, label: 'Auditoría' },
                { href: '/settings/sessions',    icon: Monitor,     label: 'Sesiones' },
                { href: '/settings/compliance',  icon: ShieldCheck, label: 'Cumplimiento' },
              ].map(({ href, icon: Icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname.startsWith(href)
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              ))}
            </div>
          </>
        )}
      </nav>

      {/* Doctor info + logout */}
      <div className="px-4 py-4 border-t border-slate-100">
        {user && (
          <p className="text-xs text-slate-500 mb-3 truncate">
            Dr. {user.first_name} {user.last_name}
            {user.specialty && <span className="block text-slate-400">{user.specialty}</span>}
          </p>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-700 transition-colors"
        >
          <LogOut size={15} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

function MobileNav() {
  const { user } = useAuth()
  const pathname = usePathname()

  const items = [
    { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard, active: pathname === '/dashboard' },
    { href: '/patients', label: 'Pacientes', icon: Users, active: pathname.startsWith('/patients') },
  ]

  if (user && ADMIN_ROLES.has(user.role)) {
    items.push({ href: '/staff', label: 'Equipo', icon: UserCog, active: pathname === '/staff' })
    items.push({ href: '/settings/billing', label: 'Plan', icon: CreditCard, active: pathname.startsWith('/settings/billing') })
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
      <div className={`mx-auto grid max-w-md gap-1 ${items.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {items.map(item => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors ${
                item.active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function DoctorGuard({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !token) {
      router.replace('/login')
    }
  }, [token, isLoading, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    )
  }

  if (!token) return null

  return (
    <div className="flex min-h-screen flex-col">
      <LegalAcceptanceBanner />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-auto pb-24 md:pb-0">{children}</main>
        <MobileNav />
      </div>
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
