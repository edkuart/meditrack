'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveSession } from '@/lib/portal/session'
import { authPin } from '@/lib/portal/api'

export default function PortalAuthPage() {
  const router = useRouter()
  const [patientId, setPatientId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-sm">

        {/* Logo / header */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-blue-500 rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <span className="text-white text-2xl">💊</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Mi tratamiento</h1>
          <p className="text-slate-400 mt-1">Ingresa tu PIN de acceso</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Patient ID */}
          <div>
            <label className="block text-slate-600 font-medium mb-2 text-sm">
              ID de paciente
            </label>
            <input
              type="text"
              value={patientId}
              onChange={e => setPatientId(e.target.value)}
              placeholder="Proporcionado por tu médico"
              className="w-full border-2 border-slate-200 rounded-2xl px-4 py-4 text-base text-slate-800 focus:outline-none focus:border-blue-400 bg-white"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          {/* PIN */}
          <div>
            <label className="block text-slate-600 font-medium mb-2 text-sm">
              PIN de 6 dígitos
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={pin}
              onChange={e => setPin(e.target.value.slice(0, 6))}
              placeholder="000000"
              className="w-full border-2 border-slate-200 rounded-2xl px-4 py-4 text-2xl text-slate-800 tracking-widest text-center font-mono focus:outline-none focus:border-blue-400 bg-white"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center bg-red-50 rounded-xl py-3 px-4">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || pin.length !== 6 || !patientId}
            className="w-full py-4 rounded-2xl bg-blue-500 text-white font-semibold text-lg disabled:opacity-50 active:bg-blue-600 transition-colors mt-2"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-slate-400 text-sm mt-8">
          Si no tienes PIN, pide a tu médico que te envíe el enlace de acceso.
        </p>
      </div>
    </div>
  )
}
