import type { ClinicalProtocolMedication } from '../../shared/db/index.ts'

export interface ClinicalProtocolDto {
  id: string
  source: 'SYSTEM' | 'TENANT'
  name: string
  category: string
  description: string | null
  encounter_type: 'CONSULTATION' | 'FOLLOW_UP' | 'POST_HOSPITALIZATION' | 'DISCHARGE' | 'CHRONIC_CONTROL' | 'EMERGENCY' | null
  note_template: string | null
  summary_template: string | null
  treatment_name: string | null
  treatment_instructions: string | null
  medications: ClinicalProtocolMedication[]
  follow_up_days: number | null
  tags: string[]
}

export const SYSTEM_CLINICAL_PROTOCOLS: ClinicalProtocolDto[] = [
  {
    id: 'system-follow-up-adherence',
    source: 'SYSTEM',
    name: 'Seguimiento de adherencia',
    category: 'FOLLOW_UP',
    description: 'Estructura rápida para revisar adherencia, tolerancia y barreras del paciente.',
    encounter_type: 'FOLLOW_UP',
    note_template: 'Evolución desde última consulta:\n\nAdherencia referida:\n\nBarreras detectadas:\n\nEventos adversos:\n',
    summary_template: 'Plan:\n- Reforzar adherencia y educación del paciente.\n- Ajustes según tolerancia.\n\nSeguimiento:\n',
    treatment_name: 'Plan de seguimiento terapéutico',
    treatment_instructions: 'Revisar tolerancia, señales de alarma y comprensión del esquema.',
    medications: [],
    follow_up_days: 30,
    tags: ['adherencia', 'seguimiento'],
  },
  {
    id: 'system-post-discharge',
    source: 'SYSTEM',
    name: 'Post-alta 14 días',
    category: 'POST_DISCHARGE',
    description: 'Plantilla de transición de cuidado para egreso o post-hospitalización.',
    encounter_type: 'POST_HOSPITALIZATION',
    note_template: 'Estado al egreso:\n\nMedicamentos conciliados:\n\nSignos de alarma revisados:\n\nRed de apoyo / cuidador:\n',
    summary_template: 'Plan post-alta:\n- Confirmar disponibilidad de medicamentos.\n- Revisión de signos de alarma.\n- Contacto de seguimiento.\n',
    treatment_name: 'Plan post-alta',
    treatment_instructions: 'Confirmar conciliación de medicamentos y disponibilidad en casa.',
    medications: [
      {
        drug_name: '',
        dose_amount: 1,
        dose_unit: 'tableta(s)',
        route: 'oral',
        frequency_type: 'DAILY',
        times_per_day: ['08:00', '20:00'],
        duration_days: 14,
        sort_order: 0,
      },
    ],
    follow_up_days: 7,
    tags: ['post-alta', 'transicion'],
  },
  {
    id: 'system-chronic-control-30',
    source: 'SYSTEM',
    name: 'Control crónico 30 días',
    category: 'CHRONIC_CARE',
    description: 'Base para control de tratamientos crónicos con seguimiento mensual.',
    encounter_type: 'CHRONIC_CONTROL',
    note_template: 'Control de enfermedad crónica:\n\nSíntomas actuales:\n\nAdherencia:\n\nMediciones relevantes:\n\nEducación entregada:\n',
    summary_template: 'Plan de control:\n- Continuar seguimiento clínico.\n- Revisar adherencia y tolerancia.\n- Próximo control según evolución.\n',
    treatment_name: 'Plan de control 30 días',
    treatment_instructions: 'Usar como punto de partida; ajustar medicamento, dosis y objetivos clínicos.',
    medications: [
      {
        drug_name: '',
        dose_amount: 1,
        dose_unit: 'tableta(s)',
        route: 'oral',
        frequency_type: 'DAILY',
        times_per_day: ['08:00'],
        duration_days: 30,
        sort_order: 0,
      },
    ],
    follow_up_days: 30,
    tags: ['cronico', 'control'],
  },
]

export function filterClinicalProtocols(
  protocols: ClinicalProtocolDto[],
  filters: { category?: string; q?: string },
) {
  const query = filters.q?.trim().toLowerCase()
  const category = filters.category?.trim().toUpperCase()

  return protocols.filter((protocol) => {
    if (category && protocol.category.toUpperCase() !== category) return false
    if (!query) return true

    const haystack = [
      protocol.name,
      protocol.description,
      protocol.category,
      ...protocol.tags,
      ...protocol.medications.map((med) => med.drug_name),
    ].filter(Boolean).join(' ').toLowerCase()

    return haystack.includes(query)
  })
}

export function validateSystemClinicalProtocols() {
  for (const protocol of SYSTEM_CLINICAL_PROTOCOLS) {
    if (protocol.medications.length > 20) {
      throw new Error(`Protocol ${protocol.id} exceeds the treatment medication limit`)
    }

    for (const med of protocol.medications) {
      if (med.dose_amount <= 0) throw new Error(`Protocol ${protocol.id} has a non-positive dose`)
    }
  }

  return true
}
