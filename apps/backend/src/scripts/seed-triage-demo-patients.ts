import bcrypt from 'bcryptjs'
import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  aiUsageEvents,
  clinicalAudioTranscripts,
  clinicalDataProvenance,
  clinicalReviewItems,
  db,
  encounters,
  labOrders,
  labResults,
  medicationItems,
  patientBackground,
  patientProblems,
  patients,
  tenants,
  treatmentInterventions,
  treatmentPlans,
  users,
  vitalSigns,
} from '../shared/db/index.ts'

const DOCTOR_EMAIL = process.env.DEMO_DOCTOR_EMAIL?.trim() || 'demo.ai@meditrack.app'
const DOCTOR_PASSWORD = process.env.DEMO_DOCTOR_PASSWORD?.trim() || 'DemoIA2026!'
const DEMO_CLINIC_NAME = process.env.DEMO_CLINIC_NAME?.trim() || 'Clinica Demo IA'
const DEMO_CLINIC_SLUG = process.env.DEMO_CLINIC_SLUG?.trim() || 'clinica-demo-ia'
const SEED = 'triage-demo-patients-v1'
const DEMO = 'DEMO TRIAGE IA'

type LabStatus = 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL_HIGH' | 'CRITICAL_LOW'

type DemoPatient = {
  idNumber: string
  firstName: string
  lastName: string
  dob: string
  sex: 'male' | 'female' | 'other'
  phone: string
  email: string
  level: string
  notes: string
  background: Array<{ category: 'ALERGIAS' | 'APP' | 'AHF' | 'MEDICAMENTOS' | 'APNP' | 'AQ' | 'ATRAUMA' | 'GINECO_OBS' | 'PERINATAL'; content: string }>
  encounters: Array<{
    type: 'CONSULTATION' | 'FOLLOW_UP' | 'CHRONIC_CONTROL' | 'EMERGENCY'
    status: 'CLOSED' | 'OPEN'
    openedAt: string
    closedAt?: string
    chief: string
    subjective: string
    objective: string
    assessment: string
    plan: string
    summary: string
  }>
  problems: Array<{
    title: string
    description: string
    icd10: string
    status: 'ACTIVE' | 'CHRONIC' | 'INACTIVE' | 'RESOLVED'
    onset: string
    notes: string
    encounterIndex: number
  }>
  vitals: Array<{
    encounterIndex?: number
    recordedAt: string
    bp?: [number, number]
    hr?: number
    rr?: number
    temp?: string | null
    weight?: string
    height?: string
    spo2?: number
    glucose?: number
  }>
  labs?: {
    encounterIndex: number
    orderedAt: string
    notes: string
    results: Array<[string, string, string, string | null, string | null, string | null, string | null, LabStatus]>
  }
  meds: Array<{ drug: string; dose: number; unit: string; frequency: 'DAILY' | 'AS_NEEDED'; time?: string; instructions: string }>
  interventions: Array<{ type: 'DIET' | 'EXERCISE' | 'MONITORING' | 'THERAPY' | 'OTHER'; title: string; description: string }>
  reviewItems: Array<{ encounterIndex: number; priority: 'LOW' | 'NORMAL' | 'HIGH'; title: string; summary: string }>
  transcript: { encounterIndex: number; text: string; summary: string }
  aiQuestion: string
  aiSnapshot: {
    summary: string
    answer: string
    suggestedQuestions: string[]
    clinicalGaps: string[]
    softAlerts: string[]
  }
}

