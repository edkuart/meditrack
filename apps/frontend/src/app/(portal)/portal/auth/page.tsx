'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck, MessageCircle } from 'lucide-react'
import { MTLogo } from '@/components/doctor/clinical-ui'
import { saveSession } from '@/lib/portal/session'
import { authPin } from '@/lib/portal/api'

export default function PortalAuthPage() {
  const router = useRouter()
  const [patientId, setPatientId] = useState('')
  const [pin, setPin]             = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    setPatientId(new URLSearchParams(window.location.search).get('patient') ?? '')
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pin.length !== 6 || !patientId) return
    setLoading(true)
    setError('')
    try {
      const result = await authPin(patientId, pin)
      saveSession({ token: result.session_token, patient: result.patient })
      router.replace('/portal')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'PIN incorrecto. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  /* ── No patient ID in URL: direct access with no link ── */
  if (!patientId) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: 'var(--mt-bg)',
      }}>
        <div style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>
          <div style={{ marginBottom: 20 }}>
            <MTLogo size={14} />
          </div>
          <div style={{
            margin: '0 auto 18px',
            width: 60, height: 60, borderRadius: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--mt-primary-subtle)', color: 'var(--mt-primary)',
          }}>
            <ShieldCheck size={28} />
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--mt-text)' }}>
            Abre tu enlace de acceso
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--mt-text-2)', lineHeight: 1.6 }}>
            Usa el link directo que recibiste por WhatsApp. Si necesitas un nuevo acceso, pídeselo a tu equipo médico.
          </p>

          <div style={{
            marginTop: 24, padding: '12px 16px', borderRadius: 14,
            background: 'var(--mt-elevated)', border: '1px solid var(--mt-border)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <MessageCircle size={16} style={{ color: 'var(--mt-primary)', flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 13, color: 'var(--mt-text-2)', lineHeight: 1.4, textAlign: 'left' }}>
              El enlace llega por <strong style={{ color: 'var(--mt-text)' }}>WhatsApp</strong> desde tu clínica. Ábrelo directamente desde ese mensaje.
            </p>
          </div>
        </div>
      </div>
    )
  }

  /* ── PIN form ── */
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, background: 'var(--mt-bg)',
    }}>
      <div style={{ width: '100%', maxWidth: 340 }}>

        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ marginBottom: 18 }}>
            <MTLogo size={14} />
          </div>
          <div style={{
            margin: '0 auto 16px',
            width: 60, height: 60, borderRadius: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, var(--mt-primary) 0%, var(--mt-primary-deep) 100%)',
            color: '#fff',
            boxShadow: '0 6px 18px rgba(37,99,235,.30)',
          }}>
            <ShieldCheck size={28} />
          </div>
          <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--mt-text)' }}>
            Acceso de respaldo
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--mt-muted)' }}>
            Ingresa el PIN de 6 dígitos que recibiste por WhatsApp
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{
              display: 'block', marginBottom: 8,
              fontSize: 12.5, fontWeight: 700, color: 'var(--mt-text-2)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              PIN de 6 dígitos
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={pin}
              onChange={e => setPin(e.target.value.slice(0, 6))}
              placeholder="000000"
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                border: `2px solid ${error ? 'var(--mt-danger)' : pin.length > 0 ? 'var(--mt-primary)' : 'var(--mt-border)'}`,
                borderRadius: 16, padding: '16px 20px',
                textAlign: 'center', fontFamily: 'ui-monospace, monospace',
                fontSize: 28, letterSpacing: '0.3em', fontWeight: 700,
                color: 'var(--mt-text)', background: 'var(--mt-surface)',
                outline: 'none', transition: 'border-color .2s',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 12, textAlign: 'center',
              fontSize: 13.5, color: 'var(--mt-danger)',
              background: 'var(--mt-danger-subtle)', border: '1px solid #FECACA',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || pin.length !== 6}
            className="portal-confirm-btn"
            style={{ marginTop: 4 }}
          >
            {loading ? (
              <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Entrando…</>
            ) : (
              'Entrar'
            )}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 12.5, color: 'var(--mt-muted)', lineHeight: 1.5 }}>
          ¿No tienes PIN? Pide a tu equipo médico que te reenvíe el acceso por WhatsApp.
        </p>
      </div>
    </div>
  )
}
