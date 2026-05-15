import { and, eq, sql } from 'drizzle-orm'
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
  treatmentInterventions,
  treatmentPlans,
  users,
  vitalSigns,
} from '../shared/db/index.ts'

const DOCTOR_EMAIL = 'flowjuyu@gmail.com'
const PATIENT_ID_NUMBER = '420615010101'
const SEED = 'biometrics-ai-demo-v1'
const DEMO = 'DEMO BIOMETRIA IA'

async function main() {
  const doctor = await db.query.users.findFirst({
    where: eq(users.email, DOCTOR_EMAIL),
    columns: { id: true, tenant_id: true, email: true },
  })
  if (!doctor) throw new Error(`Doctor account not found: ${DOCTOR_EMAIL}`)

  let patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, doctor.tenant_id), eq(patients.id_number, PATIENT_ID_NUMBER)),
    columns: { id: true, tenant_id: true, first_name: true, last_name: true },
  })

  if (patient) {
    await clearPreviousDemo(patient.id)
    const [updated] = await db.update(patients)
      .set(patientPayload(doctor.tenant_id, doctor.id))
      .where(eq(patients.id, patient.id))
      .returning({ id: patients.id, tenant_id: patients.tenant_id, first_name: patients.first_name, last_name: patients.last_name })
    patient = updated
  } else {
    const [created] = await db.insert(patients)
      .values(patientPayload(doctor.tenant_id, doctor.id))
      .returning({ id: patients.id, tenant_id: patients.tenant_id, first_name: patients.first_name, last_name: patients.last_name })
    patient = created
  }

  const encounterRows = await db.insert(encounters).values([
    {
      tenant_id: doctor.tenant_id,
      patient_id: patient.id,
      doctor_id: doctor.id,
      encounter_type: 'CONSULTATION',
      status: 'CLOSED',
      chief_complaint: 'Cansancio, disnea leve de esfuerzo y palpitaciones ocasionales',
      subjective: [
        'Paciente femenina de 51 anos refiere fatiga progresiva de 2 meses, disnea al subir gradas y palpitaciones breves al final del dia.',
        'Reporta menstruaciones abundantes e irregulares en los ultimos 8 meses. Niega dolor toracico, sin sincope, sin fiebre.',
        'Antecedente de asma leve intermitente; usa salbutamol ocasional. Toma levotiroxina de forma irregular por olvidar dosis matutina.',
        'Ha ganado peso en el ultimo ano y refiere ronquido ocasional. Actividad fisica limitada por cansancio.',
      ].join('\n'),
      objective: [
        'PA 132/84 mmHg, FC 104 lpm, FR 20 rpm, T 36.5 C, SpO2 94%, peso 84.6 kg, talla 158 cm, IMC 33.9.',
        'Conjuntivas ligeramente palidas. Tiroides no dolorosa, sin nodulos evidentes. Campos pulmonares sin sibilancias al reposo.',
        'Ritmo regular, sin soplos evidentes. Extremidades con edema maleolar leve bilateral. Abdomen sin dolor.',
      ].join('\n'),
      assessment: [
        'Fatiga y disnea de esfuerzo: considerar anemia ferropenica por sangrado uterino anormal, hipotiroidismo subtratado y desacondicionamiento.',
        'Obesidad grado I con probable contribucion cardiometabolica.',
        'Asma leve intermitente sin exacerbacion clara en la evaluacion actual.',
      ].join('\n'),
      plan: [
        'Solicitar hemograma, ferritina, perfil tiroideo, perfil metabolico, HbA1c, lipidos y EKG si palpitaciones persisten.',
        'Registrar biometria seriada: peso, PA, FC, SpO2 y sintomas asociados.',
        'Conciliar levotiroxina y tecnica de uso de inhalador. Educar signos de alarma: disnea en reposo, dolor toracico, sincope, sangrado abundante persistente.',
      ].join('\n'),
      notes: `${DEMO}: consulta inicial para probar biometria y copiloto.`,
      summary: 'Fatiga/disnea en paciente con menstruaciones abundantes, hipotiroidismo tratado irregularmente, obesidad y asma leve.',
      metadata: { seed: SEED, sequence: 1 },
      opened_at: new Date('2026-05-02T10:00:00.000Z'),
      closed_at: new Date('2026-05-02T10:42:00.000Z'),
    },
    {
      tenant_id: doctor.tenant_id,
      patient_id: patient.id,
      doctor_id: doctor.id,
      encounter_type: 'FOLLOW_UP',
      status: 'CLOSED',
      chief_complaint: 'Revision de laboratorios por anemia e hipotiroidismo',
      subjective: [
        'Trae laboratorios externos. Persiste cansancio y palpitaciones ocasionales. Niega melena, hematuria o perdida de peso involuntaria.',
        'Menstruacion reciente duro 9 dias con coagulos. No usa anticoagulantes. Toma ibuprofeno 400 mg para colicos 2-3 dias por ciclo.',
        'Admite omisiones de levotiroxina 3-4 veces por semana.',
      ].join('\n'),
      objective: 'PA 136/86 mmHg, FC 98 lpm, peso 84.1 kg, SpO2 95%. Palidez leve. Sin sangrado activo visible.',
      assessment: [
        'Anemia microcitica probable ferropenica con ferritina baja y sangrado uterino anormal referido.',
        'Hipotiroidismo subtratado por mala adherencia y TSH elevada.',
        'Prediabetes y dislipidemia leve en contexto de obesidad.',
      ].join('\n'),
      plan: [
        'Validar resultados externos, cuantificar sangrado y coordinar evaluacion ginecologica si persiste.',
        'Reforzar toma correcta de levotiroxina y seguimiento de TSH.',
        'Revisar uso de AINEs por sangrado y molestias gastricas. Seguimiento corto con biometria y sintomas.',
      ].join('\n'),
      notes: `${DEMO}: seguimiento con laboratorios anormales.`,
      summary: 'Labs sugieren anemia ferropenica, hipotiroidismo subtratado, prediabetes y dislipidemia leve.',
      metadata: { seed: SEED, sequence: 2 },
      opened_at: new Date('2026-05-10T09:20:00.000Z'),
      closed_at: new Date('2026-05-10T09:55:00.000Z'),
    },
    {
      tenant_id: doctor.tenant_id,
      patient_id: patient.id,
      doctor_id: doctor.id,
      encounter_type: 'FOLLOW_UP',
      status: 'OPEN',
      chief_complaint: 'Seguimiento de edema, peso y fatiga',
      subjective: [
        'Paciente reporta aumento de peso de 1.4 kg en 5 dias segun registro en casa y edema al final del dia.',
        'Disnea sigue siendo de esfuerzo; niega ortopnea franca, dolor toracico o fiebre. Saturacion en casa 93-95%.',
        'Aun no agenda evaluacion ginecologica. Quiere revisar si los datos de peso y saturacion cambian la prioridad del caso.',
      ].join('\n'),
      objective: 'Registro remoto: peso 85.1 kg, PA 142/88 mmHg, FC 102, SpO2 93%. Pendiente examen presencial.',
      assessment: 'Fatiga persistente con anemia probable, hipotiroidismo subtratado y edema/ganancia de peso reciente; requiere correlacion clinica.',
      plan: 'Revisar signos de alarma, biometria, adherencia y necesidad de evaluacion presencial segun sintomas.',
      notes: `${DEMO}: consulta abierta para probar copiloto con datos biometricos recientes.`,
      summary: 'Seguimiento activo por anemia, hipotiroidismo, edema y ganancia de peso reciente.',
      metadata: { seed: SEED, sequence: 3 },
      opened_at: new Date('2026-05-15T08:30:00.000Z'),
    },
  ]).returning({ id: encounters.id })

  const [initialEncounter, labsEncounter, activeEncounter] = encounterRows

  await seedBackground(doctor.tenant_id, patient.id, doctor.id)
  await seedProblems(doctor.tenant_id, patient.id, doctor.id, initialEncounter.id, labsEncounter.id, activeEncounter.id)
  await seedVitals(doctor.tenant_id, patient.id, doctor.id, initialEncounter.id, labsEncounter.id, activeEncounter.id)
  const labOrderId = await seedLabs(doctor.tenant_id, patient.id, doctor.id, labsEncounter.id)
  await seedTreatment(doctor.tenant_id, patient.id, doctor.id, initialEncounter.id)
  await seedReviewAndTranscript(doctor.tenant_id, patient.id, doctor.id, labsEncounter.id, activeEncounter.id, labOrderId)
  await seedAiUsage(doctor.tenant_id, patient.id, doctor.id, doctor.email, activeEncounter.id)

  console.log(JSON.stringify({
    ok: true,
    tenant_id: doctor.tenant_id,
    patient_id: patient.id,
    patient: `${patient.first_name} ${patient.last_name}`,
    id_number: PATIENT_ID_NUMBER,
    seeded: {
      encounters: 3,
      background: 6,
      problems: 5,
      vital_signs: 5,
      lab_orders: 1,
      lab_results: 9,
      treatment_plans: 1,
      review_items: 2,
      transcripts: 1,
      ai_usage_events: 2,
    },
  }, null, 2))
}

