'use client'

import type { DayAdherence } from '@/lib/doctor/analytics-api'

interface Props {
  days: DayAdherence[]
  streak: number
  overallScore: number
}

function scoreStyle(score: number): React.CSSProperties {
  if (score === -1) return { background: 'var(--mt-elevated)' }
  if (score >= 80)  return { background: '#34D399' }
  if (score >= 50)  return { background: '#FBBF24' }
  if (score >= 25)  return { background: '#FB923C' }
  return { background: '#F87171' }
}

function scoreLabel(score: number): string {
  if (score === -1) return 'Sin dosis'
  if (score >= 80) return `${score}% — Buena`
  if (score >= 50) return `${score}% — Regular`
  if (score >= 25) return `${score}% — Baja`
  return `${score}% — Muy baja`
}

function summaryStyle(score: number): React.CSSProperties {
  if (score >= 85) return { color: '#065F46', background: 'var(--mt-success-subtle)' }
  if (score >= 70) return { color: '#92400E', background: '#FEF3C7' }
  if (score >= 40) return { color: '#9A3412', background: '#FFF7ED' }
  return { color: 'var(--mt-danger)', background: 'var(--mt-danger-subtle)' }
}

function summaryLabel(score: number): string {
  if (score >= 85) return 'Excelente'
  if (score >= 70) return 'Buena'
  if (score >= 40) return 'Regular'
  return 'Baja'
}

const LEGEND = [
  { style: { background: '#34D399' }, label: '≥80%' },
  { style: { background: '#FBBF24' }, label: '50–79%' },
  { style: { background: '#FB923C' }, label: '25–49%' },
  { style: { background: '#F87171' }, label: '<25%' },
  { style: { background: 'var(--mt-elevated)' }, label: 'Sin dosis' },
]

export function AdherenceCalendar({ days, streak, overallScore }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          padding: '6px 12px', borderRadius: 10, fontSize: 13, fontWeight: 700,
          ...summaryStyle(overallScore),
        }}>
          {overallScore}% — {summaryLabel(overallScore)}
        </div>
        {streak > 0 && (
          <div style={{ fontSize: 12, color: 'var(--mt-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>🔥</span>
            {streak} {streak === 1 ? 'día consecutivo' : 'días consecutivos'} ≥ 80%
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {days.map(day => (
          <div
            key={day.date}
            title={`${day.date}: ${scoreLabel(day.score)}`}
            style={{
              width: 20, height: 20, borderRadius: 4, cursor: 'default',
              transition: 'opacity .15s',
              ...scoreStyle(day.score),
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--mt-muted)' }}>
        <span>Adherencia:</span>
        {LEGEND.map(({ style, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, ...style }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
