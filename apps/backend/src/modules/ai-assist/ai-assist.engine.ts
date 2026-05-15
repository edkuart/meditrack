export type AiAssistMode = 'SUMMARIZE_ENCOUNTER' | 'SIMPLIFY_FOR_PATIENT'
export type ClinicalCopilotMode =
  | 'ASK_CLINICAL_QUESTION'
  | 'PREPARE_CONSULTATION'
  | 'SUGGEST_PATIENT_QUESTIONS'
  | 'DRAFT_SOAP'
  | 'REVIEW_CLINICAL_GAPS'

export interface AiAssistDraft {
  mode: AiAssistMode
  text: string
  safety_notice: string
  model: 'local-assist-v1'
}

export interface ClinicalCopilotDraft {
  mode: ClinicalCopilotMode
  model: string
  safety_notice: string
  summary: string
  suggested_questions: string[]
  clinical_gaps: string[]
  soft_alerts: string[]
  answer?: string
  soap_draft?: {
    subjective: string
    objective: string
    assessment: string
    plan: string
  }
  evidence: Array<{ label: string; value: string }>
}

const SAFETY_NOTICE = 'Borrador asistivo: revisar, editar y validar clínicamente antes de guardar. No genera diagnósticos ni indicaciones nuevas.'
const COPILOT_NOTICE = 'Copiloto clínico asistivo: organiza información y propone preguntas/borradores. El médico debe revisar, corregir y validar antes de usar.'

const SIMPLE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\badherencia\b/gi, 'cumplimiento del tratamiento'],
  [/\beventos adversos\b/gi, 'molestias o reacciones'],
  [/\bposologia\b/gi, 'forma de tomar el medicamento'],
  [/\bposología\b/gi, 'forma de tomar el medicamento'],
  [/\bdisnea\b/gi, 'dificultad para respirar'],
  [/\bcefalea\b/gi, 'dolor de cabeza'],
  [/\bemesis\b/gi, 'vómito'],
  [/\bhipertension\b/gi, 'presión alta'],
  [/\bhipertensión\b/gi, 'presión alta'],
  [/\bglucemia\b/gi, 'azúcar en sangre'],
]

function normalizeText(text: string) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 6000)
}

function takeUsefulLines(text: string, limit = 6) {
  const normalized = normalizeText(text)
  const lines = normalized
    .split(/\n|(?<=[.!?])\s+/)
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(line => line.length >= 8)

  return Array.from(new Set(lines)).slice(0, limit)
}

function simplifyLine(line: string) {
  return SIMPLE_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    line,
  )
}

export function buildAiAssistDraft(mode: AiAssistMode, sourceText: string): AiAssistDraft {
  const lines = takeUsefulLines(sourceText)

  if (lines.length === 0) {
    return {
      mode,
      text: 'No hay suficiente información clínica escrita para generar un borrador útil.',
      safety_notice: SAFETY_NOTICE,
      model: 'local-assist-v1',
    }
  }

  if (mode === 'SUMMARIZE_ENCOUNTER') {
    const bullets = lines.slice(0, 5).map(line => `- ${line}`).join('\n')
    return {
      mode,
      text: `Resumen asistido:\n${bullets}\n\nPendiente de revisión clínica antes de cerrar la consulta.`,
      safety_notice: SAFETY_NOTICE,
      model: 'local-assist-v1',
    }
  }

  const simplified = lines.slice(0, 5).map(line => `- ${simplifyLine(line)}`).join('\n')
  return {
    mode,
    text: `En palabras sencillas:\n${simplified}\n\nSigue únicamente las indicaciones confirmadas por tu equipo médico.`,
    safety_notice: SAFETY_NOTICE,
    model: 'local-assist-v1',
  }
}

export function isSafeAiAssistMode(mode: string): mode is AiAssistMode {
  return mode === 'SUMMARIZE_ENCOUNTER' || mode === 'SIMPLIFY_FOR_PATIENT'
}