function patientPayload(tenantId: string, doctorId: string) {
  return {
    tenant_id: tenantId,
    first_name: 'Lucia Valeria',
    last_name: 'Gomez Rivas',
    date_of_birth: '1975-06-15',
    sex: 'female' as const,
    phone: '+50255124430',
    email: 'lucia.demo.biometria@example.test',
    id_number: PATIENT_ID_NUMBER,
    tags: ['demo-ia', 'biometria', 'anemia-hipotiroidismo', 'prueba-copiloto'],
    notes: [
      `${DEMO}: Paciente ficticia para probar biometria, historial clinico e IA.`,
      'Caso construido: anemia probable por sangrado uterino anormal, hipotiroidismo con mala adherencia, obesidad, prediabetes, edema/ganancia de peso y asma leve.',
      'No usar como caso real.',
    ].join('\n'),
    is_active: true,
    created_by: doctorId,
  }
}

async function seedBackground(tenantId: string, patientId: string, doctorId: string) {
  await db.insert(patientBackground).values([
    { tenant_id: tenantId, patient_id: patientId, category: 'ALERGIAS', content: `${DEMO}: Niega alergias medicamentosas conocidas. Refiere intolerancia gastrica con AINEs en uso repetido.`, recorded_by: doctorId },
    { tenant_id: tenantId, patient_id: patientId, category: 'APP', content: `${DEMO}: Hipotiroidismo primario hace 9 anos; asma leve intermitente desde adolescencia; obesidad grado I; prediabetes reciente; anemia microcitica probable ferropenica en estudio.`, recorded_by: doctorId },
    { tenant_id: tenantId, patient_id: patientId, category: 'AHF', content: `${DEMO}: Madre con hipotiroidismo y diabetes tipo 2. Padre con hipertension y enfermedad coronaria despues de los 65 anos.`, recorded_by: doctorId },
    { tenant_id: tenantId, patient_id: patientId, category: 'APNP', content: `${DEMO}: No fuma. Alcohol ocasional. Trabajo administrativo sedentario. Sueno 5-6 horas, ronquido ocasional. Dieta irregular, alta en harinas y baja en hierro hemo.`, recorded_by: doctorId },
    { tenant_id: tenantId, patient_id: patientId, category: 'GINECO_OBS', content: `${DEMO}: G2P2. Menstruaciones abundantes e irregulares desde hace 8 meses, con coagulos y duracion 7-10 dias. Ultima citologia hace 3 anos.`, recorded_by: doctorId },
    { tenant_id: tenantId, patient_id: patientId, category: 'MEDICAMENTOS', content: `${DEMO}: Levotiroxina 100 mcg manana con omisiones frecuentes; salbutamol inhalador PRN; ibuprofeno 400 mg PRN colicos menstruales; multivitaminico irregular.`, recorded_by: doctorId },
  ])
}