const demoPatients: DemoPatient[] = [
  {
    idNumber: 'TRIAGE-DEMO-001',
    firstName: 'Mateo Andres',
    lastName: 'Solis Herrera',
    dob: '1988-03-04',
    sex: 'male',
    phone: '+50254010001',
    email: 'mateo.triage.demo@example.test',
    level: 'estable',
    notes: 'Paciente estable para probar que la IA no sobreactive alertas.',
    background: [
      { category: 'ALERGIAS', content: 'Niega alergias medicamentosas.' },
      { category: 'APP', content: 'Rinitis alergica estacional y dislipidemia leve en control. Sin diabetes ni HTA.' },
      { category: 'AHF', content: 'Padre con hipertension despues de los 60 anos. Madre sana.' },
      { category: 'APNP', content: 'No fuma. Corre 3 veces por semana. Alimentacion generalmente balanceada.' },
      { category: 'MEDICAMENTOS', content: 'Cetirizina PRN en temporada alergica. Omega 3 OTC ocasional.' },
    ],
    encounters: [
      {
        type: 'CONSULTATION',
        status: 'CLOSED',
        openedAt: '2026-03-18T09:00:00.000Z',
        closedAt: '2026-03-18T09:25:00.000Z',
        chief: 'Chequeo preventivo y congestión nasal estacional',
        subjective: 'Refiere estornudos y congestión nasal por polen. Niega fiebre, disnea, dolor torácico o pérdida de peso. Ejercicio tolerado.',
        objective: 'PA 118/74, FC 66, FR 14, T 36.5, SpO2 99%, peso 72.4 kg, talla 176 cm. Exploración general sin hallazgos de alarma.',
        assessment: 'Rinitis alergica estacional. Riesgo cardiometabolico bajo con LDL ligeramente elevado en control previo.',
        plan: 'Medidas ambientales, antihistaminico PRN y control anual. Solicitar perfil lipídico de seguimiento.',
        summary: 'Chequeo estable con rinitis alergica sin datos de alarma.',
      },
      {
        type: 'FOLLOW_UP',
        status: 'CLOSED',
        openedAt: '2026-04-22T10:00:00.000Z',
        closedAt: '2026-04-22T10:20:00.000Z',
        chief: 'Revisión de laboratorios preventivos',
        subjective: 'Se siente bien. Mantiene actividad física. Niega síntomas.',
        objective: 'PA 116/72, FC 64, peso 72.0 kg, SpO2 99%.',
        assessment: 'LDL 126 mg/dL, resto de laboratorios normales. Sin indicios de enfermedad aguda.',
        plan: 'Continuar ejercicio y dieta. Repetir control en 6-12 meses.',
        summary: 'Paciente estable con dislipidemia leve aislada.',
      },
    ],
    problems: [
      { title: 'Dislipidemia leve estable', description: 'LDL 126 mg/dL sin otros factores mayores.', icd10: 'E78.5', status: 'ACTIVE', onset: '2026-04-22', notes: 'No genera alerta inmediata; usar para probar baja prioridad.', encounterIndex: 1 },
      { title: 'Rinitis alergica estacional', description: 'Síntomas leves controlados con antihistamínico.', icd10: 'J30.2', status: 'CHRONIC', onset: '2024-01-01', notes: 'Sin exacerbación actual.', encounterIndex: 0 },
    ],
    vitals: [
      { encounterIndex: 0, recordedAt: '2026-03-18T09:05:00.000Z', bp: [118, 74], hr: 66, rr: 14, temp: '36.5', weight: '72.40', height: '176.0', spo2: 99, glucose: 91 },
      { encounterIndex: 1, recordedAt: '2026-04-22T10:05:00.000Z', bp: [116, 72], hr: 64, rr: 14, temp: '36.6', weight: '72.00', height: '176.0', spo2: 99, glucose: 88 },
      { recordedAt: '2026-05-12T07:30:00.000Z', bp: [117, 73], hr: 62, rr: 14, temp: null, weight: '71.80', height: '176.0', spo2: 99, glucose: 90 },
    ],
    labs: {
      encounterIndex: 1,
      orderedAt: '2026-04-22T10:10:00.000Z',
      notes: 'Panel preventivo estable.',
      results: [
        ['Lipidos', 'LDL colesterol', '126', '126', 'mg/dL', null, '100', 'HIGH'],
        ['Lipidos', 'Trigliceridos', '118', '118', 'mg/dL', null, '150', 'NORMAL'],
        ['Metabolico', 'Glucosa en ayunas', '88', '88', 'mg/dL', '70', '99', 'NORMAL'],
        ['Renal', 'Creatinina', '0.86', '0.86', 'mg/dL', '0.70', '1.20', 'NORMAL'],
        ['Hematologia', 'Hemoglobina', '15.1', '15.1', 'g/dL', '13.5', '17.5', 'NORMAL'],
      ],
    },
    meds: [
      { drug: 'Cetirizina', dose: 10, unit: 'mg', frequency: 'AS_NEEDED', instructions: 'Usar si congestión o estornudos.' },
    ],
    interventions: [
      { type: 'EXERCISE', title: 'Mantener actividad física', description: 'Correr o caminar 150 min/semana.' },
      { type: 'DIET', title: 'Dieta cardioprotectora', description: 'Reducir grasas trans y ultraprocesados.' },
    ],
    reviewItems: [],
    transcript: {
      encounterIndex: 1,
      text: 'Me siento bien, solo quiero saber si el colesterol leve requiere preocuparme.',
      summary: 'Paciente estable consulta por LDL levemente elevado sin síntomas.',
    },
    aiQuestion: '¿Este paciente tiene algo que requiera priorización clínica o solo seguimiento preventivo?',
    aiSnapshot: {
      summary: 'Paciente estable con rinitis alergica y LDL levemente elevado, biometría normal y sin síntomas de alarma.',
      answer: 'Riesgos inmediatos:\n- No se identifican datos de inestabilidad en el contexto disponible.\nDatos a confirmar:\n- Riesgo cardiovascular global y antecedentes familiares.\nPreguntas clave:\n- ¿Dolor torácico, disnea o intolerancia nueva al ejercicio?\nSiguiente paso seguro:\n- Seguimiento preventivo ambulatorio parece razonable si sigue asintomático y biometría estable.',
      suggestedQuestions: ['¿Ha cambiado su tolerancia al ejercicio?', '¿Fuma o usa vapeador?', '¿Hay enfermedad coronaria prematura familiar?'],
      clinicalGaps: ['No hay cálculo formal de riesgo cardiovascular.', 'No se documenta circunferencia abdominal.'],
      softAlerts: [],
    },
  },
  {
    idNumber: 'TRIAGE-DEMO-002',
    firstName: 'Rosa Elena',
    lastName: 'Cifuentes Morales',
    dob: '1962-11-19',
    sex: 'female',
    phone: '+50254010002',
    email: 'rosa.triage.demo@example.test',
    level: 'cronico-moderado',
    notes: 'Diabetes e hipertension con control irregular, sin datos actuales de urgencia.',
    background: [
      { category: 'ALERGIAS', content: 'Alergia a sulfas: rash difuso.' },
      { category: 'APP', content: 'Diabetes tipo 2 hace 10 años, hipertensión hace 8 años, obesidad grado I.' },
      { category: 'AHF', content: 'Madre con diabetes y enfermedad renal. Padre con ACV a los 70 años.' },
      { category: 'APNP', content: 'Sedentaria, dieta alta en pan dulce. No fuma.' },
      { category: 'MEDICAMENTOS', content: 'Metformina XR, losartan, hidroclorotiazida; omite dosis por molestias GI y olvido.' },
    ],
    encounters: [
      {
        type: 'CHRONIC_CONTROL',
        status: 'CLOSED',
        openedAt: '2026-03-20T15:00:00.000Z',
        closedAt: '2026-03-20T15:35:00.000Z',
        chief: 'Control de diabetes e hipertension',
        subjective: 'Refiere cansancio leve, poliuria ocasional y olvidos de metformina 2-3 veces por semana. Niega dolor torácico, disnea o visión borrosa aguda.',
        objective: 'PA 148/88, FC 78, peso 82.3 kg, talla 156 cm, SpO2 97%. Pies sin úlceras.',
        assessment: 'DM2 e HTA con control subóptimo probable por adherencia y dieta.',
        plan: 'Solicitar HbA1c, renal, microalbuminuria y lípidos. Reforzar bitácora y educación.',
        summary: 'Control crónico subóptimo sin datos de urgencia.',
      },
      {
        type: 'FOLLOW_UP',
        status: 'CLOSED',
        openedAt: '2026-04-18T11:00:00.000Z',
        closedAt: '2026-04-18T11:30:00.000Z',
        chief: 'Revisión de laboratorios de diabetes',
        subjective: 'Trae laboratorios. Glucosas en casa 150-210. Niega hipoglucemias. Ardor plantar nocturno ocasional.',
        objective: 'PA 146/90, FC 80, peso 82.0 kg. Monofilamento conservado, piel seca.',
        assessment: 'HbA1c 8.2%, LDL elevado, ACR moderadamente aumentada. Sin daño agudo documentado.',
        plan: 'Conciliar medicamentos, reforzar adherencia, seguimiento 4 semanas con bitácora.',
        summary: 'DM2 descontrolada moderada con microalbuminuria.',
      },
      {
        type: 'FOLLOW_UP',
        status: 'OPEN',
        openedAt: '2026-05-14T16:00:00.000Z',
        chief: 'Seguimiento por glucosa elevada en casa',
        subjective: 'Reporta glucosa 238 tras comida alta en carbohidratos. Sin vómitos, sin dolor abdominal, sin confusión.',
        objective: 'Registro remoto PA 152/92, glucosa 226, SpO2 97%.',
        assessment: 'Hiperglucemia ambulatoria sin signos de crisis en datos disponibles.',
        plan: 'Revisar adherencia, síntomas de alarma y bitácora.',
        summary: 'Seguimiento activo por DM2 descontrolada sin datos de emergencia.',
      },
    ],
    problems: [
      { title: 'Diabetes mellitus tipo 2 descontrolada moderada', description: 'HbA1c 8.2%, glucosas en casa 150-238.', icd10: 'E11.9', status: 'CHRONIC', onset: '2016-01-01', notes: 'Sin datos actuales de cetoacidosis o estado hiperosmolar.', encounterIndex: 1 },
      { title: 'Hipertension arterial suboptimamente controlada', description: 'PA usual 146-152/88-92.', icd10: 'I10', status: 'CHRONIC', onset: '2018-01-01', notes: 'Revisar adherencia y sodio.', encounterIndex: 0 },
      { title: 'Albuminuria moderada probable', description: 'ACR 48 mg/g.', icd10: 'R80.9', status: 'ACTIVE', onset: '2026-04-18', notes: 'Validar tendencia renal.', encounterIndex: 1 },
    ],
    vitals: [
      { encounterIndex: 0, recordedAt: '2026-03-20T15:05:00.000Z', bp: [148, 88], hr: 78, rr: 16, temp: '36.6', weight: '82.30', height: '156.0', spo2: 97, glucose: 184 },
      { encounterIndex: 1, recordedAt: '2026-04-18T11:05:00.000Z', bp: [146, 90], hr: 80, rr: 16, temp: '36.5', weight: '82.00', height: '156.0', spo2: 97, glucose: 176 },
      { recordedAt: '2026-05-14T07:45:00.000Z', bp: [152, 92], hr: 84, rr: 16, temp: null, weight: '82.20', height: '156.0', spo2: 97, glucose: 226 },
    ],
    labs: {
      encounterIndex: 1,
      orderedAt: '2026-04-18T11:20:00.000Z',
      notes: 'Panel metabólico y renal para control de diabetes.',
      results: [
        ['Metabolico', 'HbA1c', '8.2', '8.2', '%', '4.0', '5.6', 'HIGH'],
        ['Metabolico', 'Glucosa en ayunas', '172', '172', 'mg/dL', '70', '99', 'HIGH'],
        ['Renal', 'Creatinina', '0.98', '0.98', 'mg/dL', '0.50', '0.95', 'HIGH'],
        ['Renal', 'eGFR CKD-EPI', '66', '66', 'mL/min/1.73m2', '90', null, 'LOW'],
        ['Renal', 'Albumina/creatinina urinaria', '48', '48', 'mg/g', null, '30', 'HIGH'],
        ['Lipidos', 'LDL colesterol', '142', '142', 'mg/dL', null, '100', 'HIGH'],
      ],
    },
    meds: [
      { drug: 'Metformina XR', dose: 1000, unit: 'mg', frequency: 'DAILY', time: '20:00', instructions: 'Tomar con cena; revisar tolerancia GI.' },
      { drug: 'Losartan', dose: 50, unit: 'mg', frequency: 'DAILY', time: '07:00', instructions: 'Tomar por la mañana.' },
      { drug: 'Hidroclorotiazida', dose: 12.5, unit: 'mg', frequency: 'DAILY', time: '07:00', instructions: 'Vigilar PA y electrolitos.' },
    ],
    interventions: [
      { type: 'MONITORING', title: 'Bitácora glucosa y PA', description: 'Glucosa en ayunas y PA 5 días por semana.' },
      { type: 'DIET', title: 'Reducción de harinas simples', description: 'Plan de comidas y educación en porciones.' },
    ],
    reviewItems: [
      { encounterIndex: 1, priority: 'NORMAL', title: 'Confirmar albuminuria moderada', summary: 'ACR 48 mg/g requiere repetición y correlación con control glucémico/PA.' },
    ],
    transcript: {
      encounterIndex: 2,
      text: 'Me sube el azúcar cuando como pan dulce, pero no he tenido vómitos ni confusión. A veces olvido la metformina.',
      summary: 'Paciente reporta hiperglucemia posprandial y omisiones de metformina sin síntomas de crisis.',
    },
    aiQuestion: '¿Esta paciente requiere atención urgente o ajuste ambulatorio estructurado?',
    aiSnapshot: {
      summary: 'DM2 e HTA subóptimas con albuminuria moderada, sin datos actuales de crisis hiperglucémica.',
      answer: 'Riesgos inmediatos:\n- No hay datos actuales de cetoacidosis/estado hiperosmolar en el contexto disponible.\nDatos a confirmar:\n- Síntomas de alarma, cetonas si hay vómitos/dolor abdominal y bitácora real.\nPreguntas clave:\n- ¿Vómitos, dolor abdominal, somnolencia o respiración rápida?\nSiguiente paso seguro:\n- Seguimiento ambulatorio estructurado puede ser razonable si sigue estable y sin síntomas de crisis.',
      suggestedQuestions: ['¿Cuántas dosis omitió esta semana?', '¿Ha tenido sed intensa o pérdida de peso?', '¿Puede traer bitácora de glucosa?'],
      clinicalGaps: ['No hay bitácora completa.', 'Falta repetir ACR.', 'No hay fondo de ojo reciente.'],
      softAlerts: [],
    },
  },
  {
    idNumber: 'TRIAGE-DEMO-003',
    firstName: 'Jorge Luis',
    lastName: 'Alvarado Reyes',
    dob: '1957-02-11',
    sex: 'male',
    phone: '+50254010003',
    email: 'jorge.triage.demo@example.test',
    level: 'alto-riesgo-respiratorio',
    notes: 'EPOC con exacerbaciones, saturación límite y neumonía probable: probar evaluación presencial probable.',
    background: [
      { category: 'ALERGIAS', content: 'Niega alergias.' },
      { category: 'APP', content: 'EPOC moderado, hipertensión controlada, exfumador 35 paquetes/año.' },
      { category: 'AHF', content: 'Padre con EPOC. Madre con HTA.' },
      { category: 'APNP', content: 'Exfumador, dejó hace 3 años. Vive con esposa. Usa inhaladores de forma irregular.' },
      { category: 'MEDICAMENTOS', content: 'Tiotropio diario irregular, salbutamol PRN, losartan 50 mg.' },
    ],
    encounters: [
      {
        type: 'CHRONIC_CONTROL',
        status: 'CLOSED',
        openedAt: '2026-03-12T08:30:00.000Z',
        closedAt: '2026-03-12T09:00:00.000Z',
        chief: 'Control EPOC y tos crónica',
        subjective: 'Tos matutina crónica, disnea mMRC 1-2. Usa tiotropio 4 días/semana. Niega fiebre.',
        objective: 'PA 130/78, FC 82, FR 18, SpO2 94%, peso 76 kg.',
        assessment: 'EPOC moderado estable con adherencia irregular.',
        plan: 'Reforzar inhaladores, vacunas, plan de acción y signos de alarma.',
        summary: 'EPOC estable con saturación basal 94%.',
      },
      {
        type: 'FOLLOW_UP',
        status: 'CLOSED',
        openedAt: '2026-04-25T09:15:00.000Z',
        closedAt: '2026-04-25T09:45:00.000Z',
        chief: 'Aumento de tos y esputo',
        subjective: 'Hace 5 días aumentó tos con esputo amarillo, disnea al caminar una cuadra. Sin dolor torácico.',
        objective: 'T 37.8, FC 96, FR 22, SpO2 92-93%, sibilancias dispersas.',
        assessment: 'Exacerbación EPOC leve-moderada; vigilar neumonía.',
        plan: 'Seguimiento 48-72 h, biometría, signos de alarma y considerar imagen/labs si fiebre o deterioro.',
        summary: 'Exacerbación EPOC con SpO2 menor a basal.',
      },
      {
        type: 'EMERGENCY',
        status: 'OPEN',
        openedAt: '2026-05-15T07:50:00.000Z',
        chief: 'Disnea progresiva y fiebre',
        subjective: 'Disnea al hablar frases cortas desde ayer, fiebre 38.6, esputo verdoso y dolor pleurítico leve derecho. Usa salbutamol cada 3 horas.',
        objective: 'Registro remoto: SpO2 88-90%, FR 30, FC 118, T 38.6. Pendiente evaluación presencial.',
        assessment: 'Alto riesgo de exacerbación EPOC severa/neumonía con hipoxemia.',
        plan: 'Indicar evaluación presencial urgente por hipoxemia, fiebre, taquipnea y deterioro funcional.',
        summary: 'Deterioro respiratorio agudo con SpO2 88-90%, fiebre y taquipnea.',
      },
    ],
    problems: [
      { title: 'EPOC moderado con exacerbacion aguda', description: 'SpO2 88-90%, FR 30, fiebre y disnea al hablar.', icd10: 'J44.1', status: 'ACTIVE', onset: '2026-05-15', notes: 'Alto riesgo, probable evaluación presencial urgente.', encounterIndex: 2 },
      { title: 'Neumonia adquirida en la comunidad probable', description: 'Fiebre, esputo purulento, dolor pleurítico y leucocitosis.', icd10: 'J18.9', status: 'ACTIVE', onset: '2026-05-15', notes: 'Confirmar con examen, imagen y labs.', encounterIndex: 2 },
      { title: 'Hipertension arterial controlada', description: 'PA usual en meta.', icd10: 'I10', status: 'CHRONIC', onset: '2017-01-01', notes: 'No prioridad actual.', encounterIndex: 0 },
    ],
    vitals: [
      { encounterIndex: 0, recordedAt: '2026-03-12T08:35:00.000Z', bp: [130, 78], hr: 82, rr: 18, temp: '36.7', weight: '76.00', height: '169.0', spo2: 94, glucose: 101 },
      { encounterIndex: 1, recordedAt: '2026-04-25T09:20:00.000Z', bp: [134, 80], hr: 96, rr: 22, temp: '37.8', weight: '75.70', height: '169.0', spo2: 92, glucose: 112 },
      { recordedAt: '2026-05-15T07:30:00.000Z', bp: [146, 84], hr: 118, rr: 30, temp: '38.6', weight: '75.10', height: '169.0', spo2: 89, glucose: 128 },
    ],
    labs: {
      encounterIndex: 2,
      orderedAt: '2026-05-15T08:00:00.000Z',
      notes: 'Laboratorio externo/urgencias probable neumonía.',
      results: [
        ['Hematologia', 'Leucocitos', '17.8', '17.8', '10^3/uL', '4.0', '10.0', 'HIGH'],
        ['Inflamacion', 'PCR', '92', '92', 'mg/L', null, '5', 'HIGH'],
        ['Renal', 'Creatinina', '1.10', '1.10', 'mg/dL', '0.70', '1.20', 'NORMAL'],
        ['Gases', 'Lactato', '1.8', '1.8', 'mmol/L', '0.5', '2.0', 'NORMAL'],
      ],
    },
    meds: [
      { drug: 'Tiotropio', dose: 18, unit: 'mcg', frequency: 'DAILY', time: '07:00', instructions: 'Uso diario; revisar técnica.' },
      { drug: 'Salbutamol', dose: 2, unit: 'puff', frequency: 'AS_NEEDED', instructions: 'Registrar frecuencia; uso cada 3 horas es señal de alarma.' },
      { drug: 'Losartan', dose: 50, unit: 'mg', frequency: 'DAILY', time: '07:00', instructions: 'Continuar si tolera.' },
    ],
    interventions: [
      { type: 'OTHER', title: 'Plan de acción EPOC', description: 'Consultar por SpO2 baja, disnea al hablar, fiebre o uso frecuente de rescate.' },
      { type: 'MONITORING', title: 'Registro respiratorio', description: 'SpO2, FR, fiebre y uso de salbutamol.' },
    ],
    reviewItems: [
      { encounterIndex: 2, priority: 'HIGH', title: 'Deterioro respiratorio con hipoxemia', summary: 'SpO2 88-90%, fiebre y FR 30 requieren evaluación presencial urgente.' },
    ],
    transcript: {
      encounterIndex: 2,
      text: 'Me cuesta terminar frases, tengo fiebre y el inhalador me dura poco. El oxímetro marca 89.',
      summary: 'Disnea al hablar, fiebre, uso frecuente de salbutamol y SpO2 89.',
    },
    aiQuestion: '¿Este paciente necesita evaluación presencial urgente o puede observarse en casa?',
    aiSnapshot: {
      summary: 'EPOC con deterioro respiratorio, fiebre, SpO2 88-90%, FR 30 y FC 118.',
      answer: 'Riesgos inmediatos:\n- Hipoxemia con disnea al hablar y taquipnea: cambia prioridad hacia evaluación presencial urgente.\n- Fiebre, esputo purulento y leucocitosis sugieren infección respiratoria relevante.\nDatos a confirmar:\n- Saturación real, uso de músculos accesorios, estado mental y presión arterial.\nPreguntas clave:\n- ¿Puede hablar frases completas o hay confusión/cianosis?\nSiguiente paso seguro:\n- Con SpO2 88-90%, FR 30 y fiebre, la evaluación presencial urgente es el curso seguro.',
      suggestedQuestions: ['¿Puede caminar al baño sin detenerse?', '¿Ha tenido confusión o somnolencia?', '¿Cuántas veces usó salbutamol hoy?'],
      clinicalGaps: ['No hay auscultación presencial.', 'Falta imagen de tórax.', 'No hay gasometría.'],
      softAlerts: ['Hipoxemia con disnea al hablar y taquipnea.', 'Fiebre con sospecha de neumonía en paciente EPOC.'],
    },
  },
  {
    idNumber: 'TRIAGE-DEMO-004',
    firstName: 'Valeria Sofia',
    lastName: 'Mendez Castillo',
    dob: '1994-07-09',
    sex: 'female',
    phone: '+50254010004',
    email: 'valeria.triage.demo@example.test',
    level: 'alto-riesgo-obstetrico',
    notes: 'Embarazo 32 semanas con hipertensión, cefalea y proteinuria: riesgo alto.',
    background: [
      { category: 'ALERGIAS', content: 'Niega alergias.' },
      { category: 'APP', content: 'Embarazo actual 32 semanas. Sin HTA previa conocida. Migraña ocasional antes del embarazo.' },
      { category: 'AHF', content: 'Madre con preeclampsia en un embarazo.' },
      { category: 'GINECO_OBS', content: 'G1P0, 32 semanas por FUR confiable. Controles prenatales incompletos.' },
      { category: 'MEDICAMENTOS', content: 'Ácido fólico, hierro prenatal. Automedicación ocasional con acetaminofén.' },
    ],
    encounters: [
      {
        type: 'CONSULTATION',
        status: 'CLOSED',
        openedAt: '2026-03-21T12:00:00.000Z',
        closedAt: '2026-03-21T12:30:00.000Z',
        chief: 'Control prenatal 24 semanas',
        subjective: 'Embarazo sin síntomas de alarma. Movimientos fetales presentes.',
        objective: 'PA 118/72, FC 78, peso 69.2 kg, sin edema.',
        assessment: 'Control prenatal sin datos de alarma.',
        plan: 'Continuar controles, labs prenatales y signos de alarma.',
        summary: 'Control prenatal estable.',
      },
      {
        type: 'FOLLOW_UP',
        status: 'CLOSED',
        openedAt: '2026-04-28T12:10:00.000Z',
        closedAt: '2026-04-28T12:42:00.000Z',
        chief: 'Edema y presión elevada en embarazo',
        subjective: 'Edema en pies al final del día, cefalea leve ocasional. Niega visión borrosa o dolor epigástrico.',
        objective: 'PA 142/92 repetida 140/90, edema +, proteinuria tira 1+.',
        assessment: 'Hipertensión gestacional vs preeclampsia sin criterios severos documentados.',
        plan: 'Vigilancia estrecha, labs, proteinuria, educación signos de alarma y control 1 semana.',
        summary: 'HTA en embarazo con proteinuria leve.',
      },
      {
        type: 'EMERGENCY',
        status: 'OPEN',
        openedAt: '2026-05-15T06:45:00.000Z',
        chief: 'Cefalea intensa, visión borrosa y PA elevada en embarazo',
        subjective: 'Cefalea intensa desde madrugada, fosfenos/visión borrosa, edema facial, dolor epigástrico leve. Movimientos fetales presentes pero menos percibidos.',
        objective: 'Registro remoto: PA 168/112, FC 104. Proteinuria 3+ reportada. Pendiente evaluación presencial.',
        assessment: 'Sospecha de preeclampsia con criterios severos.',
        plan: 'Evaluación obstétrica hospitalaria inmediata.',
        summary: 'Embarazo 32 semanas con PA severa, cefalea intensa, síntomas visuales y proteinuria marcada.',
      },
    ],
    problems: [
      { title: 'Embarazo 32 semanas con sospecha de preeclampsia severa', description: 'PA 168/112, cefalea intensa, visión borrosa, dolor epigástrico y proteinuria 3+.', icd10: 'O14.1', status: 'ACTIVE', onset: '2026-05-15', notes: 'Hospitalización/evaluación obstétrica inmediata probable.', encounterIndex: 2 },
      { title: 'Hipertension gestacional previa', description: 'PA 142/92 con proteinuria 1+ en abril.', icd10: 'O13.9', status: 'ACTIVE', onset: '2026-04-28', notes: 'Progresó a síntomas severos.', encounterIndex: 1 },
    ],
    vitals: [
      { encounterIndex: 0, recordedAt: '2026-03-21T12:05:00.000Z', bp: [118, 72], hr: 78, rr: 16, temp: '36.6', weight: '69.20', height: '162.0', spo2: 99, glucose: 86 },
      { encounterIndex: 1, recordedAt: '2026-04-28T12:15:00.000Z', bp: [142, 92], hr: 88, rr: 17, temp: '36.7', weight: '72.40', height: '162.0', spo2: 98, glucose: 91 },
      { recordedAt: '2026-05-15T06:30:00.000Z', bp: [168, 112], hr: 104, rr: 20, temp: '36.8', weight: '75.10', height: '162.0', spo2: 98, glucose: 94 },
    ],
    labs: {
      encounterIndex: 2,
      orderedAt: '2026-05-15T07:00:00.000Z',
      notes: 'Panel obstétrico externo reportado.',
      results: [
        ['Orina', 'Proteinuria tira reactiva', '3+', null, null, null, null, 'HIGH'],
        ['Hematologia', 'Plaquetas', '118', '118', '10^3/uL', '150', '450', 'LOW'],
        ['Hepatico', 'AST', '78', '78', 'U/L', null, '35', 'HIGH'],
        ['Hepatico', 'ALT', '84', '84', 'U/L', null, '35', 'HIGH'],
        ['Renal', 'Creatinina', '1.10', '1.10', 'mg/dL', '0.50', '0.95', 'HIGH'],
      ],
    },
    meds: [
      { drug: 'Hierro prenatal', dose: 1, unit: 'tableta', frequency: 'DAILY', time: '08:00', instructions: 'Uso prenatal.' },
      { drug: 'Ácido fólico', dose: 1, unit: 'tableta', frequency: 'DAILY', time: '08:00', instructions: 'Uso prenatal.' },
    ],
    interventions: [
      { type: 'OTHER', title: 'Signos de alarma obstétrica', description: 'Cefalea intensa, visión borrosa, dolor epigástrico, sangrado, disminución de movimientos fetales.' },
      { type: 'MONITORING', title: 'Registro PA y movimientos fetales', description: 'PA domiciliaria y percepción fetal según indicación obstétrica.' },
    ],
    reviewItems: [
      { encounterIndex: 2, priority: 'HIGH', title: 'Sospecha de preeclampsia severa', summary: 'PA 168/112, cefalea, visión borrosa, proteinuria 3+, plaquetas bajas y transaminasas elevadas.' },
    ],
    transcript: {
      encounterIndex: 2,
      text: 'Me duele fuerte la cabeza, veo luces y tengo la cara hinchada. La presión me salió 168 sobre 112.',
      summary: 'Paciente embarazada reporta cefalea intensa, fosfenos, edema facial y PA severa.',
    },
    aiQuestion: '¿Qué tan urgente es este caso obstétrico y qué datos debo confirmar?',
    aiSnapshot: {
      summary: 'Embarazo 32 semanas con PA severa, cefalea, síntomas visuales, proteinuria y labs alterados.',
      answer: 'Riesgos inmediatos:\n- PA severa con cefalea y síntomas visuales en embarazo: alto riesgo obstétrico.\n- Plaquetas bajas y transaminasas elevadas aumentan preocupación por complicación severa.\nDatos a confirmar:\n- PA repetida, síntomas neurológicos, dolor epigástrico, movimientos fetales y labs completos.\nPreguntas clave:\n- ¿Hay convulsiones, dolor epigástrico intenso o disminución clara de movimientos fetales?\nSiguiente paso seguro:\n- Este contexto favorece evaluación obstétrica hospitalaria inmediata.',
      suggestedQuestions: ['¿La cefalea cede o es persistente?', '¿Cuándo sintió movimientos fetales por última vez?', '¿Hay sangrado vaginal o salida de líquido?'],
      clinicalGaps: ['No hay evaluación fetal presencial.', 'No hay PA confirmada por técnica clínica.', 'No hay proteinuria cuantitativa.'],
      softAlerts: ['PA severa con síntomas neurológicos en embarazo.', 'Proteinuria 3+ con plaquetas bajas y transaminasas elevadas.'],
    },
  },
  {
    idNumber: 'TRIAGE-DEMO-005',
    firstName: 'Hector Manuel',
    lastName: 'Pineda Robles',
    dob: '1971-12-01',
    sex: 'male',
    phone: '+50254010005',
    email: 'hector.triage.demo@example.test',
    level: 'critico-hospitalizacion',
    notes: 'Caso crítico: diabetes con probable cetoacidosis/sepsis. Hospitalización inmediata casi segura.',
    background: [
      { category: 'ALERGIAS', content: 'Niega alergias.' },
      { category: 'APP', content: 'Diabetes tipo 2 mal controlada, pie diabético previo, hipertensión, enfermedad renal G2.' },
      { category: 'AHF', content: 'Madre con diabetes complicada. Padre con IAM.' },
      { category: 'APNP', content: 'Trabajo de pie, dificultad económica para controles. Exfumador.' },
      { category: 'MEDICAMENTOS', content: 'Insulina glargina irregular, metformina suspendida por cuenta propia, losartan. Reporta no usar insulina 3 días.' },
    ],
    encounters: [
      {
        type: 'CHRONIC_CONTROL',
        status: 'CLOSED',
        openedAt: '2026-03-10T13:30:00.000Z',
        closedAt: '2026-03-10T14:05:00.000Z',
        chief: 'Control diabetes y herida en pie',
        subjective: 'Glucosas 220-280, herida pequeña plantar derecha de 1 semana. Sin fiebre.',
        objective: 'PA 148/88, FC 92, peso 88 kg. Úlcera plantar 1 cm sin celulitis extensa.',
        assessment: 'DM2 mal controlada, úlcera pie diabético superficial.',
        plan: 'Cuidado de herida, educación, labs, seguimiento estrecho.',
        summary: 'DM2 descontrolada con úlcera superficial.',
      },
      {
        type: 'FOLLOW_UP',
        status: 'CLOSED',
        openedAt: '2026-04-11T10:45:00.000Z',
        closedAt: '2026-04-11T11:20:00.000Z',
        chief: 'Herida en pie con aumento de dolor',
        subjective: 'Dolor y secreción leve. Glucosas 280-320. Adherencia irregular a insulina.',
        objective: 'T 37.6, FC 104, pie con eritema perilesional 3 cm, secreción serosa.',
        assessment: 'Infección de pie diabético probable, alto riesgo por hiperglucemia.',
        plan: 'Control estrecho, curación, labs, signos de alarma y reevaluación pronta.',
        summary: 'Infección pie diabético probable con mal control glucémico.',
      },
      {
        type: 'EMERGENCY',
        status: 'OPEN',
        openedAt: '2026-05-15T05:30:00.000Z',
        chief: 'Confusión, vómitos, fiebre y glucosa muy alta',
        subjective: 'Familia reporta 24 h de fiebre, vómitos, dolor abdominal, respiración rápida y confusión. No usó insulina 3 días. Pie derecho con mal olor.',
        objective: 'Registro remoto/triage: glucosa 486, T 39.1, FC 128, FR 32, PA 92/58, SpO2 93%. Somnoliento.',
        assessment: 'Muy alto riesgo de cetoacidosis diabética y sepsis por pie diabético infectado.',
        plan: 'Hospitalización/emergencia inmediata.',
        summary: 'Paciente crítico con hiperglucemia severa, signos de shock/sepsis, vómitos, confusión y pie infectado.',
      },
    ],
    problems: [
      { title: 'Cetoacidosis diabética probable', description: 'Glucosa 486, cetonas positivas, bicarbonato 12, anion gap elevado, vómitos y respiración rápida.', icd10: 'E11.10', status: 'ACTIVE', onset: '2026-05-15', notes: 'Hospitalización inmediata casi segura.', encounterIndex: 2 },
      { title: 'Sepsis probable por infección de pie diabético', description: 'Fiebre 39.1, FC 128, PA 92/58, leucocitosis y pie con mal olor.', icd10: 'A41.9', status: 'ACTIVE', onset: '2026-05-15', notes: 'Emergencia médica.', encounterIndex: 2 },
      { title: 'Diabetes mellitus tipo 2 severamente descontrolada', description: 'HbA1c 11.8%, omisión de insulina.', icd10: 'E11.65', status: 'CHRONIC', onset: '2012-01-01', notes: 'Complicada por pie diabético.', encounterIndex: 0 },
      { title: 'Úlcera/infección de pie diabético derecho', description: 'Herida plantar con eritema, secreción y mal olor.', icd10: 'E11.621', status: 'ACTIVE', onset: '2026-03-10', notes: 'Fuente probable de sepsis.', encounterIndex: 1 },
    ],
    vitals: [
      { encounterIndex: 0, recordedAt: '2026-03-10T13:35:00.000Z', bp: [148, 88], hr: 92, rr: 18, temp: '36.9', weight: '88.00', height: '172.0', spo2: 97, glucose: 248 },
      { encounterIndex: 1, recordedAt: '2026-04-11T10:50:00.000Z', bp: [142, 86], hr: 104, rr: 20, temp: '37.6', weight: '87.50', height: '172.0', spo2: 96, glucose: 312 },
      { recordedAt: '2026-05-15T05:20:00.000Z', bp: [92, 58], hr: 128, rr: 32, temp: '39.1', weight: '85.90', height: '172.0', spo2: 93, glucose: 486 },
    ],
    labs: {
      encounterIndex: 2,
      orderedAt: '2026-05-15T05:45:00.000Z',
      notes: 'Labs críticos de triage para demo.',
      results: [
        ['Metabolico', 'Glucosa', '486', '486', 'mg/dL', '70', '180', 'CRITICAL_HIGH'],
        ['Gases', 'Bicarbonato', '12', '12', 'mmol/L', '22', '28', 'CRITICAL_LOW'],
        ['Gases', 'pH venoso', '7.21', '7.21', null, '7.32', '7.43', 'CRITICAL_LOW'],
        ['Metabolico', 'Anion gap', '24', '24', 'mmol/L', '8', '16', 'HIGH'],
        ['Orina', 'Cetonas', '3+', null, null, null, null, 'HIGH'],
        ['Hematologia', 'Leucocitos', '22.4', '22.4', '10^3/uL', '4.0', '10.0', 'HIGH'],
        ['Inflamacion', 'Lactato', '4.2', '4.2', 'mmol/L', '0.5', '2.0', 'CRITICAL_HIGH'],
        ['Renal', 'Creatinina', '1.86', '1.86', 'mg/dL', '0.70', '1.20', 'HIGH'],
        ['Electrolitos', 'Potasio', '5.8', '5.8', 'mmol/L', '3.5', '5.0', 'HIGH'],
      ],
    },
    meds: [
      { drug: 'Insulina glargina', dose: 26, unit: 'UI', frequency: 'DAILY', time: '21:00', instructions: 'Paciente omitió 3 días; requiere conciliación urgente.' },
      { drug: 'Losartan', dose: 50, unit: 'mg', frequency: 'DAILY', time: '07:00', instructions: 'Revisar por hipotensión/AKI en contexto agudo.' },
    ],
    interventions: [
      { type: 'OTHER', title: 'Plan pie diabético', description: 'Signos de alarma: fiebre, mal olor, eritema progresivo, dolor intenso.' },
      { type: 'MONITORING', title: 'Glucosa y cetonas si enfermo', description: 'Regla de días de enfermedad; no suspender insulina sin indicación.' },
    ],
    reviewItems: [
      { encounterIndex: 2, priority: 'HIGH', title: 'Hospitalización inmediata probable', summary: 'Hipotensión, fiebre, confusión, hiperglucemia crítica, acidosis, lactato elevado y pie infectado.' },
    ],
    transcript: {
      encounterIndex: 2,
      text: 'Está confundido, respira rápido, vomitó varias veces y no se puso insulina desde hace tres días. El pie huele mal.',
      summary: 'Familia reporta confusión, respiración rápida, vómitos, omisión de insulina y pie infectado.',
    },
    aiQuestion: '¿Este paciente puede manejarse ambulatorio o requiere hospitalización inmediata?',
    aiSnapshot: {
      summary: 'Paciente crítico con probable DKA y sepsis: hipotensión, confusión, fiebre, FR 32, glucosa 486, acidosis, lactato 4.2 y pie infectado.',
      answer: 'Riesgos inmediatos:\n- Hipotensión, confusión, fiebre y lactato elevado sugieren sepsis/shock.\n- Glucosa 486 con acidosis, cetonas y vómitos sugiere crisis hiperglucémica grave.\nDatos a confirmar:\n- Estado mental, perfusión, diuresis, potasio, EKG y foco infeccioso.\nPreguntas clave:\n- ¿Está somnoliento, no puede beber o respira profundo/rápido?\nSiguiente paso seguro:\n- El contexto favorece hospitalización/emergencia inmediata; manejo ambulatorio no sería seguro.',
      suggestedQuestions: ['¿Cuándo fue la última dosis de insulina?', '¿Ha orinado en las últimas 6 horas?', '¿La infección del pie se extendió o hay mal olor?'],
      clinicalGaps: ['No hay evaluación presencial de perfusión.', 'Falta EKG con potasio alto.', 'No hay cultivo ni evaluación quirúrgica del pie.'],
      softAlerts: ['Hipotensión, confusión y lactato elevado: riesgo de sepsis/shock.', 'Hiperglucemia crítica con acidosis y cetonas.', 'Potasio 5.8 con acidosis y lesión renal aguda probable.'],
    },
  },
]

