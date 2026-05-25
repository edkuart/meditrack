'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, X, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { getLegalStatus, acceptLegal } from '@/lib/doctor/compliance-api'

// Bump these dates when policies update to trigger re-acceptance
const TOS_EFFECTIVE = '2025-01-01'
const PRIVACY_EFFECTIVE = '2025-01-01'

function needsAcceptance(acceptedAt: string | null, effectiveDate: string): boolean {
  if (!acceptedAt) return true
  return new Date(acceptedAt) < new Date(effectiveDate)
}

export function LegalAcceptanceBanner() {
  const { token } = useAuth()
  const [show, setShow] = useState(false)
  const [tosPending, setTosPending] = useState(false)
  const [privacyPending, setPrivacyPending] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!token || dismissed) return
    getLegalStatus(token).then(s => {
      const tos = needsAcceptance(s.tos_accepted_at, TOS_EFFECTIVE)
      const priv = needsAcceptance(s.privacy_policy_accepted_at, PRIVACY_EFFECTIVE)
      setTosPending(tos)
      setPrivacyPending(priv)
      setShow(tos || priv)
    }).catch(() => { /* silent — non-blocking */ })
  }, [token, dismissed])

  async function handleAcceptAll() {
    if (!token) return
    setAccepting(true)
    try {
      const ops: Promise<unknown>[] = []
      if (tosPending) ops.push(acceptLegal(token, 'tos'))
      if (privacyPending) ops.push(acceptLegal(token, 'privacy'))
      await Promise.all(ops)
      setShow(false)
    } finally {
      setAccepting(false)
    }
  }

  if (!show) return null

  const items = [
    tosPending && 'Términos de Servicio',
    privacyPending && 'Política de Privacidad',
  ].filter(Boolean) as string[]

  return (
    <div style={{
      background: 'var(--mt-gradient-primary)',
      color: '#fff',
      padding: '10px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <ShieldCheck size={15} style={{ flexShrink: 0, opacity: 0.85 }} />
        <p style={{ fontSize: 13, margin: 0, lineHeight: 1.45 }}>
          <span style={{ fontWeight: 600 }}>Políticas actualizadas</span>
          {' — '}Por favor acepta: {items.join(' y ')} para continuar usando meditrack.
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleAcceptAll}
          disabled={accepting}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,.15)',
            border: '1px solid rgba(255,255,255,.30)',
            color: '#fff', fontSize: 12, fontWeight: 600,
            padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
            transition: 'background .15s',
            opacity: accepting ? 0.7 : 1,
          }}
        >
          {accepting && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
          Aceptar todo
        </button>
        <button
          onClick={() => setDismissed(true)}
          title="Recordar más tarde"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,.6)', display: 'flex', padding: 4,
            transition: 'color .15s',
          }}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
