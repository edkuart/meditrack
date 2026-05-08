'use client'

import { useState } from 'react'
import { Check, Clock, Utensils } from 'lucide-react'
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
        rounded-2xl border-2 p-5 transition-all
        ${confirmed
          ? 'border-green-200 bg-green-50'
          : 'border-slate-200 bg-white'
        }
      `}
    >
      {/* Time */}
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-3">
        <Clock size={14} />
        <span>{formatTime(dose.scheduled_at)}</span>
        {dose.medication_item.with_food && (
          <span className="flex items-center gap-1 ml-auto text-amber-500">
            <Utensils size={14} />
            Con comida
          </span>
        )}
      </div>

      {/* Drug info */}
      <p className="text-xl font-semibold text-slate-800 leading-tight">
        {dose.medication_item.drug_name}
      </p>
      {dose.medication_item.presentation && (
        <p className="text-slate-500 text-sm mt-0.5">{dose.medication_item.presentation}</p>
      )}
      <p className="text-slate-600 mt-1 text-base">
        {dose.medication_item.dose_amount} {dose.medication_item.dose_unit}
      </p>

      {dose.medication_item.special_instructions && (
        <p className="text-slate-400 text-sm mt-2 italic">
          {dose.medication_item.special_instructions}
        </p>
      )}

      {/* Action */}
      <div className="mt-4">
        {confirmed ? (
          <div className="flex items-center gap-2 text-green-600 font-medium">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <Check size={16} strokeWidth={3} />
            </div>
            Tomada{dose.confirmed_at ? ` a las ${formatTime(dose.confirmed_at)}` : ''}
          </div>
        ) : editable ? (
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="
              w-full py-4 rounded-xl text-white font-semibold text-lg
              bg-blue-500 active:bg-blue-600
              disabled:opacity-60 transition-all
              shadow-sm shadow-blue-200
            "
          >
            {loading ? 'Registrando...' : '✓ Ya la tomé'}
          </button>
        ) : (
          <p className="text-slate-400 text-sm text-center py-2">
            {dose.status === 'MISSED' ? 'No registrada' : 'Fuera de tiempo'}
          </p>
        )}
      </div>
    </div>
  )
}
