import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'meditrack',
  description: 'Plataforma médica de adherencia terapéutica',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 font-[family-name:var(--font-geist)]">
        {children}
        <Toaster
          position="top-right"
          richColors
          toastOptions={{ style: { fontFamily: 'var(--font-geist, sans-serif)', fontSize: '13px' } }}
        />
      </body>
    </html>
  )
}