async function seedProblems(tenantId: string, patientId: string, doctorId: string, initialEncounterId: string, labsEncounterId: string, activeEncounterId: string) {
  await db.insert(patientProblems).values([
    { tenant_id: tenantId, patient_id: patientId, problem_number: 1, title: 'Anemia microcitica probable ferropenica', description: 'Hb 9.8 g/dL, VCM 72 fL, ferritina 8 ng/mL y sangrado uterino abundante referido.', icd10_code: 'D50.9', icd10_description: 'Anemia por deficiencia de hierro, no especificada', status: 'ACTIVE', onset_date: '2026-05-10', notes: `${DEMO}: Confirmar fuente de sangrado, sintomas de alarma y tendencia de Hb.`, identified_in_encounter_id: labsEncounterId, created_by: doctorId },
    { tenant_id: tenantId, patient_id: patientId, problem_number: 2, title: 'Sangrado uterino anormal perimenopausico', description: 'Menstruaciones prolongadas con coagulos en los ultimos 8 meses.', icd10_code: 'N93.9', icd10_description: 'Sangrado uterino y vaginal anormal, no especificado', status: 'ACTIVE', onset_date: '2025-09-01', notes: `${DEMO}: Pendiente evaluacion ginecologica y descartar causas estructurales.`, identified_in_encounter_id: labsEncounterId, created_by: doctorId },
    { tenant_id: tenantId, patient_id: patientId, problem_number: 3, title: 'Hipotiroidismo subtratado por mala adherencia', description: 'TSH 12.6 mIU/L con omisiones frecuentes de levotiroxina.', icd10_code: 'E03.9', icd10_description: 'Hipotiroidismo, no especificado', status: 'CHRONIC', onset_date: '2017-01-01', notes: `${DEMO}: Reforzar toma en ayunas y separar de hierro/calcio.`, identified_in_encounter_id: labsEncounterId, created_by: doctorId },
    { tenant_id: tenantId, patient_id: patientId, problem_number: 4, title: 'Obesidad grado I con prediabetes', description: 'IMC 34.1 kg/m2, HbA1c 6.1%.', icd10_code: 'E66.9', icd10_description: 'Obesidad, no especificada', status: 'CHRONIC', onset_date: '2026-05-02', notes: `${DEMO}: Seguimiento de peso, PA y glucosa capilar.`, identified_in_encounter_id: initialEncounterId, created_by: doctorId },
    { tenant_id: tenantId, patient_id: patientId, problem_number: 5, title: 'Edema y ganancia de peso reciente en estudio', description: 'Aumento de peso 1.4 kg en 5 dias, edema maleolar y SpO2 domiciliaria 93-95%.', icd10_code: 'R60.9', icd10_description: 'Edema, no especificado', status: 'ACTIVE', onset_date: '2026-05-15', notes: `${DEMO}: Correlacionar con examen, anemia, tiroides, sintomas respiratorios/cardiacos y medicamentos.`, identified_in_encounter_id: activeEncounterId, created_by: doctorId },
  ])
}

