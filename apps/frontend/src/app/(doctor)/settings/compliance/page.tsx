'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, Download, Loader2, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { getLegalStatus, acceptLegal, type LegalStatus } from '@/lib/doctor/compliance-api'

// Current policy effective dates — bump these when policies update to force re-acceptance
const TOS_EFFECTIVE = '2025-01-01'
const PRIVACY_EFFECTIVE = '2025-01-01'

function needsAcceptance(acceptedAt: string | null, effectiveDate: string): boolean {
  if (!acceptedAt) return true
  return new Date(acceptedAt) < new Date(effectiveDate)
}

export default function ComplianceSettingsPage() {
  const { token } = useAuth()
  const [status, setStatus] = useState<LegalStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState<'tos' | 'privacy' | null>(null)

  useEffect(() => {
    if (!token) return
    getLegalStatus(token)
      .then(setStatus)
      .finally(() => setLoading(false))
  }, [token])

  async function handleAccept(type: 'tos' | 'privacy') {
    if (!token) return
    setAccepting(type)
    try {
      const result = await acceptLegal(token, type)
      setStatus(prev => prev
        ? {
            ...prev,
            tos_accepted_at: type === 'tos' ? result.accepted_at : prev.tos_accepted_at,
            privacy_policy_accepted_at: type === 'privacy' ? result.accepted_at : prev.privacy_policy_accepted_at,
          }
        : null,
      )
    } finally {
      setAccepting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    )
  }

  const tosPending = status ? needsAcceptance(status.tos_accepted_at, TOS_EFFECTIVE) : true
  const privacyPending = status ? needsAcceptance(status.privacy_policy_accepted_at, PRIVACY_EFFECTIVE) : true

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-green-50 rounded-xl">
          <ShieldCheck size={20} className="text-green-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Cumplimiento & Legal</h1>
          <p className="text-sm text-slate-500">Aceptación de políticas y estado de cumplimiento normativo</p>
        </div>
      </div>

      {/* Legal acceptance */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Políticas legales</h2>
        </div>
        <div className="divide-y divide-slate-50">
          {/* ToS */}
          <div className="px-5 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">Términos de Servicio</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {status?.tos_accepted_at
                  ? `Aceptado el ${new Date(status.tos_accepted_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`
                  : 'No aceptado aún'}
              </p>
            </div>
            {tosPending ? (
              <button
                onClick={() => handleAccept('tos')}
                disabled={accepting === 'tos'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {accepting === 'tos' ? <Loader2 size={13} className="animate-spin" /> : null}
                Aceptar
              </button>
            ) : (
              <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                <CheckCircle2 size={14} /> Al día
              </span>
            )}
          </div>

          {/* Privacy */}
          <div className="px-5 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">Política de Privacidad</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {status?.privacy_policy_accepted_at
                  ? `Aceptado el ${new Date(status.privacy_policy_accepted_at).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`
                  : 'No aceptado aún'}
              </p>
            </div>
            {privacyPending ? (
              <button
                onClick={() => handleAccept('privacy')}
                disabled={accepting === 'privacy'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {accepting === 'privacy' ? <Loader2 size={13} className="animate-spin" /> : null}
                Aceptar
              </button>
            ) : (
              <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                <CheckCircle2 size={14} /> Al día
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Data retention info */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Clock size={16} className="text-slate-500" />
            Retención de datos
          </h2>
        </div>
        <div className="px-5 py-5 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-400 mb-1">Registros clínicos</p>
              <p className="font-semibold text-slate-800">10 años</p>
              <p className="text-xs text-slate-400 mt-1">Historia clínica obligatoria</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-400 mb-1">Logs de auditoría</p>
              <p className="font-semibold text-slate-800">5 años</p>
              <p className="text-xs text-slate-400 mt-1">Trazabilidad regulatoria</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-400 mb-1">Consentimientos</p>
              <p className="font-semibold text-slate-800">Indefinido</p>
              <p className="text-xs text-slate-400 mt-1">Hasta retiro o erasure</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-400 mb-1">Sesiones inactivas</p>
              <p className="font-semibold text-slate-800">30 días</p>
              <p className="text-xs text-slate-400 mt-1">Expiración automática</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Los periodos de retención siguen las obligaciones legales de registros médicos aplicables.
            Para solicitar eliminación de datos fuera de estos periodos, contacta con soporte.
          </p>
        </div>
      </div>

      {/* GDPR rights */}
      <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4 flex gap-3">
        <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800 mb-1">Derechos RGPD de pacientes</p>
          <p className="text-xs text-amber-700">
            Los pacientes pueden ejercer el derecho de portabilidad (exportar datos) y el derecho al olvido (anonimización de datos personales)
            desde la pestaña <strong>Cumplimiento</strong> en su expediente clínico. Los datos médicos se conservan según obligación legal aunque se aplique la anonimización.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs bg-white border border-amber-200 text-amber-700 rounded-lg px-2.5 py-1 flex items-center gap-1">
              <Download size={11} /> Portabilidad: exportar datos
            </span>
            <span className="text-xs bg-white border border-amber-200 text-amber-700 rounded-lg px-2.5 py-1 flex items-center gap-1">
              <ShieldCheck size={11} /> Erasure: anonimización PII
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
