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
    <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <ShieldCheck size={16} className="shrink-0" />
        <p className="text-sm">
          <span className="font-medium">Políticas actualizadas</span>
          {' — '}Por favor acepta: {items.join(' y ')} para continuar usando meditrack.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleAcceptAll}
          disabled={accepting}
          className="flex items-center gap-1.5 bg-white text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-70 transition-colors"
        >
          {accepting ? <Loader2 size={12} className="animate-spin" /> : null}
          Aceptar todo
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/70 hover:text-white transition-colors"
          title="Recordar más tarde"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