export type SummaryLike = {
  patient: {
    first_name: string
    last_name: string
    date_of_birth: string | null
    sex: string | null
    notes: string | null
  }
  problems: Array<{ title: string; status: string; icd10_code: string | null; notes: string | null }>
  background: Array<{ category: string; content: string }>
  latest_encounters: Array<{
    chief_complaint: string | null
    subjective: string | null
    objective: string | null
    assessment: string | null
    plan: string | null
    summary: string | null
  }>
  latest_vitals: Array<{
    blood_pressure_systolic: number | null
    blood_pressure_diastolic: number | null
    heart_rate: number | null
    respiratory_rate: number | null
    temperature_celsius: string | null
    weight_kg: string | null
    height_cm: string | null
    oxygen_saturation: number | null
    glucose_mg_dl: number | null
    recorded_at: Date
  }>
  latest_labs: Array<{
    status: string
    notes: string | null
    results: Array<{
      panel_name: string
      parameter_name: string
      value: string | null
      numeric_value: string | null
      unit: string | null
      status: string
    }>
  }>
  treatments: Array<{
    name: string
    status: string
    medications: Array<{ drug_name: string; dose_amount: number; dose_unit: string; frequency_type: string }>
    interventions?: Array<{ title: string; type: string }>
  }>
  pending_review_items: Array<{ title: string; item_type: string; priority: string }>
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.find(value => value && value.trim().length > 0)?.trim()
}

function formatPatientAge(dateOfBirth: string | null) {
  if (!dateOfBirth) return 'edad no registrada'
  const birth = new Date(`${dateOfBirth}T00:00:00Z`)
  if (Number.isNaN(birth.getTime())) return 'edad no registrada'
  const now = new Date()
  let years = now.getUTCFullYear() - birth.getUTCFullYear()
  const monthDelta = now.getUTCMonth() - birth.getUTCMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birth.getUTCDate())) years -= 1
  return `${years} años`
}

function buildEvidence(summary: SummaryLike): ClinicalCopilotDraft['evidence'] {
  const evidence: ClinicalCopilotDraft['evidence'] = [
    {
      label: 'Paciente',
      value: `${summary.patient.first_name} ${summary.patient.last_name}, ${formatPatientAge(summary.patient.date_of_birth)}`,
    },
  ]

  const activeProblems = summary.problems.filter(problem => problem.status === 'ACTIVE' || problem.status === 'CHRONIC')
  if (activeProblems.length) {
    evidence.push({
      label: 'Problemas activos',
      value: activeProblems.slice(0, 5).map(problem => problem.title).join('; '),
    })
  }

  const allergies = summary.background.find(item => item.category === 'ALERGIAS')
  if (allergies) evidence.push({ label: 'Alergias', value: allergies.content })

  const meds = summary.treatments
    .filter(plan => plan.status === 'ACTIVE')
    .flatMap(plan => plan.medications.map(med => `${med.drug_name} ${med.dose_amount} ${med.dose_unit}`))
  if (meds.length) evidence.push({ label: 'Tratamiento activo', value: meds.slice(0, 6).join('; ') })

  const lastVitals = summary.latest_vitals[0]
  if (lastVitals) {
    const bp = lastVitals.blood_pressure_systolic && lastVitals.blood_pressure_diastolic
      ? `${lastVitals.blood_pressure_systolic}/${lastVitals.blood_pressure_diastolic} mmHg`
      : null
    evidence.push({
      label: 'Últimos signos vitales',
      value: [
        bp,
        lastVitals.heart_rate ? `FC ${lastVitals.heart_rate}` : null,
        lastVitals.respiratory_rate ? `FR ${lastVitals.respiratory_rate}` : null,
        lastVitals.oxygen_saturation ? `SpO2 ${lastVitals.oxygen_saturation}%` : null,
        lastVitals.weight_kg ? `peso ${lastVitals.weight_kg} kg` : null,
        lastVitals.height_cm ? `talla ${lastVitals.height_cm} cm` : null,
        lastVitals.glucose_mg_dl ? `glucosa ${lastVitals.glucose_mg_dl} mg/dL` : null,
        lastVitals.temperature_celsius ? `T ${lastVitals.temperature_celsius} C` : null,
      ].filter(Boolean).join(', '),
    })
  }

  const abnormalLabs = summary.latest_labs.flatMap(order =>
    order.results
      .filter(result => result.status !== 'NORMAL' && result.status !== 'PENDING')
      .map(result => `${result.parameter_name}: ${result.value ?? result.numeric_value ?? 'sin valor'} ${result.unit ?? ''} (${result.status})`),
  )
  if (abnormalLabs.length) evidence.push({ label: 'Labs fuera de rango', value: abnormalLabs.slice(0, 6).join('; ') })

  return evidence
}

