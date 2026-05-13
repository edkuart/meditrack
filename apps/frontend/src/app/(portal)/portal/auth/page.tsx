'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck } from 'lucide-react'
import { saveSession } from '@/lib/portal/session'
import { authPin } from '@/lib/portal/api'

export default function PortalAuthPage() {
  const router = useRouter()
  const [patientId, setPatientId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
      setError(err instanceof Error ? err.message : 'PIN incorrecto')
    } finally {
      setLoading(false)
    }
  }

  if (!patientId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <ShieldCheck size={26} />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Abre tu enlace de acceso</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Usa el link directo que recibiste por WhatsApp. Si necesitas un nuevo acceso, pídeselo a tu equipo médico.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500 text-white">
            <ShieldCheck size={26} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Acceso de respaldo</h1>
          <p className="mt-1 text-sm text-slate-400">Ingresa el PIN recibido por WhatsApp</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">
              PIN de 6 dígitos
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={pin}
              onChange={e => setPin(e.target.value.slice(0, 6))}
              placeholder="000000"
              className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-4 text-center font-mono text-2xl tracking-widest text-slate-800 focus:border-blue-400 focus:outline-none"
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || pin.length !== 6}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-500 py-4 text-lg font-semibold text-white transition-colors active:bg-blue-600 disabled:opacity-50"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Entrando...</> : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