async function seedVitals(tenantId: string, patientId: string, doctorId: string, initialEncounterId: string, labsEncounterId: string, activeEncounterId: string) {
  await db.insert(vitalSigns).values([
    { tenant_id: tenantId, patient_id: patientId, encounter_id: initialEncounterId, blood_pressure_systolic: 132, blood_pressure_diastolic: 84, heart_rate: 104, respiratory_rate: 20, temperature_celsius: '36.5', weight_kg: '84.60', height_cm: '158.0', oxygen_saturation: 94, glucose_mg_dl: 118, recorded_by: doctorId, recorded_at: new Date('2026-05-02T10:05:00.000Z') },
    { tenant_id: tenantId, patient_id: patientId, encounter_id: labsEncounterId, blood_pressure_systolic: 136, blood_pressure_diastolic: 86, heart_rate: 98, respiratory_rate: 18, temperature_celsius: '36.6', weight_kg: '84.10', height_cm: '158.0', oxygen_saturation: 95, glucose_mg_dl: 112, recorded_by: doctorId, recorded_at: new Date('2026-05-10T09:24:00.000Z') },
    { tenant_id: tenantId, patient_id: patientId, encounter_id: null, blood_pressure_systolic: 140, blood_pressure_diastolic: 88, heart_rate: 101, respiratory_rate: 19, temperature_celsius: null, weight_kg: '84.90', height_cm: '158.0', oxygen_saturation: 94, glucose_mg_dl: 121, recorded_by: doctorId, recorded_at: new Date('2026-05-13T07:45:00.000Z') },
    { tenant_id: tenantId, patient_id: patientId, encounter_id: null, blood_pressure_systolic: 142, blood_pressure_diastolic: 88, heart_rate: 102, respiratory_rate: 20, temperature_celsius: null, weight_kg: '85.10', height_cm: '158.0', oxygen_saturation: 93, glucose_mg_dl: 128, recorded_by: doctorId, recorded_at: new Date('2026-05-15T07:30:00.000Z') },
    { tenant_id: tenantId, patient_id: patientId, encounter_id: activeEncounterId, blood_pressure_systolic: 138, blood_pressure_diastolic: 86, heart_rate: 99, respiratory_rate: 19, temperature_celsius: '36.7', weight_kg: '85.00', height_cm: '158.0', oxygen_saturation: 94, glucose_mg_dl: 116, recorded_by: doctorId, recorded_at: new Date('2026-05-15T08:35:00.000Z') },
  ])
}

