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

function periodLabel(iso: string) {
  const h = new Date(iso).getHours()
  if (h < 12) return 'mañana'
  if (h < 18) return 'tarde'
  return 'noche'
}

export function DoseCard({ dose, onConfirm }: { dose: DoseEvent; onConfirm: (id: string) => Promise<void> }) {
  const [loading, setLoading] = useState(false)
  const confirmed = dose.status === 'CONFIRMED'
  const missed = dose.status === 'MISSED'
  const editable = isEditable(dose)

  const variantClass = confirmed ? 'confirmed' : missed ? 'missed' : 'pending'
  const accent = confirmed ? 'var(--mt-success)' : missed ? 'var(--mt-danger)' : '#B45309'
  const iconBorder = confirmed ? '#A7F3D0' : missed ? '#FECACA' : '#FDE68A'

  async function handleConfirm() {
    if (!editable || loading) return
    setLoading(true)
    try { await onConfirm(dose.id) } finally { setLoading(false) }
  }

  return (
    <article className={`portal-dose-card ${variantClass}`}>
      {/* Header — icon + name + time chip + with-food */}
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: '#fff',
          border: `1.5px solid ${iconBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Pill size={22} color={accent} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{
            margin: 0,
            fontSize: 16.5,
            fontWeight: 800,
            color: 'var(--mt-text)',
            letterSpacing: '-0.015em',
            lineHeight: 1.2,
          }}>
            {dose.medication_item.drug_name}
          </h3>

          {dose.medication_item.presentation && (
            <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--mt-text-2)' }}>
              {dose.medication_item.presentation}
            </p>
          )}

          <div style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}>
            <span className="portal-time-chip">
              <Clock size={13} strokeWidth={2.5} />
              {formatTime(dose.scheduled_at)}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--mt-muted)', fontWeight: 500 }}>
              por la {periodLabel(dose.scheduled_at)}
            </span>
            {dose.medication_item.with_food && (
              <span className="portal-food-chip">
                <Utensils size={11} />
                Con comida
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Dose amount + special instructions */}
      <div style={{
        marginTop: 12,
        paddingLeft: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        <p style={{
          margin: 0,
          fontSize: 13.5,
          fontWeight: 700,
          color: 'var(--mt-text)',
        }}>
          {dose.medication_item.dose_amount} {dose.medication_item.dose_unit}
        </p>
        {dose.medication_item.special_instructions && (
          <p style={{
            margin: 0,
            fontSize: 12.5,
            color: 'var(--mt-text-2)',
            lineHeight: 1.5,
          }}>
            {dose.medication_item.special_instructions}
          </p>
        )}
      </div>

      {/* Action: confirm button (active window) */}
      {editable && (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading}
          className="portal-confirm-btn"
          aria-label={`Confirmar dosis de ${dose.medication_item.drug_name}`}
        >
          {loading ? (
            <>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              Registrando…
            </>
          ) : (
            <>
              <CheckCircle size={18} strokeWidth={2.5} />
              Confirmar dosis
            </>
          )}
        </button>
      )}

      {/* Confirmed — celebratory strip */}
      {confirmed && (
        <div className="portal-confirm-strip" role="status">
          <span className="portal-confirm-strip-icon" aria-hidden>
            <CheckCircle size={17} strokeWidth={3} />
          </span>
          <div style={{ flex: 1 }}>
            <strong>¡Bien hecho!</strong>{' '}
            {dose.confirmed_at ? (
              <>Confirmada a las <strong>{formatTime(dose.confirmed_at)}</strong>.</>
            ) : (
              <>Dosis registrada.</>
            )}
          </div>
        </div>
      )}

      {/* Missed — empathic, no scolding */}
      {missed && (
        <div className="portal-missed-strip">
          <AlertCircle size={16} color="var(--mt-danger)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>No alcanzaste esta dosis.</strong> Tu equipo médico lo sabrá — lo importante es continuar con la siguiente.
          </div>
        </div>
      )}

      {/* Pending but past the editable window — kind nudge */}
      {!confirmed && !missed && !editable && (
        <div
          className="portal-missed-strip"
          style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}
        >
          <Clock size={16} color="#B45309" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            La ventana para confirmar ya cerró. Si la tomaste, avísale a tu equipo médico.
          </div>
        </div>
      )}
    </article>
  )
}
