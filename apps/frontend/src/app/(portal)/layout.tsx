import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mi Tratamiento | Meditrack',
  description: 'Portal del paciente — revisa tu tratamiento y confirma tus medicamentos',
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