function buildQuestions(summary: SummaryLike) {
  const questions = new Set<string>()
  questions.add('¿Cuál es el síntoma o preocupación principal hoy y desde cuándo inició?')
  questions.add('¿Ha tenido signos de alarma como dolor torácico, dificultad respiratoria, fiebre persistente, desmayo o deterioro rápido?')

  if (summary.problems.some(problem => /hipertensi|presi[oó]n/i.test(problem.title))) {
    questions.add('¿Qué cifras de presión ha registrado en casa y en qué horarios?')
    questions.add('¿Ha olvidado dosis, cambiado dosis o suspendido algún medicamento para la presión?')
  }

  if (summary.problems.some(problem => /diabetes|gluc/i.test(problem.title))) {
    questions.add('¿Qué valores de glucosa ha observado recientemente y ha tenido síntomas de hipoglucemia?')
  }

  if (!summary.background.some(item => item.category === 'ALERGIAS')) {
    questions.add('¿Tiene alergias a medicamentos, alimentos o sustancias?')
  }

  if (summary.treatments.some(plan => plan.status === 'ACTIVE')) {
    questions.add('¿Ha podido seguir el tratamiento tal como fue indicado y ha notado efectos secundarios?')
  }

  return Array.from(questions).slice(0, 8)
}

function buildGaps(summary: SummaryLike) {
  const gaps: string[] = []
  if (!summary.background.some(item => item.category === 'ALERGIAS')) gaps.push('Alergias no documentadas de forma estructurada.')
  if (!summary.background.some(item => item.category === 'MEDICAMENTOS')) gaps.push('Medicamentos actuales externos no documentados como antecedente.')
  if (!summary.latest_vitals.length) gaps.push('No hay signos vitales recientes registrados.')
  if (!summary.problems.length) gaps.push('Lista de problemas clínicos vacía.')
  if (summary.pending_review_items.length) gaps.push(`${summary.pending_review_items.length} item(s) clínicos pendientes de revisión.`)
  return gaps
}

