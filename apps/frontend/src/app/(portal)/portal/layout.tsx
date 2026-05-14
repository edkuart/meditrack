'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList, FileText, Home, Pill } from 'lucide-react'

function NavBtn({ icon: Icon, label, href, active }: {
  icon: React.ElementType
  label: string
  href: string
  active?: boolean
}) {
  return (
    <Link href={href} className="portal-nav-link" style={{
      color: active ? 'var(--mt-primary)' : 'var(--mt-muted)',
      fontWeight: active ? 600 : 500,
    }}>
      <span style={{
        padding: '4px 14px', borderRadius: 999,
        background: active ? 'var(--mt-primary-subtle)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background .2s',
      }}>
        <Icon size={18} color={active ? 'var(--mt-primary)' : 'var(--mt-muted)'} />
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
      <nav className="portal-bottom-nav">
        <NavBtn icon={Home}          label="Hoy"        href="/portal"           active={pathname === '/portal'} />
        <NavBtn icon={Pill}          label="Plan"       href="/portal/treatment" active={pathname === '/portal/treatment'} />
        <NavBtn icon={ClipboardList} label="Consultas"  href="/portal/history"   active={pathname === '/portal/history'} />
        <NavBtn icon={FileText}      label="Documentos" href="/portal/documents" active={pathname === '/portal/documents'} />
      </nav>
    </div>
  )
}
