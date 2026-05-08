import { AuthProvider } from '@/lib/doctor/auth-context'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