function buildSoftAlerts(summary: SummaryLike) {
  const alerts: string[] = []
  const lastVitals = summary.latest_vitals[0]
  const activeProblemText = summary.problems.map(problem => `${problem.title} ${problem.notes ?? ''}`).join(' ')
  if (lastVitals?.blood_pressure_systolic && lastVitals.blood_pressure_diastolic) {
    if (lastVitals.blood_pressure_systolic >= 180 || lastVitals.blood_pressure_diastolic >= 120) {
      alerts.push('Última presión registrada en rango severamente elevado; confirmar medición y síntomas de alarma.')
    } else if (
      (lastVitals.blood_pressure_systolic >= 160 || lastVitals.blood_pressure_diastolic >= 100) ||
      (/hipertensi|presi[oó]n/i.test(activeProblemText) && (lastVitals.blood_pressure_systolic >= 140 || lastVitals.blood_pressure_diastolic >= 90))
    ) {
      alerts.push('Última presión registrada por encima de meta usual; revisar contexto clínico y adherencia.')
    }
  }
  if (lastVitals?.oxygen_saturation) {
    if (lastVitals.oxygen_saturation < 92) {
      alerts.push('Saturación de oxígeno baja registrada; verificar estado respiratorio y medición.')
    } else if (lastVitals.oxygen_saturation <= 94 && /disnea|edema|asma|respir|fatiga|anemia/i.test(activeProblemText)) {
      alerts.push('SpO2 92-94% con disnea, edema o anemia: confirmar deterioro respiratorio/cardiopulmonar y necesidad de valoración presencial.')
    }
  }
  if (lastVitals?.heart_rate && lastVitals.heart_rate >= 100 && /anemia|palpit|disnea|sangrado|fatiga/i.test(activeProblemText)) {
    alerts.push('Taquicardia registrada en contexto de anemia/sangrado o disnea; confirmar estabilidad actual.')
  }

  const criticalLabs = summary.latest_labs.flatMap(order =>
    order.results.filter(result => result.status === 'CRITICAL_HIGH' || result.status === 'CRITICAL_LOW'),
  )
  if (criticalLabs.length) alerts.push('Hay resultado(s) de laboratorio marcados como críticos pendientes de correlación clínica.')

  const relevantLowHemoglobin = summary.latest_labs.flatMap(order =>
    order.results.filter(result =>
      /hemoglobina|hb\b/i.test(result.parameter_name) &&
      result.status === 'LOW' &&
      Number(result.numeric_value ?? result.value) < 10.5 &&
      /sangrado|anemia|palpit|disnea|fatiga/i.test(activeProblemText),
    ),
  )
  if (relevantLowHemoglobin.length) alerts.push('Hemoglobina baja con síntomas o sangrado documentado; confirmar tendencia y estabilidad clínica.')

  return alerts
}

function buildSoap(summary: SummaryLike, sourceText?: string): NonNullable<ClinicalCopilotDraft['soap_draft']> {
  const latest = summary.latest_encounters[0]
  const activeProblems = summary.problems
    .filter(problem => problem.status === 'ACTIVE' || problem.status === 'CHRONIC')
    .map(problem => problem.title)
    .slice(0, 4)
    .join('; ')

  const lastVitals = summary.latest_vitals[0]
  const vitalsText = lastVitals
    ? [
      lastVitals.blood_pressure_systolic && lastVitals.blood_pressure_diastolic
        ? `PA ${lastVitals.blood_pressure_systolic}/${lastVitals.blood_pressure_diastolic} mmHg`
        : null,
      lastVitals.heart_rate ? `FC ${lastVitals.heart_rate} lpm` : null,
      lastVitals.respiratory_rate ? `FR ${lastVitals.respiratory_rate} rpm` : null,
      lastVitals.oxygen_saturation ? `SpO2 ${lastVitals.oxygen_saturation}%` : null,
      lastVitals.weight_kg ? `peso ${lastVitals.weight_kg} kg` : null,
      lastVitals.height_cm ? `talla ${lastVitals.height_cm} cm` : null,
      lastVitals.glucose_mg_dl ? `glucosa ${lastVitals.glucose_mg_dl} mg/dL` : null,
      lastVitals.temperature_celsius ? `T ${lastVitals.temperature_celsius} C` : null,
    ].filter(Boolean).join(', ')
    : 'Signos vitales no registrados en esta vista.'

  return {
    subjective: firstNonEmpty(sourceText, latest?.subjective, latest?.chief_complaint)
      ?? 'Completar motivo de consulta, evolución de síntomas, adherencia y síntomas asociados.',
    objective: firstNonEmpty(latest?.objective, vitalsText) ?? vitalsText,
    assessment: firstNonEmpty(latest?.assessment)
      ?? (activeProblems ? `Problemas a correlacionar: ${activeProblems}.` : 'Completar impresión clínica y diagnósticos diferenciales.'),
    plan: firstNonEmpty(latest?.plan)
      ?? 'Completar plan diagnóstico/terapéutico, educación al paciente, signos de alarma y seguimiento.',
  }
}

