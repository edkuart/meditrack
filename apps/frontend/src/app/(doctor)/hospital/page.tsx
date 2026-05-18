'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  BedDouble, RefreshCw, AlertTriangle, Loader2, LogOut,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  getHospitalCensus, dischargePatient,
  type Admission,
} from '@/lib/doctor/api'
import {
  ClinicalButton, ClinicalHeader, ClinicalPage, ClinicalPanel,
  EmptyClinicalState, LoadingState, StatusPill,
} from '@/components/doctor/clinical-ui'

function daysSince(isoDate: string) {
  return Math.ceil((Date.now() - new Date(isoDate).getTime()) / 86_400_000)
}

export default function HospitalPage() {
  const { token } = useAuth()
  const [admissions, setAdmissions] = useState<Admission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dischargingId, setDischargingId] = useState<string | null>(null)
  const [dischargeNotes, setDischargeNotes] = useState('')
  const [discharging, setDischarging] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const data = await getHospitalCensus(token)
      setAdmissions(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando censo')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  async function handleDischarge(admissionId: string) {
    if (!token) return
    setDischarging(true)
    try {
      await dischargePatient(token, admissionId, { discharge_notes: dischargeNotes.trim() || undefined })
      setAdmissions(prev => prev.filter(a => a.id !== admissionId))
      setDischargingId(null)
      setDischargeNotes('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al dar de alta')
    } finally {
      setDischarging(false)
    }
  }

  // Group by department
  const byDept = admissions.reduce<Record<string, { name: string; items: Admission[] }>>((acc, adm) => {
    const key = adm.department_id ?? '__none__'
    const name = adm.department?.name ?? 'Sin departamento'
    if (!acc[key]) acc[key] = { name, items: [] }
    acc[key].items.push(adm)
    return acc
  }, {})

  return (
    <ClinicalPage>
      <ClinicalHeader
        title="Censo hospitalario"
        subtitle={`${admissions.length} paciente(s) internado(s) actualmente`}
        icon={BedDouble}
        actions={
          <ClinicalButton icon={RefreshCw} variant="outline" tone="slate" onClick={load}>
            Actualizar
          </ClinicalButton>
        }
      />

      {loading ? (
        <LoadingState label="Cargando censo…" />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <AlertTriangle size={32} className="text-red-400" />
          <p className="text-sm text-slate-500">{error}</p>
          <ClinicalButton variant="outline" tone="slate" onClick={load}>Reintentar</ClinicalButton>
        </div>
      ) : admissions.length === 0 ? (
        <EmptyClinicalState
          icon={BedDouble}
          title="Sin pacientes internados"
          description="Cuando internes un paciente desde su expediente, aparecerá aquí."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {Object.entries(byDept).map(([key, group]) => (
            <ClinicalPanel key={key} title={group.name} icon={BedDouble} collapsible defaultOpen={false}>
              <div className="divide-y divide-slate-50">
                {group.items.map(adm => {
                  const days = daysSince(adm.admitted_at)
                  const isDischarging = dischargingId === adm.id
                  return (
                    <div key={adm.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {adm.patient ? (
                              <Link
                                href={`/patients/${adm.patient_id}`}
                                className="font-semibold text-slate-900 hover:text-blue-600 transition-colors text-sm"
                              >
                                {adm.patient.first_name} {adm.patient.last_name}
                              </Link>
                            ) : (
                              <span className="font-semibold text-sm text-slate-900">Paciente</span>
                            )}
                            {adm.patient?.mrn && (
                              <span className="font-mono text-xs text-blue-500">{adm.patient.mrn}</span>
                            )}
                            {adm.bed_code && (
                              <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                {adm.bed_code}
                              </span>
                            )}
                            <StatusPill tone={days >= 7 ? 'amber' : 'blue'}>
                              {days} día{days !== 1 ? 's' : ''}
                            </StatusPill>
                          </div>

                          {adm.admission_notes && (
                            <p className="text-xs text-slate-500 line-clamp-1">{adm.admission_notes}</p>
                          )}

                          <p className="text-xs text-slate-400">
                            Ingreso: {new Date(adm.admitted_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            {adm.admitted_by_doctor && ` · Dr. ${adm.admitted_by_doctor.first_name} ${adm.admitted_by_doctor.last_name}`}
                            {adm.referral ? ' · Por derivación' : ''}
                          </p>
                        </div>

                        <div className="shrink-0">
                          {isDischarging ? (
                            <div className="flex flex-col gap-2 w-52">
                              <textarea
                                value={dischargeNotes}
                                onChange={e => setDischargeNotes(e.target.value)}
                                rows={2}
                                placeholder="Notas de alta (opcional)…"
                                className="text-xs border border-slate-200 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleDischarge(adm.id)}
                                  disabled={discharging}
                                  className="flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800 transition-colors disabled:opacity-60"
                                >
                                  {discharging ? <Loader2 size={12} className="animate-spin" /> : null}
                                  Confirmar alta
                                </button>
                                <button
                                  onClick={() => { setDischargingId(null); setDischargeNotes('') }}
                                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDischargingId(adm.id)}
                              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-blue-700 transition-colors"
                            >
                              <LogOut size={13} /> Dar de alta
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ClinicalPanel>
          ))}
        </div>
      )}
    </ClinicalPage>
  )
}
