'use client'

import { useState } from 'react'
import { Check, Clock, Loader2, ShieldCheck, Utensils } from 'lucide-react'
import type { DoseEvent } from '@/lib/portal/api'

interface Props {
  dose: DoseEvent
  onConfirm: (id: string) => Promise<void>
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

function isEditable(dose: DoseEvent) {
  return dose.status === 'PENDING' && new Date() <= new Date(dose.can_edit_until)
}

export function DoseCard({ dose, onConfirm }: Props) {
  const [loading, setLoading] = useState(false)
  const confirmed = dose.status === 'CONFIRMED'
  const editable = isEditable(dose)
  const missed = dose.status === 'MISSED'

  async function handleConfirm() {
    if (!editable || loading) return
    setLoading(true)
    try {
      await onConfirm(dose.id)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={`
        rounded-2xl border p-5 shadow-sm transition-all
        ${confirmed
          ? 'border-emerald-200 bg-emerald-50'
          : missed
            ? 'border-amber-200 bg-amber-50'
            : 'border-slate-100 bg-white'
        }
      `}
    >
      <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
        <Clock size={14} className="shrink-0" />
        <span className="font-medium">{formatTime(dose.scheduled_at)}</span>
        {dose.medication_item.with_food && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
            <Utensils size={14} />
            Con comida
          </span>
        )}
      </div>

      <p className="text-lg font-semibold leading-tight text-slate-900">
        {dose.medication_item.drug_name}
      </p>
      {dose.medication_item.presentation && (
        <p className="text-slate-500 text-sm mt-0.5">{dose.medication_item.presentation}</p>
      )}
      <p className="mt-1 text-base text-slate-600">
        {dose.medication_item.dose_amount} {dose.medication_item.dose_unit}
      </p>

      {dose.medication_item.special_instructions && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-500">
          {dose.medication_item.special_instructions}
        </p>
      )}

      <div className="mt-4">
        {confirmed ? (
          <div className="flex items-center gap-2 font-medium text-emerald-700">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
              <Check size={16} strokeWidth={3} />
            </div>
            Tomada{dose.confirmed_at ? ` a las ${formatTime(dose.confirmed_at)}` : ''}
          </div>
        ) : editable ? (
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="
              flex w-full items-center justify-center gap-2 rounded-xl
              bg-blue-500 py-4 text-base font-semibold text-white
              shadow-sm shadow-blue-200
              transition-all active:bg-blue-600 disabled:opacity-60
            "
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
            {loading ? 'Registrando...' : 'Ya la tomé'}
          </button>
        ) : (
          <p className="rounded-xl bg-white/70 px-3 py-2 text-center text-sm text-slate-500">
            {missed ? 'No registrada en la ventana indicada' : 'Esta dosis ya no se puede modificar'}
          </p>
        )}
      </div>
    </div>
  )
}