async function seedLabs(tenantId: string, patientId: string, doctorId: string, encounterId: string) {
  const [order] = await db.insert(labOrders).values({
    tenant_id: tenantId,
    patient_id: patientId,
    encounter_id: encounterId,
    ordered_by: doctorId,
    status: 'COMPLETED',
    notes: `${DEMO}: laboratorio externo transcrito para demo biometria/IA.`,
    ordered_at: new Date('2026-05-10T09:35:00.000Z'),
  }).returning({ id: labOrders.id })

  await db.insert(labResults).values([
    labResult(order.id, tenantId, 'Hematologia', 'Hemoglobina', '9.8', '9.8', 'g/dL', '12.0', '15.5', 'LOW', 1),
    labResult(order.id, tenantId, 'Hematologia', 'VCM', '72', '72', 'fL', '80', '96', 'LOW', 2),
    labResult(order.id, tenantId, 'Hierro', 'Ferritina', '8', '8', 'ng/mL', '15', '150', 'LOW', 3),
    labResult(order.id, tenantId, 'Tiroides', 'TSH', '12.6', '12.6', 'mIU/L', '0.4', '4.0', 'HIGH', 4),
    labResult(order.id, tenantId, 'Tiroides', 'T4 libre', '0.8', '0.8', 'ng/dL', '0.8', '1.8', 'NORMAL', 5),
    labResult(order.id, tenantId, 'Metabolico', 'HbA1c', '6.1', '6.1', '%', '4.0', '5.6', 'HIGH', 6),
    labResult(order.id, tenantId, 'Lipidos', 'LDL colesterol', '138', '138', 'mg/dL', null, '100', 'HIGH', 7),
    labResult(order.id, tenantId, 'Renal', 'Creatinina', '0.82', '0.82', 'mg/dL', '0.50', '0.95', 'NORMAL', 8),
    labResult(order.id, tenantId, 'Hepatico', 'ALT', '31', '31', 'U/L', null, '35', 'NORMAL', 9),
  ])

  return order.id
}

