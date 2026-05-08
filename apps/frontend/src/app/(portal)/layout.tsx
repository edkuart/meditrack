import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mi Tratamiento | Meditrack',
  description: 'Portal del paciente — revisa tu tratamiento y confirma tus medicamentos',
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {children}
    </div>
  )
}
