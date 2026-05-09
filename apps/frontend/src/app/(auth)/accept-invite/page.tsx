'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, CheckCircle } from 'lucide-react'
import { acceptInvite } from '@/lib/doctor/api'

function AcceptInviteForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    password: '',
    confirm_password: '',
    specialty: '',
    professional_id: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirm_password) {
      setError('Las contraseñas no coinciden')
      return
    }
    if (!token) {
      setError('Token de invitación no válido')
      return
    }
    setError('')
    setLoading(true)
    try {
      const result = await acceptInvite({
        token,
        first_name: form.first_name,
        last_name: form.last_name,
        password: form.password,
        specialty: form.specialty || undefined,
        professional_id: form.professional_id || undefined,
      })
      localStorage.setItem('meditrack_doctor_token', result.access_token)
      localStorage.setItem('meditrack_doctor_refresh_token', result.refresh_token)
      router.replace('/patients')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aceptar la invitación')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-red-500 text-sm">Enlace de invitación inválido o expirado.</p>
        <Link href="/login" className="text-blue-600 text-sm mt-2 inline-block hover:underline">
          Ir al inicio de sesión
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
        <CheckCircle size={18} className="text-green-500" />
        <h2 className="font-semibold text-slate-800">Configura tu cuenta</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Nombre *</label>
          <input required value={form.first_name} onChange={set('first_name')}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Apellido *</label>
          <input required value={form.last_name} onChange={set('last_name')}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">Contraseña *</label>
        <input type="password" required minLength={8} value={form.password} onChange={set('password')}
          placeholder="Mínimo 8 caracteres"
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">Confirmar contraseña *</label>
        <input type="password" required value={form.confirm_password} onChange={set('confirm_password')}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Especialidad</label>
          <input value={form.specialty} onChange={set('specialty')} placeholder="Cardiología"
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Cédula profesional</label>
          <input value={form.professional_id} onChange={set('professional_id')}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
      </div>

      {error && <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <button type="submit" disabled={loading}
        className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-500 text-white font-medium text-sm disabled:opacity-60 hover:bg-blue-600 transition-colors">
        {loading ? <><Loader2 size={16} className="animate-spin" /> Creando cuenta...</> : 'Crear cuenta e ingresar'}
      </button>
    </form>
  )
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">meditrack</h1>
          <p className="text-slate-500 mt-1 text-sm">Aceptar invitación de equipo</p>
        </div>
        <Suspense fallback={<div className="flex justify-center"><Loader2 size={24} className="animate-spin text-slate-300" /></div>}>
          <AcceptInviteForm />
        </Suspense>
      </div>
    </div>
  )
}
