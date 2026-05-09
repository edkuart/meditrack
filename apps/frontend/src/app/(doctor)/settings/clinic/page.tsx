'use client'

import { useEffect, useState } from 'react'
import { Building2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getClinicProfile,
  updateClinicProfile,
  type ClinicProfile,
} from '@/lib/doctor/settings-api'

const PLAN_LABELS: Record<string, string> = {
  free: 'Gratuito',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-slate-100 text-slate-600',
  pro: 'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700',
}

export default function ClinicSettingsPage() {
  const { token } = useAuth()
  const [profile, setProfile] = useState<ClinicProfile | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    if (!token) return
    getClinicProfile(token)
      .then(p => { setProfile(p); setName(p.name) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !name.trim() || name === profile?.name) return
    setSaving(true)
    setFeedback(null)
    try {
      const updated = await updateClinicProfile(token, name.trim())
      setProfile(updated)
      setFeedback({ ok: true, msg: 'Nombre actualizado correctamente.' })
    } catch (err) {
      setFeedback({ ok: false, msg: err instanceof Error ? err.message : 'Error al guardar.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 size={22} className="animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Building2 size={22} className="text-slate-400" />
        <div>
          <h1 className="text-xl font-bold text-slate-900">Perfil de clínica</h1>
          <p className="text-sm text-slate-500">Información básica de tu organización.</p>
        </div>
      </div>

      {profile && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          {/* Plan badge */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Plan actual</p>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${PLAN_COLORS[profile.plan_type] ?? 'bg-slate-100 text-slate-600'}`}>
              {PLAN_LABELS[profile.plan_type] ?? profile.plan_type}
            </span>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <p className="text-xs text-slate-400 mb-1">Identificador único (slug)</p>
            <p className="font-mono text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">
              {profile.slug}
            </p>
            <p className="text-xs text-slate-400 mt-1">El slug no se puede cambiar.</p>
          </div>

          <form onSubmit={handleSave} className="space-y-4 border-t border-slate-100 pt-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Nombre de la clínica
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                minLength={2}
                maxLength={200}
                required
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-colors"
              />
            </div>

            {feedback && (
              <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm ${
                feedback.ok
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-600 border border-red-200'
              }`}>
                {feedback.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                {feedback.msg}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || name === profile.name || name.trim().length < 2}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Guardar cambios
            </button>
          </form>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-400">
              Clínica creada el{' '}
              {new Date(profile.created_at).toLocaleDateString('es', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