async function main() {
  const doctor = await ensureDemoDoctor()

  const ids = demoPatients.map(patient => patient.idNumber)
  const existing = await db.query.patients.findMany({
    where: and(eq(patients.tenant_id, doctor.tenant_id), inArray(patients.id_number, ids)),
    columns: { id: true },
  })

  for (const row of existing) {
    await clearPatientDemo(row.id)
  }

  const created = []
  for (const demo of demoPatients) {
    created.push(await seedPatient(doctor.tenant_id, doctor.id, doctor.email, demo))
  }

  console.log(JSON.stringify({
    ok: true,
    doctor: DOCTOR_EMAIL,
    patients: created,
  }, null, 2))
}

async function ensureDemoDoctor() {
  const existingDoctor = await db.query.users.findFirst({
    where: eq(users.email, DOCTOR_EMAIL),
    columns: { id: true, tenant_id: true, email: true },
  })

  if (existingDoctor) return existingDoctor

  let tenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, DEMO_CLINIC_SLUG),
    columns: { id: true },
  })

  if (!tenant) {
    ;[tenant] = await db.insert(tenants).values({
      name: DEMO_CLINIC_NAME,
      slug: DEMO_CLINIC_SLUG,
      plan_type: 'pro',
      status: 'active',
      settings: {
        demo: true,
        seed: SEED,
      },
    }).returning({ id: tenants.id })
  }

  const now = new Date()
  const [doctor] = await db.insert(users).values({
    tenant_id: tenant.id,
    email: DOCTOR_EMAIL,
    password_hash: await bcrypt.hash(DOCTOR_PASSWORD, 12),
    role: 'DOCTOR',
    first_name: 'Demo',
    last_name: 'IA Clinica',
    professional_id: 'DEMO-IA-2026',
    specialty: 'Medicina interna',
    is_verified: true,
    is_active: true,
    tos_accepted_at: now,
    privacy_policy_accepted_at: now,
  }).returning({ id: users.id, tenant_id: users.tenant_id, email: users.email })

  return doctor
}

