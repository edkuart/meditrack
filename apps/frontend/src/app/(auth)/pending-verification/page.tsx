'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, ShieldCheck, LogOut, RefreshCw } from 'lucide-react'
import { getMe } from '@/lib/doctor/api'

const TOKEN_KEY = 'meditrack_doctor_token'

export default function PendingVerificationPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(false)
  const [rejectedReason, setRejectedReason] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) { router.replace('/login'); return }

    // Check if the user has been approved or rejected since they last loaded
    getMe(token).then(user => {
      if (user.is_verified) { router.replace('/patients') }
      if (user.verification_rejected_at) { setRejectedReason(user.verification_rejected_reason ?? 'Sin razón especificada') }
    }).catch(() => {
      router.replace('/login')
    })
  }, [router])

  function handleCheckAgain() {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) { router.replace('/login'); return }
    setChecking(true)
    getMe(token).then(user => {
      if (user.is_verified) { router.replace('/patients'); return }
      if (user.verification_rejected_at) {
        setRejectedReason(user.verification_rejected_reason ?? 'Sin razón especificada')
      }
    }).catch(() => {
      router.replace('/login')
    }).finally(() => setChecking(false))
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem('meditrack_doctor_refresh_token')
    router.replace('/login')
  }

  if (rejectedReason !== null) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--mt-bg)' }}>
        <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: '#fee2e2', display: 'flex',
            alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px',
          }}>
            <ShieldCheck size={28} color="#dc2626" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--mt-text)', marginBottom: 8 }}>
            Solicitud rechazada
          </h1>
          <p style={{ fontSize: 14, color: 'var(--mt-text-2)', marginBottom: 16, lineHeight: 1.6 }}>
            Tu solicitud de acceso no fue aprobada por el siguiente motivo:
          </p>
          <div style={{
            background: '#fee2e2', border: '1px solid #fecaca',
            borderRadius: 10, padding: '12px 16px', marginBottom: 24,
            fontSize: 14, color: '#dc2626', textAlign: 'left',
          }}>
            {rejectedReason}
          </div>
          <p style={{ fontSize: 13, color: 'var(--mt-muted)', marginBottom: 24 }}>
            Si crees que es un error, escríbenos a{' '}
            <a href="mailto:soporte@meditrack.app" style={{ color: 'var(--mt-primary)' }}>
              soporte@meditrack.app
            </a>
          </p>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', height: 42, borderRadius: 8, border: '1px solid var(--mt-border)',
              background: 'var(--mt-surface)', color: 'var(--mt-text-2)',
              fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}
          >
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--mt-bg)' }}>
      <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
        {/* Animated clock icon */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'var(--mt-primary-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 28px',
          boxShadow: '0 0 0 12px rgba(26,86,219,.06)',
        }}>
          <Clock size={30} color="var(--mt-primary)" />
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--mt-text)', marginBottom: 10 }}>
          Cuenta en revisión
        </h1>

        <p style={{ fontSize: 15, color: 'var(--mt-text-2)', lineHeight: 1.7, marginBottom: 32, maxWidth: 340, margin: '0 auto 32px' }}>
          Tu solicitud de acceso está siendo verificada por el equipo de Meditrack.
          Recibirás un correo electrónico cuando sea aprobada.
        </p>

        <div style={{
          background: 'var(--mt-surface)', border: '1px solid var(--mt-border)',
          borderRadius: 12, padding: '20px 24px', marginBottom: 24,
          textAlign: 'left',
        }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)', marginBottom: 12 }}>
            ¿Qué sigue?
          </p>
          {[
            'Revisamos tu número de colegiado con el Colegio de Médicos y Cirujanos',
            'Verificamos la información de tu DPI y credenciales',
            'Recibes un correo de activación (normalmente en menos de 24 h)',
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: i < 2 ? 12 : 0 }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: 'var(--mt-primary-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: 'var(--mt-primary)',
              }}>{i + 1}</span>
              <span style={{ fontSize: 13, color: 'var(--mt-text-2)', lineHeight: 1.5 }}>{step}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleCheckAgain}
            disabled={checking}
            style={{
              flex: 1, height: 42, borderRadius: 8,
              border: 'none', background: 'var(--mt-primary)',
              color: '#fff', fontSize: 14, fontWeight: 500,
              cursor: checking ? 'not-allowed' : 'pointer',
              opacity: checking ? 0.75 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <RefreshCw size={15} style={{ animation: checking ? 'spin 1s linear infinite' : 'none' }} />
            {checking ? 'Verificando…' : 'Revisar estado'}
          </button>
          <button
            onClick={handleLogout}
            style={{
              height: 42, padding: '0 16px', borderRadius: 8,
              border: '1px solid var(--mt-border)',
              background: 'var(--mt-surface)', color: 'var(--mt-text-2)',
              fontSize: 14, fontWeight: 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <LogOut size={15} />
            Salir
          </button>
        </div>
      </div>
    </div>
  )
}