async function seedTreatment(tenantId: string, patientId: string, doctorId: string, encounterId: string) {
  const [plan] = await db.insert(treatmentPlans).values({
    tenant_id: tenantId,
    patient_id: patientId,
    encounter_id: encounterId,
    created_by: doctorId,
    name: 'Plan de seguimiento anemia-tiroides-biometria',
    status: 'ACTIVE',
    start_date: '2026-05-10',
    instructions: `${DEMO}: Plan ficticio para probar lectura de tratamientos por IA.`,
    activated_at: new Date('2026-05-10T10:00:00.000Z'),
  }).returning({ id: treatmentPlans.id })

  await db.insert(medicationItems).values([
    { treatment_plan_id: plan.id, drug_name: 'Levotiroxina', presentation: 'Tableta', concentration: '100 mcg', dose_amount: 100, dose_unit: 'mcg', route: 'oral', frequency_type: 'DAILY', times_per_day: ['06:00'], special_instructions: 'Tomar en ayunas; separar de hierro/calcio al menos 4 horas.', with_food: false, sort_order: 1 },
    { treatment_plan_id: plan.id, drug_name: 'Salbutamol', presentation: 'Inhalador', concentration: '100 mcg/dosis', dose_amount: 2, dose_unit: 'puff', route: 'inhalado', frequency_type: 'AS_NEEDED', times_per_day: [], special_instructions: 'Usar si sibilancias o disnea; registrar frecuencia de uso.', with_food: false, sort_order: 2 },
  ])

  await db.insert(treatmentInterventions).values([
    { tenant_id: tenantId, treatment_plan_id: plan.id, patient_id: patientId, type: 'MONITORING', title: 'Registro de peso y sintomas', description: 'Peso matutino, edema, disnea, palpitaciones y saturacion si disponible.', frequency: 'Diario', duration: '14 dias', instructions: 'Avisar si disnea de reposo, dolor toracico, sincope o sangrado abundante.', sort_order: 1 },
    { tenant_id: tenantId, treatment_plan_id: plan.id, patient_id: patientId, type: 'DIET', title: 'Plan nutricional con hierro dietario', description: 'Aumentar fuentes de hierro y proteina; evitar automedicacion con AINEs repetidos.', frequency: 'Diario', duration: '4 semanas', instructions: 'Coordinar con indicaciones medicas formales tras validacion.', sort_order: 2 },
  ])
}

