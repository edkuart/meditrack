export type EngagementTone = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'

export interface EngagementDayInput {
  date: string
  status: string
  cnt: number
}

export interface EngagementTodayInput {
  total: number
  confirmed: number
  pending: number
  next_dose_at?: string | null
  next_dose_name?: string | null
}

export interface EngagementDay {
  date: string
  confirmed: number
  total: number
  score: number
}

export interface PatientEngagement {
  score: number
  confirmed: number
  total: number
  missed: number
  streak_days: number
  weekly_completed_days: number
  tone: EngagementTone
  headline: string
  guidance: string
  next_action: {
    label: string
    detail: string
    priority: 'calm' | 'today' | 'support'
  }
  caregiver_tip: string
  week: EngagementDay[]
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isoDate(daysAgo = 0) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - daysAgo)
  return formatLocalDate(date)
}

function toneForScore(score: number): EngagementTone {
  if (score >= 85) return 'EXCELLENT'
  if (score >= 70) return 'GOOD'
  if (score >= 40) return 'FAIR'
  return 'POOR'
}

export function buildEngagementProfile(
  doseRows: EngagementDayInput[],
  today: EngagementTodayInput,
): PatientEngagement {
  const byDate: Record<string, Record<string, number>> = {}

  for (const row of doseRows) {
    byDate[row.date] ??= {}
    byDate[row.date][row.status] = Number(row.cnt)
  }

  const week = Array.from({ length: 7 }, (_, index) => {
    const date = isoDate(6 - index)
    const statuses = byDate[date] ?? {}
    const confirmed = statuses.CONFIRMED ?? 0
    const cancelled = statuses.CANCELLED ?? 0
    const superseded = statuses.SUPERSEDED ?? 0
    const total = Object.values(statuses).reduce((sum, value) => sum + value, 0) - cancelled - superseded
    return {
      date,
      confirmed,
      total,
      score: total > 0 ? Math.round((confirmed / total) * 100) : -1,
    }
  })

  const total = week.reduce((sum, day) => sum + day.total, 0)
  const confirmed = week.reduce((sum, day) => sum + day.confirmed, 0)
  const missed = Math.max(total - confirmed, 0)
  const score = total > 0 ? Math.round((confirmed / total) * 100) : 100
  const tone = toneForScore(score)

  let streakDays = 0
  for (let index = week.length - 1; index >= 0; index--) {
    const day = week[index]
    if (day.total === 0 || day.score < 80) break
    streakDays++
  }

  const weeklyCompletedDays = week.filter(day => day.total > 0 && day.score === 100).length

  const headline =
    tone === 'EXCELLENT' ? 'Tu semana va muy ordenada' :
    tone === 'GOOD' ? 'Vas construyendo una buena rutina' :
    tone === 'FAIR' ? 'Hoy puede ser un buen punto de reinicio' :
    'Vamos paso a paso, sin prisa'

  const guidance =
    tone === 'EXCELLENT' ? 'Mantén este ritmo y registra cada dosis cuando la tomes.' :
    tone === 'GOOD' ? 'Si se te pasa una dosis, vuelve a la siguiente indicada por tu equipo médico.' :
    tone === 'FAIR' ? 'Elige una alarma simple y deja el medicamento en un lugar visible y seguro.' :
    'Pide apoyo a un familiar o cuidador si hoy se siente difícil seguir el plan.'

  const nextAction = today.pending > 0
    ? {
        label: 'Siguiente dosis',
        detail: today.next_dose_name && today.next_dose_at
          ? `${today.next_dose_name} a las ${new Date(today.next_dose_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
          : 'Revisa la próxima dosis programada para hoy.',
        priority: 'today' as const,
      }
    : today.total > 0
      ? {
          label: 'Hoy está completo',
          detail: 'Ya registraste las dosis programadas de hoy.',
          priority: 'calm' as const,
        }
      : {
          label: 'Sin dosis hoy',
          detail: 'Puedes revisar tu tratamiento completo o tus documentos si tienes dudas.',
          priority: 'calm' as const,
        }

  return {
    score,
    confirmed,
    total,
    missed,
    streak_days: streakDays,
    weekly_completed_days: weeklyCompletedDays,
    tone,
    headline,
    guidance,
    next_action: nextAction,
    caregiver_tip: 'Si alguien te ayuda, puede revisar contigo la próxima dosis y confirmar solo después de tomarla.',
    week,
  }
}
