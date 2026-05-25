'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList, FileText, FlaskConical, Home, Pill } from 'lucide-react'

function NavBtn({ icon: Icon, label, href, active }: {
  icon: React.ElementType
  label: string
  href: string
  active?: boolean
}) {
  return (
    <Link
      href={href}
      className={`portal-nav-link${active ? ' active' : ''}`}
      style={{
        color: active ? 'var(--mt-primary)' : 'var(--mt-muted)',
        fontWeight: active ? 700 : 500,
      }}
      aria-current={active ? 'page' : undefined}
    >
      <span className="portal-nav-pill">
        <Icon
          size={20}
          strokeWidth={active ? 2.4 : 2}
          color={active ? 'var(--mt-primary)' : 'var(--mt-muted)'}
        />
      </span>
      {label}
    </Link>
  )
}

export default function PortalInnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="portal-shell">
      {children}
      <nav className="portal-bottom-nav" aria-label="Navegación principal">
        <NavBtn icon={Home}          label="Hoy"        href="/portal"           active={pathname === '/portal'} />
        <NavBtn icon={Pill}          label="Plan"       href="/portal/treatment" active={pathname === '/portal/treatment'} />
        <NavBtn icon={ClipboardList} label="Consultas"  href="/portal/history"   active={pathname === '/portal/history'} />
        <NavBtn icon={FileText}      label="Documentos" href="/portal/documents" active={pathname === '/portal/documents'} />
        <NavBtn icon={FlaskConical}  label="Lab"        href="/portal/lab"       active={pathname.startsWith('/portal/lab')} />
      </nav>
    </div>
  )
}