async function seedPatient(tenantId: string, doctorId: string, doctorEmail: string, demo: DemoPatient) {
  const [patient] = await db.insert(patients).values({
    tenant_id: tenantId,
    first_name: demo.firstName,
    last_name: demo.lastName,
    date_of_birth: demo.dob,
    sex: demo.sex,
    phone: demo.phone,
    email: demo.email,
    id_number: demo.idNumber,
    tags: ['demo-ia', 'triage-demo', demo.level],
    notes: `${DEMO}: ${demo.notes}\nSeed: ${SEED}.`,
    created_by: doctorId,
  }).returning({ id: patients.id, first_name: patients.first_name, last_name: patients.last_name, id_number: patients.id_number })

  const encounterRows = await db.insert(encounters).values(demo.encounters.map((encounter, index) => ({
    tenant_id: tenantId,
    patient_id: patient.id,
    doctor_id: doctorId,
    encounter_type: encounter.type,
    status: encounter.status,
    chief_complaint: encounter.chief,
    subjective: encounter.subjective,
    objective: encounter.objective,
    assessment: encounter.assessment,
    plan: encounter.plan,
    notes: `${DEMO}: ${demo.level}.`,
    summary: encounter.summary,
    metadata: { seed: SEED, demo_level: demo.level, sequence: index + 1 },
    opened_at: new Date(encounter.openedAt),
    closed_at: encounter.closedAt ? new Date(encounter.closedAt) : undefined,
  }))).returning({ id: encounters.id })

  await db.insert(patientBackground).values(demo.background.map(item => ({
    tenant_id: tenantId,
    patient_id: patient.id,
    category: item.category,
    content: `${DEMO}: ${item.content}`,
    recorded_by: doctorId,
  })))

  await db.insert(patientProblems).values(demo.problems.map((problem, index) => ({
    tenant_id: tenantId,
    patient_id: patient.id,
    problem_number: index + 1,
    title: problem.title,
    description: problem.description,
    icd10_code: problem.icd10,
    status: problem.status,
    onset_date: problem.onset,
    notes: `${DEMO}: ${problem.notes}`,
    identified_in_encounter_id: encounterRows[problem.encounterIndex]?.id,
    created_by: doctorId,
  })))

  await db.insert(vitalSigns).values(demo.vitals.map(vital => ({
    tenant_id: tenantId,
    patient_id: patient.id,
    encounter_id: vital.encounterIndex != null ? encounterRows[vital.encounterIndex]?.id : undefined,
    blood_pressure_systolic: vital.bp?.[0],
    blood_pressure_diastolic: vital.bp?.[1],
    heart_rate: vital.hr,
    respiratory_rate: vital.rr,
    temperature_celsius: vital.temp,
    weight_kg: vital.weight,
    height_cm: vital.height,
    oxygen_saturation: vital.spo2,
    glucose_mg_dl: vital.glucose,
    recorded_by: doctorId,
    recorded_at: new Date(vital.recordedAt),
  })))

  let labOrderId: string | null = null
  if (demo.labs) {
    const [order] = await db.insert(labOrders).values({
      tenant_id: tenantId,
      patient_id: patient.id,
      encounter_id: encounterRows[demo.labs.encounterIndex]?.id,
      ordered_by: doctorId,
      status: 'COMPLETED',
      notes: `${DEMO}: ${demo.labs.notes}`,
      ordered_at: new Date(demo.labs.orderedAt),
    }).returning({ id: labOrders.id })
    labOrderId = order.id

    await db.insert(labResults).values(demo.labs.results.map((result, index) => labResult(order.id, tenantId, result, index + 1)))

    await db.insert(clinicalDataProvenance).values({
      tenant_id: tenantId,
      patient_id: patient.id,
      encounter_id: encounterRows[demo.labs.encounterIndex]?.id,
      source_type: 'EXTERNAL_RECORD',
      source_resource_type: 'MANUAL_TRANSCRIPTION',
      source_label: `${DEMO}: laboratorio demo ${demo.level}`,
      source_excerpt: demo.labs.results.slice(0, 4).map(result => `${result[1]} ${result[2]} ${result[4] ?? ''}`).join('; '),
      target_resource_type: 'LAB_ORDER',
      target_resource_id: order.id,
      target_field: 'results',
      extraction_method: 'manual-triage-demo-seed',
      confidence: 0.84,
      metadata: { seed: SEED, demo_level: demo.level },
      recorded_by: doctorId,
    })
  }

  const [plan] = await db.insert(treatmentPlans).values({
    tenant_id: tenantId,
    patient_id: patient.id,
    encounter_id: encounterRows[0]?.id,
    created_by: doctorId,
    name: `Plan demo ${demo.level}`,
    status: 'ACTIVE',
    start_date: demo.encounters[0].openedAt.slice(0, 10),
    instructions: `${DEMO}: plan activo ficticio para demo ${demo.level}.`,
    activated_at: new Date(demo.encounters[0].openedAt),
  }).returning({ id: treatmentPlans.id })

  if (demo.meds.length) {
    await db.insert(medicationItems).values(demo.meds.map((med, index) => ({
      treatment_plan_id: plan.id,
      drug_name: med.drug,
      dose_amount: med.dose,
      dose_unit: med.unit,
      route: 'oral',
      frequency_type: med.frequency,
      times_per_day: med.time ? [med.time] : [],
      special_instructions: med.instructions,
      sort_order: index + 1,
    })))
  }

  if (demo.interventions.length) {
    await db.insert(treatmentInterventions).values(demo.interventions.map((item, index) => ({
      tenant_id: tenantId,
      treatment_plan_id: plan.id,
      patient_id: patient.id,
      type: item.type,
      title: item.title,
      description: item.description,
      frequency: 'Según indicación',
      duration: '2 meses demo',
      instructions: `${DEMO}: intervención ficticia.`,
      sort_order: index + 1,
    })))
  }

  if (demo.reviewItems.length) {
    await db.insert(clinicalReviewItems).values(demo.reviewItems.map(item => ({
      tenant_id: tenantId,
      patient_id: patient.id,
      encounter_id: encounterRows[item.encounterIndex]?.id,
      item_type: 'OTHER' as const,
      status: 'PENDING' as const,
      priority: item.priority,
      title: `${DEMO}: ${item.title}`,
      summary: item.summary,
      proposed_payload: { seed: SEED, demo_level: demo.level, lab_order_id: labOrderId },
      normalized_payload: { action: 'clinical_review' },
      confidence: item.priority === 'HIGH' ? 0.86 : 0.7,
      reasoning: 'Caso ficticio de demo para probar priorización clínica por IA.',
      created_by: doctorId,
    })))
  }

  await db.insert(clinicalAudioTranscripts).values({
    tenant_id: tenantId,
    patient_id: patient.id,
    encounter_id: encounterRows[demo.transcript.encounterIndex]?.id,
    status: 'NEEDS_REVIEW',
    source_label: `${DEMO}: transcripción demo ${demo.level}`,
    language: 'es',
    processor: 'manual-triage-demo-seed',
    transcript_text: demo.transcript.text,
    segments: [{ speaker: 'patient_or_family', text: demo.transcript.text }],
    summary: demo.transcript.summary,
    duration_seconds: 90,
    confidence: 0.82,
    created_by: doctorId,
  })

  await db.insert(aiUsageEvents).values({
    tenant_id: tenantId,
    actor_id: doctorId,
    patient_id: patient.id,
    encounter_id: encounterRows.at(-1)?.id,
    feature: 'CLINICAL_COPILOT',
    provider: 'openai',
    model: 'gpt-5-mini',
    units: demo.level.includes('critico') || demo.level.includes('alto-riesgo') ? 3 : 1,
    resource_type: 'PATIENT',
    resource_id: patient.id,
    metadata: {
      mode: 'ASK_CLINICAL_QUESTION',
      question: demo.aiQuestion,
      provider: 'openai',
      model: 'gpt-5-mini',
      model_tier: demo.level.includes('critico') || demo.level.includes('alto-riesgo') ? 'premium' : 'standard',
      seeded_by: doctorEmail,
      seed: SEED,
      response_snapshot: {
        summary: demo.aiSnapshot.summary,
        answer: demo.aiSnapshot.answer,
        suggested_questions: demo.aiSnapshot.suggestedQuestions,
        clinical_gaps: demo.aiSnapshot.clinicalGaps,
        soft_alerts: demo.aiSnapshot.softAlerts,
        safety_notice: 'Copiloto clinico asistivo: revisar, corregir y validar antes de usar.',
      },
    },
    created_at: new Date('2026-05-15T10:00:00.000Z'),
  })

  return {
    id: patient.id,
    name: `${patient.first_name} ${patient.last_name}`,
    id_number: patient.id_number,
    level: demo.level,
  }
}