async function seedReviewAndTranscript(tenantId: string, patientId: string, doctorId: string, labsEncounterId: string, activeEncounterId: string, labOrderId: string) {
  const [provenance] = await db.insert(clinicalDataProvenance).values({
    tenant_id: tenantId,
    patient_id: patientId,
    encounter_id: labsEncounterId,
    source_type: 'EXTERNAL_RECORD',
    source_resource_type: 'MANUAL_TRANSCRIPTION',
    source_label: `${DEMO}: laboratorio externo transcrito`,
    source_excerpt: 'Hb 9.8 g/dL, VCM 72 fL, ferritina 8 ng/mL, TSH 12.6 mIU/L.',
    target_resource_type: 'LAB_ORDER',
    target_resource_id: labOrderId,
    target_field: 'results',
    extraction_method: 'manual-demo-seed',
    confidence: 0.86,
    metadata: { seed: SEED },
    recorded_by: doctorId,
  }).returning({ id: clinicalDataProvenance.id })

  await db.insert(clinicalReviewItems).values([
    {
      tenant_id: tenantId,
      patient_id: patientId,
      encounter_id: labsEncounterId,
      provenance_id: provenance.id,
      item_type: 'LAB_RESULT',
      status: 'PENDING',
      priority: 'HIGH',
      title: `${DEMO}: Validar anemia ferropenica y sangrado uterino`,
      summary: 'Laboratorio externo muestra Hb 9.8, VCM 72 y ferritina 8; requiere validacion, tendencia y correlacion con sangrado uterino.',
      proposed_payload: { seed: SEED, finding: 'IRON_DEFICIENCY_ANEMIA' },
      normalized_payload: { problem: 'Anemia microcitica probable ferropenica' },
      confidence: 0.82,
      reasoning: 'Dato transcrito de laboratorio externo; debe validarse antes de convertirlo en dato estable.',
      created_by: doctorId,
    },
    {
      tenant_id: tenantId,
      patient_id: patientId,
      encounter_id: activeEncounterId,
      item_type: 'OTHER',
      status: 'PENDING',
      priority: 'NORMAL',
      title: `${DEMO}: Revisar ganancia de peso y saturacion limite`,
      summary: 'Registro biometricos recientes muestran peso 85.1 kg, FC 102 y SpO2 93%; correlacionar con disnea, edema y examen presencial.',
      proposed_payload: { seed: SEED, finding: 'WEIGHT_GAIN_LOW_SPO2' },
      normalized_payload: { action: 'clinical_correlation' },
      confidence: 0.68,
      reasoning: 'Hallazgo de biometria seriada; no diagnostico por si solo.',
      created_by: doctorId,
    },
  ])

  await db.insert(clinicalAudioTranscripts).values({
    tenant_id: tenantId,
    patient_id: patientId,
    encounter_id: activeEncounterId,
    status: 'NEEDS_REVIEW',
    source_label: `${DEMO}: transcripcion manual de seguimiento`,
    language: 'es',
    processor: 'manual-demo-seed',
    transcript_text: 'Doctora, hoy pese mas que la semana pasada y se me hinchan los tobillos en la tarde. Me canso al subir gradas, pero no me falta el aire estando sentada. Tambien sigo sangrando muchos dias.',
    segments: [
      { speaker: 'patient', text: 'Hoy pese mas que la semana pasada y se me hinchan los tobillos en la tarde.' },
      { speaker: 'patient', text: 'Me canso al subir gradas, pero no me falta el aire estando sentada.' },
    ],
    summary: 'Paciente reporta ganancia de peso, edema vespertino, disnea de esfuerzo y sangrado menstrual persistente.',
    duration_seconds: 68,
    confidence: 0.8,
    created_by: doctorId,
  })
}

