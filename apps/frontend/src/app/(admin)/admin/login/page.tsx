'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck } from 'lucide-react'
import { adminLogin, setAdminToken } from '@/lib/admin/admin-api'

export default function AdminLoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    try {
      const result = await adminLogin(fd.get('email') as string, fd.get('password') as string)
      setAdminToken(result.access_token)
      localStorage.setItem('meditrack_admin_refresh_token', result.refresh_token)
      router.replace('/admin/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0f172a', padding: '0 16px',
      fontFamily: 'var(--mt-font)',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'rgba(255,255,255,.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            border: '1px solid rgba(255,255,255,.12)',
          }}>
            <ShieldCheck size={24} color="#60a5fa" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>
            Meditrack Admin
          </h1>
          <p style={{ fontSize: 13, color: '#64748b' }}>
            Acceso exclusivo para administradores del sistema
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
              Correo electrónico
            </label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="admin@meditrack.app"
              style={{
                height: 42, borderRadius: 8, border: '1px solid rgba(255,255,255,.12)',
                background: 'rgba(255,255,255,.06)', color: '#f1f5f9',
                padding: '0 14px', fontSize: 14, outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
              Contraseña
            </label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              style={{
                height: 42, borderRadius: 8, border: '1px solid rgba(255,255,255,.12)',
                background: 'rgba(255,255,255,.06)', color: '#f1f5f9',
                padding: '0 14px', fontSize: 14, outline: 'none',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)',
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f87171',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              height: 44, borderRadius: 8, border: 'none',
              background: '#1d4ed8', color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.75 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              marginTop: 4,
            }}
          >
            {loading
              ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Ingresando...</>
              : 'Acceder al panel'
            }
          </button>
        </form>

        <p style={{ marginTop: 24, fontSize: 11, color: '#334155', textAlign: 'center' }}>
          Esta URL no es para médicos. Si eres doctor,{' '}
          <a href="/login" style={{ color: '#60a5fa' }}>accede desde aquí</a>.
        </p>
      </div>
    </div>
  )
}