async function clearPatientDemo(patientId: string) {
  await db.execute(sql`delete from ai_usage_events where patient_id = ${patientId} and metadata->>'seed' = ${SEED}`)
  await db.execute(sql`delete from clinical_review_items where patient_id = ${patientId} and proposed_payload->>'seed' = ${SEED}`)
  await db.execute(sql`delete from clinical_audio_transcripts where patient_id = ${patientId} and source_label like ${`${DEMO}:%`}`)
  await db.execute(sql`delete from clinical_data_provenance where patient_id = ${patientId} and metadata->>'seed' = ${SEED}`)
  await db.execute(sql`delete from lab_results where order_id in (select id from lab_orders where patient_id = ${patientId} and notes like ${`${DEMO}:%`})`)
  await db.execute(sql`delete from lab_orders where patient_id = ${patientId} and notes like ${`${DEMO}:%`}`)
  await db.execute(sql`delete from vital_signs where patient_id = ${patientId}`)
  await db.execute(sql`delete from medication_items where treatment_plan_id in (select id from treatment_plans where patient_id = ${patientId} and instructions like ${`${DEMO}:%`})`)
  await db.execute(sql`delete from treatment_interventions where patient_id = ${patientId} and treatment_plan_id in (select id from treatment_plans where patient_id = ${patientId} and instructions like ${`${DEMO}:%`})`)
  await db.execute(sql`delete from treatment_plans where patient_id = ${patientId} and instructions like ${`${DEMO}:%`}`)
  await db.execute(sql`delete from patient_problems where patient_id = ${patientId} and notes like ${`${DEMO}:%`}`)
  await db.execute(sql`delete from patient_background where patient_id = ${patientId} and content like ${`${DEMO}:%`}`)
  await db.execute(sql`delete from encounters where patient_id = ${patientId} and metadata->>'seed' = ${SEED}`)
  await db.execute(sql`delete from patients where id = ${patientId}`)
}

function labResult(orderId: string, tenantId: string, row: NonNullable<DemoPatient['labs']>['results'][number], sortOrder: number) {
  return {
    order_id: orderId,
    tenant_id: tenantId,
    panel_name: row[0],
    parameter_name: row[1],
    value: row[2],
    numeric_value: row[3],
    unit: row[4],
    ref_min: row[5],
    ref_max: row[6],
    status: row[7],
    notes: `${DEMO}: resultado ficticio para pruebas de triage IA.`,
    sort_order: sortOrder,
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
