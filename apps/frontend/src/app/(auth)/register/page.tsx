'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { register } from '@/lib/doctor/api'

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    clinic_name: '',
    clinic_slug: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    specialty: '',
    professional_id: '',
  })

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await register({
        ...form,
        specialty: form.specialty || undefined,
        professional_id: form.professional_id || undefined,
      })
      localStorage.setItem('meditrack_doctor_token', result.access_token)
      localStorage.setItem('meditrack_doctor_refresh_token', result.refresh_token)
      router.replace('/patients')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrarse')
    } finally {
      setLoading(false)
    }
  }

  const field = (label: string, name: string, type = 'text', placeholder = '') => (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-slate-600 font-medium">{label}</label>
      <input
        type={type}
        required={type !== 'text' || !['specialty', 'professional_id'].includes(name)}
        value={form[name as keyof typeof form]}
        onChange={set(name)}
        placeholder={placeholder}
        className="border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">meditrack</h1>
          <p className="text-slate-500 mt-1 text-sm">Registra tu clínica o consultorio</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col gap-4">

          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Clínica / consultorio</p>
          {field('Nombre de la clínica', 'clinic_name', 'text', 'Consultorio Dr. García')}
          {field('Slug (identificador único)', 'clinic_slug', 'text', 'dr-garcia')}

          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-2">Médico responsable</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-600 font-medium">Nombre</label>
              <input type="text" required value={form.first_name} onChange={set('first_name')} className="border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-600 font-medium">Apellido</label>
              <input type="text" required value={form.last_name} onChange={set('last_name')} className="border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
          </div>
          {field('Correo electrónico', 'email', 'email', 'doctor@ejemplo.com')}
          {field('Contraseña', 'password', 'password', '••••••••')}
          {field('Especialidad (opcional)', 'specialty', 'text', 'Cardiología')}
          {field('Cédula profesional (opcional)', 'professional_id', 'text', '12345678')}

          {error && (
            <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-500 text-white font-medium text-sm disabled:opacity-60 hover:bg-blue-600 transition-colors"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Registrando...</> : 'Crear cuenta'}
          </button>

          <p className="text-center text-sm text-slate-500">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-blue-600 font-medium hover:underline">
              Iniciar sesión
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