async function seedAiUsage(tenantId: string, patientId: string, doctorId: string, doctorEmail: string, encounterId: string) {
  await db.insert(aiUsageEvents).values([
    {
      tenant_id: tenantId,
      actor_id: doctorId,
      patient_id: patientId,
      encounter_id: encounterId,
      feature: 'CLINICAL_COPILOT',
      provider: 'openai',
      model: 'gpt-5-mini',
      units: 1,
      resource_type: 'PATIENT',
      resource_id: patientId,
      metadata: {
        mode: 'ASK_CLINICAL_QUESTION',
        question: '¿Qué debo revisar primero con esta paciente antes de decidir el siguiente paso?',
        provider: 'openai',
        model: 'gpt-5-mini',
        model_tier: 'standard',
        seeded_by: doctorEmail,
        response_snapshot: {
          summary: 'Paciente demo con anemia probable, sangrado uterino anormal, hipotiroidismo subtratado y biometria reciente con ganancia de peso, FC elevada y SpO2 limite.',
          answer: [
            'Riesgos inmediatos:',
            '- Anemia sintomatica probable con fatiga, palpitaciones y sangrado uterino persistente.',
            '- Disnea de esfuerzo con edema y SpO2 93-95%; requiere correlacion presencial.',
            'Datos a confirmar:',
            '- Tendencia de Hb/ferritina, cuantificacion de sangrado y signos de hipoperfusion.',
            '- Peso seriado, edema, uso de AINEs y adherencia real a levotiroxina.',
            'Preguntas clave:',
            '- ¿Hay disnea en reposo, dolor toracico, sincope o sangrado abundante actual?',
            '- ¿Cuantas toallas usa por dia y hay coagulos grandes?',
            'Siguiente paso seguro:',
            '- Revisar estabilidad clinica, signos vitales y sangrado activo antes de clasificar prioridad o ajustar manejo.',
          ].join('\n'),
          suggested_questions: [
            '¿Cuanto ha cambiado el peso desde la semana pasada?',
            '¿La hinchazon mejora al elevar piernas o aparece desde la manana?',
            '¿Cuantas dosis de levotiroxina omitio esta semana?',
            '¿Ha usado ibuprofeno u otro AINE durante el sangrado?',
          ],
          clinical_gaps: [
            'No hay tendencia confirmada de hemoglobina ni ferritina.',
            'Falta cuantificacion estructurada del sangrado uterino.',
            'No hay examen cardiopulmonar presencial del episodio actual.',
          ],
          soft_alerts: [
            'Anemia probable con sintomas y sangrado uterino persistente.',
            'SpO2 limite con disnea de esfuerzo y edema requiere correlacion clinica.',
          ],
          safety_notice: 'Copiloto clinico asistivo: revisar, corregir y validar antes de usar.',
        },
      },
      created_at: new Date('2026-05-15T09:05:00.000Z'),
    },
    {
      tenant_id: tenantId,
      actor_id: doctorId,
      patient_id: patientId,
      encounter_id: encounterId,
      feature: 'CLINICAL_COPILOT',
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      units: 1,
      resource_type: 'PATIENT',
      resource_id: patientId,
      metadata: {
        mode: 'REVIEW_CLINICAL_GAPS',
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        model_tier: 'standard',
        seeded_by: doctorEmail,
        response_snapshot: {
          summary: 'Revision demo de vacios clinicos para caso con anemia, tiroides y biometria.',
          answer: 'Resumen clinico breve:\n- Falta completar severidad del sangrado, tendencia de biometria y sintomas de alarma.\nAcciones o preguntas priorizadas:\n- Confirmar estabilidad, adherencia a levotiroxina y uso de AINEs.\nBrechas que requieren validacion:\n- Evaluacion ginecologica, tendencia de Hb y correlacion cardiopulmonar.',
          suggested_questions: [
            '¿Tiene mareos al ponerse de pie o desmayos?',
            '¿Ha tenido sangrado entre periodos?',
            '¿Usa salbutamol mas de dos veces por semana?',
          ],
          clinical_gaps: [
            'No se documenta ortostatismo.',
            'No se documenta volumen exacto de sangrado.',
            'No hay EKG reciente pese a palpitaciones.',
          ],
          soft_alerts: [
            'Palpitaciones y taquicardia en contexto de anemia probable.',
          ],
          safety_notice: 'Copiloto clinico asistivo: revisar, corregir y validar antes de usar.',
        },
      },
      created_at: new Date('2026-05-15T09:12:00.000Z'),
    },
  ])
}

async function clearPreviousDemo(patientId: string) {
  await db.execute(sql`delete from ai_usage_events where patient_id = ${patientId} and metadata->>'seeded_by' is not null`)
  await db.execute(sql`delete from clinical_review_items where patient_id = ${patientId} and (title like ${`${DEMO}:%`} or proposed_payload->>'seed' = ${SEED})`)
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
}

function labResult(
  orderId: string,
  tenantId: string,
  panelName: string,
  parameterName: string,
  value: string,
  numericValue: string | null,
  unit: string | null,
  refMin: string | null,
  refMax: string | null,
  status: 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL_HIGH' | 'CRITICAL_LOW',
  sortOrder: number,
) {
  return {
    order_id: orderId,
    tenant_id: tenantId,
    panel_name: panelName,
    parameter_name: parameterName,
    value,
    numeric_value: numericValue,
    unit,
    ref_min: refMin,
    ref_max: refMax,
    status,
    notes: `${DEMO}: resultado ficticio para pruebas de IA.`,
    sort_order: sortOrder,
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