function buildClinicalAnswer(summary: SummaryLike, question?: string, sourceText?: string) {
  const activeProblems = summary.problems
    .filter(problem => problem.status === 'ACTIVE' || problem.status === 'CHRONIC')
    .map(problem => problem.title)
    .slice(0, 5)

  const latestEncounter = summary.latest_encounters[0]
  const allergies = summary.background.find(item => item.category === 'ALERGIAS')?.content
  const gaps = buildGaps(summary)
  const alerts = buildSoftAlerts(summary)

  const contextLines = [
    activeProblems.length ? `Problemas activos/crónicos registrados: ${activeProblems.join('; ')}.` : 'No hay problemas activos estructurados registrados.',
    allergies ? `Alergias documentadas: ${allergies}.` : 'No hay alergias documentadas de forma estructurada.',
    latestEncounter?.chief_complaint ? `Último motivo de consulta: ${latestEncounter.chief_complaint}.` : null,
    sourceText?.trim() ? `Nota adicional aportada: ${sourceText.trim().slice(0, 500)}.` : null,
  ].filter(Boolean)

  const nextSteps = [
    alerts.length ? `Revisar primero: ${alerts.join(' ')}` : null,
    gaps.length ? `Datos incompletos a confirmar: ${gaps.slice(0, 3).join(' ')}` : null,
    'Usa esta respuesta como orientación para revisar el expediente; no sustituye el juicio clínico ni debe guardarse sin validación.',
  ].filter(Boolean)

  return [
    question ? `Pregunta: ${question.trim()}` : 'Pregunta clínica general sobre el expediente seleccionado.',
    '',
    'Respuesta asistiva basada en la información disponible:',
    ...contextLines.map(line => `- ${line}`),
    '',
    'Siguientes puntos sugeridos:',
    ...nextSteps.map(line => `- ${line}`),
  ].join('\n')
}

export function buildClinicalCopilotDraft(
  mode: ClinicalCopilotMode,
  summary: SummaryLike,
  sourceText?: string,
  question?: string,
): ClinicalCopilotDraft {
  const evidence = buildEvidence(summary)
  const suggestedQuestions = buildQuestions(summary)
  const clinicalGaps = buildGaps(summary)
  const softAlerts = buildSoftAlerts(summary)
  const activeProblemCount = summary.problems.filter(problem => problem.status === 'ACTIVE' || problem.status === 'CHRONIC').length
  const latestEncounter = summary.latest_encounters[0]

  const draft: ClinicalCopilotDraft = {
    mode,
    model: 'meditrack-copilot-local-v1',
    safety_notice: COPILOT_NOTICE,
    summary: [
      `${summary.patient.first_name} ${summary.patient.last_name}, ${formatPatientAge(summary.patient.date_of_birth)}.`,
      activeProblemCount ? `${activeProblemCount} problema(s) activo(s)/crónico(s) documentado(s).` : 'Sin problemas estructurados documentados.',
      latestEncounter?.chief_complaint ? `Último motivo: ${latestEncounter.chief_complaint}.` : null,
      summary.treatments.some(plan => plan.status === 'ACTIVE') ? 'Tiene tratamiento activo registrado.' : 'Sin tratamiento activo registrado en esta vista.',
    ].filter(Boolean).join(' '),
    suggested_questions: mode === 'DRAFT_SOAP' ? suggestedQuestions.slice(0, 4) : suggestedQuestions,
    clinical_gaps: mode === 'SUGGEST_PATIENT_QUESTIONS' ? clinicalGaps.slice(0, 4) : clinicalGaps,
    soft_alerts: softAlerts,
    evidence,
  }

  if (mode === 'ASK_CLINICAL_QUESTION') {
    draft.answer = buildClinicalAnswer(summary, question, sourceText)
    draft.suggested_questions = suggestedQuestions.slice(0, 4)
    draft.clinical_gaps = clinicalGaps.slice(0, 4)
  }

  if (mode === 'DRAFT_SOAP' || mode === 'PREPARE_CONSULTATION') {
    draft.soap_draft = buildSoap(summary, sourceText)
  }

  return draft
}
