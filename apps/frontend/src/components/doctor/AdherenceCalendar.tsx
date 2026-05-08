'use client'

import type { DayAdherence } from '@/lib/doctor/analytics-api'

interface Props {
  days: DayAdherence[]
  streak: number
  overallScore: number
}

function scoreColor(score: number): string {
  if (score === -1) return 'bg-slate-100'
  if (score >= 80) return 'bg-green-400'
  if (score >= 50) return 'bg-yellow-400'
  if (score >= 25) return 'bg-orange-400'
  return 'bg-red-400'
}

function scoreLabel(score: number): string {
  if (score === -1) return 'Sin dosis'
  if (score >= 80) return `${score}% — Buena`
  if (score >= 50) return `${score}% — Regular`
  if (score >= 25) return `${score}% — Baja`
  return `${score}% — Muy baja`
}

function avatarColor(score: number): string {
  if (score >= 85) return 'text-green-600 bg-green-50'
  if (score >= 70) return 'text-yellow-600 bg-yellow-50'
  if (score >= 40) return 'text-orange-600 bg-orange-50'
  return 'text-red-600 bg-red-50'
}

function avatarLabel(score: number): string {
  if (score >= 85) return 'Excelente'
  if (score >= 70) return 'Buena'
  if (score >= 40) return 'Regular'
  return 'Baja'
}

export function AdherenceCalendar({ days, streak, overallScore }: Props) {
  // Group days into weeks (columns of 7)
  const weeks: DayAdherence[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Summary row */}
      <div className="flex items-center gap-4">
        <div className={`px-3 py-1.5 rounded-xl text-sm font-bold ${avatarColor(overallScore)}`}>
          {overallScore}% — {avatarLabel(overallScore)}
        </div>
        {streak > 0 && (
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <span className="text-orange-500">🔥</span>
            {streak} {streak === 1 ? 'día consecutivo' : 'días consecutivos'} ≥ 80%
          </div>
        )}
      </div>

      {/* Heatmap grid */}
      <div className="flex gap-1 flex-wrap">
        {days.map(day => (
          <div
            key={day.date}
            title={`${day.date}: ${scoreLabel(day.score)}`}
            className={`w-5 h-5 rounded-sm ${scoreColor(day.score)} cursor-default transition-opacity hover:opacity-80`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span>Adherencia:</span>
        {[
          { color: 'bg-green-400', label: '≥80%' },
          { color: 'bg-yellow-400', label: '50–79%' },
          { color: 'bg-orange-400', label: '25–49%' },
          { color: 'bg-red-400', label: '<25%' },
          { color: 'bg-slate-100', label: 'Sin dosis' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded-sm ${color}`} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
