'use client'

import { useState } from 'react'
import { AlertCircle, CheckCircle, Clock, Loader2, Pill, Utensils } from 'lucide-react'
import type { DoseEvent } from '@/lib/portal/api'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

function isEditable(dose: DoseEvent) {
  return dose.status === 'PENDING' && new Date() <= new Date(dose.can_edit_until)
}

export function DoseCard({ dose, onConfirm }: { dose: DoseEvent; onConfirm: (id: string) => Promise<void> }) {
  const [loading, setLoading] = useState(false)
  const confirmed = dose.status === 'CONFIRMED'
  const missed = dose.status === 'MISSED'
  const editable = isEditable(dose)

  async function handleConfirm() {
    if (!editable || loading) return
    setLoading(true)
    try { await onConfirm(dose.id) } finally { setLoading(false) }
  }

  let bg: string, bd: string, accent: string
  if (confirmed) {
    bg = '#ecfdf5'; bd = '#a7f3d0'; accent = '#047857'
  } else if (missed) {
    bg = '#fef2f2'; bd = '#fecaca'; accent = '#b91c1c'
  } else {
    bg = '#fff'; bd = '#fde68a'; accent = '#d97706'
  }

  const statusIcon = confirmed
    ? <CheckCircle size={18} color="#047857" />
    : missed
    ? <AlertCircle size={18} color="#b91c1c" />
    : <Clock size={18} color="#d97706" />

  const statusLabel = confirmed ? 'Confirmada' : missed ? 'No tomada' : 'Pendiente'

  return (
    <div style={{
      background: bg, border: `1px solid ${bd}`, borderRadius: 14,
      padding: 16, boxShadow: 'var(--mt-shadow-sm)',
      animation: 'mt-fade-scale-in .3s ease-out',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: '#fff', border: `1.5px solid ${bd}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Pill size={20} color={accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--mt-text)', letterSpacing: '-0.01em' }}>
            {dose.medication_item.drug_name}
          </div>
          {dose.medication_item.presentation && (
            <div style={{ marginTop: 2, fontSize: 13, color: 'var(--mt-text-2)' }}>
              {dose.medication_item.presentation}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <Clock size={13} color="var(--mt-muted)" />
            <span style={{ fontSize: 13, color: 'var(--mt-text-2)', fontWeight: 500 }}>
              {formatTime(dose.scheduled_at)}
            </span>
            {dose.medication_item.with_food && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500,
                background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a',
              }}>
                <Utensils size={11} />Con comida
              </span>
            )}
            <span style={{
              marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, color: accent, fontWeight: 500,
            }}>
              {statusIcon}{statusLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Special instructions */}
      {dose.medication_item.special_instructions && (
        <div style={{
          marginTop: 10, fontSize: 12, color: 'var(--mt-text-2)',
          lineHeight: 1.5, paddingLeft: 56,
        }}>
          {dose.medication_item.special_instructions}
        </div>
      )}

      {/* Dose amount */}
      <div style={{ marginTop: 8, paddingLeft: 56, fontSize: 13, color: 'var(--mt-text-2)' }}>
        {dose.medication_item.dose_amount} {dose.medication_item.dose_unit}
      </div>

      {/* Action area */}
      {editable && (
        <button
          onClick={handleConfirm}
          disabled={loading}
          style={{
            marginTop: 14, width: '100%', height: 44,
            background: 'var(--mt-primary)', color: '#fff', border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 500,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 1px 3px rgba(26,86,219,.30)',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.8 : 1,
            fontFamily: 'var(--mt-font)',
            transition: 'opacity .2s',
          }}
        >
          {loading
            ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />Registrando...</>
            : <><CheckCircle size={16} />Confirmar dosis</>
          }
        </button>
      )}

      {confirmed && (
        <div style={{
          marginTop: 12, padding: '10px 12px', background: '#fff',
          borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: 'var(--mt-text-2)',
        }}>
          <CheckCircle size={14} color="#047857" />
          Confirmada
          {dose.confirmed_at && (
            <> a las <strong style={{ color: 'var(--mt-text)' }}>{formatTime(dose.confirmed_at)}</strong></>
          )}
        </div>
      )}

      {missed && (
        <div style={{
          marginTop: 12, padding: '10px 12px',
          background: '#fef2f2', borderRadius: 10,
          fontSize: 12, color: '#b91c1c', textAlign: 'center',
        }}>
          No registrada en la ventana indicada
        </div>
      )}
    </div>
  )
}
