'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Plus, RotateCw, Users, UserRoundSearch } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { listPatients, type Patient } from '@/lib/doctor/api'
import { hasPermission, PERMISSIONS } from '@/lib/doctor/permissions'
import {
  ClinicalButton,
  ClinicalHeader,
  ClinicalPage,
  EmptyClinicalState,
  LoadingState,
} from '@/components/doctor/clinical-ui'
import { DataTable } from '@/components/ui/data-table'
import { patientsColumns } from '@/components/doctor/patients-columns'
import { Skeleton } from '@/components/ui/skeleton'

export default function PatientsPage() {
  const { token, user } = useAuth()
  const [patients, setPatients] = useState<Patient[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const canReadPatients = hasPermission(user?.role, PERMISSIONS.PATIENT_READ, user?.permissions)
  const canCreatePatients = hasPermission(user?.role, PERMISSIONS.PATIENT_WRITE, user?.permissions)

  const load = useCallback(async () => {
    if (!token) return
    if (!canReadPatients) {
      setPatients([])
      setTotal(0)
      setError('Tu rol no tiene acceso a la cartera de pacientes.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      // Load all at once for client-side filtering/sorting via DataTable
      const data = await listPatients(token, undefined, 1, 200)
      setPatients(data.patients)
      setTotal(data.meta.total)
    } catch (err) {
      setPatients([])
      setTotal(0)
      setError(err instanceof Error ? err.message : 'No se pudo cargar la lista de pacientes.')
    } finally {
      setLoading(false)
    }
  }, [token, canReadPatients])

  useEffect(() => { load() }, [load])

  return (
    <ClinicalPage>
      <ClinicalHeader
        eyebrow="Cartera clínica"
        title="Pacientes"
        subtitle={total > 0 ? `${total} pacientes registrados` : 'Agrega el primer paciente para iniciar seguimiento clínico.'}
        icon={Users}
        actions={canCreatePatients ? (
          <ClinicalButton href="/patients/new" icon={Plus}>Nuevo paciente</ClinicalButton>
        ) : null}
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <EmptyClinicalState
          icon={AlertTriangle}
          title="No se pudo cargar pacientes"
          description={error}
          action={
            <ClinicalButton type="button" icon={RotateCw} onClick={load}>
              Reintentar
            </ClinicalButton>
          }
        />
      ) : patients.length === 0 ? (
        <EmptyClinicalState
          icon={UserRoundSearch}
          title="No hay pacientes registrados"
          description="Agrega el primer paciente para iniciar encounters, tratamientos y seguimiento."
          action={canCreatePatients ? <ClinicalButton href="/patients/new" icon={Plus}>Nuevo paciente</ClinicalButton> : undefined}
        />
      ) : (
        <DataTable
          columns={patientsColumns}
          data={patients}
          searchColumn="name"
          searchPlaceholder="Buscar por nombre, edad o documento…"
          pageSize={20}
        />
      )}
    </ClinicalPage>
  )
}
