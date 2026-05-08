'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Users, LayoutDashboard, UserCog, LogOut, Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from '@/lib/doctor/auth-context'

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
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
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
