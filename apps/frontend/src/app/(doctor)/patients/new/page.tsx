'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { createPatient } from '@/lib/doctor/api'

export default function NewPatientPage() {
  const router = useRouter()
  const { token } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    id_number: '',
    date_of_birth: '',
    sex: '',
    notes: '',
  })

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    setError('')
    setLoading(true)
    try {
      const patient = await createPatient(token, {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        id_number: form.id_number || undefined,
        date_of_birth: form.date_of_birth || undefined,
        sex: form.sex || undefined,
        notes: form.notes || undefined,
      })
      router.push(`/patients/${patient.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el paciente')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/patients" className="text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold text-slate-800">Nuevo paciente</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col gap-5">

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Nombre *</label>
            <input required value={form.first_name} onChange={set('first_name')}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Apellido *</label>
            <input required value={form.last_name} onChange={set('last_name')}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Correo electrónico</label>
            <input type="email" value={form.email} onChange={set('email')}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">WhatsApp del paciente</label>
            <input type="tel" value={form.phone} onChange={set('phone')} placeholder="+502 5555 5555"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            <p className="text-xs text-slate-400">Incluye código de país para enviar el acceso por WhatsApp.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1 col-span-1">
            <label className="text-sm font-medium text-slate-600">N° de cédula / ID</label>
            <input value={form.id_number} onChange={set('id_number')}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Fecha de nacimiento</label>
            <input type="date" value={form.date_of_birth} onChange={set('date_of_birth')}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Sexo</label>
            <select value={form.sex} onChange={set('sex')}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option value="">—</option>
              <option value="male">Masculino</option>
              <option value="female">Femenino</option>
              <option value="other">Otro</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-600">Notas clínicas</label>
          <textarea value={form.notes} onChange={set('notes')} rows={3}
            placeholder="Alergias, antecedentes relevantes..."
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
        </div>

        {error && (
          <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3 justify-end">
          <Link href="/patients"
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">
            Cancelar
          </Link>
          <button type="submit" disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium disabled:opacity-60 hover:bg-blue-600 transition-colors">
            {loading ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : 'Crear paciente'}
          </button>
        </div>
      </form>
    </div>
  )
}
