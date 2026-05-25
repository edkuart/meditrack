import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'meditrack',
  description: 'Plataforma médica de adherencia terapéutica',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${plusJakarta.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 font-[family-name:var(--font-jakarta)]">
        {children}
        <Toaster
          position="top-right"
          richColors
          toastOptions={{ style: { fontFamily: 'var(--font-jakarta, sans-serif)', fontSize: '13px' } }}
        />
      </body>
    </html>
  )
}
