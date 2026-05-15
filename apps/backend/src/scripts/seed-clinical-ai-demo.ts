import { eq, sql } from 'drizzle-orm'
import {
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
const PATIENT_ID_NUMBER = '3136944430901'
const SEED = 'clinical-ai-demo-v1'
const DEMO = 'DEMO IA'

async function main() {
  const doctor = await db.query.users.findFirst({
    where: eq(users.email, DOCTOR_EMAIL),
    columns: { id: true, tenant_id: true, email: true },
  })
  if (!doctor) throw new Error(`Doctor account not found: ${DOCTOR_EMAIL}`)

  const patient = await db.query.patients.findFirst({
    where: eq(patients.id_number, PATIENT_ID_NUMBER),
    columns: { id: true, tenant_id: true, first_name: true, last_name: true },
  })
  if (!patient || patient.tenant_id !== doctor.tenant_id) {
    throw new Error(`Patient ${PATIENT_ID_NUMBER} not found in doctor tenant`)
  }

  await clearPreviousDemo(patient.id)

  await db.update(patients)
    .set({
      date_of_birth: '1979-08-18',
      sex: 'male',
      tags: ['demo-ia', 'alto-riesgo-cardiometabolico', 'prueba-copiloto'],
      notes: [
        `${DEMO}: Paciente ficticio para pruebas de copiloto clinico.`,
        'Contexto deliberadamente complejo: hipertension resistente, diabetes tipo 2, ERC G3a, dislipidemia, sospecha de apnea del sueno y adherencia irregular.',
        'No usar como caso real. Datos construidos para validar resumen, brechas, preguntas y alertas blandas de IA.',
      ].join('\n'),
    })
    .where(eq(patients.id, patient.id))

  const encounterRows = await db.insert(encounters).values([
    {
      tenant_id: doctor.tenant_id,
      patient_id: patient.id,
      doctor_id: doctor.id,
      encounter_type: 'CHRONIC_CONTROL',
      status: 'CLOSED',
      chief_complaint: 'Control integral de hipertension, diabetes y fatiga matutina',
      subjective: [
        'Paciente masculino de 46 anos acude a control. Refiere cefalea occipital intermitente 3 veces por semana, mayor en la manana.',
        'Reporta cifras domiciliarias de PA entre 150-165/92-104 mmHg. Adherencia irregular: olvida dosis nocturna de metformina 2-3 veces por semana y suspendio atorvastatina por mialgias leves.',
        'Niega dolor toracico actual, sin disnea de reposo. Refiere ronquidos intensos, somnolencia diurna y despertares nocturnos. Dieta alta en sal por comidas fuera de casa.',
        'Poliuria nocturna 2-3 veces. Parestesias leves en ambos pies. No vision borrosa aguda.',
      ].join('\n'),
      objective: [
        'PA consulta 158/96 mmHg, FC 86 lpm, FR 18 rpm, T 36.7 C, SpO2 96%, peso 94.2 kg, talla 170 cm, IMC aproximado 32.6.',
        'Cardiopulmonar sin estertores ni soplos evidentes. Abdomen globoso, no doloroso.',
        'Extremidades sin edema. Pulsos pedios presentes. Monofilamento: sensibilidad disminuida leve en primer ortejo bilateral.',
      ].join('\n'),
      assessment: [
        '1. Hipertension arterial cronica no controlada, probable componente de mala adherencia y alto consumo de sodio. Valorar hipertension resistente si persiste tras optimizacion.',
        '2. Diabetes mellitus tipo 2 con control suboptimo y datos de neuropatia periferica incipiente.',
        '3. Enfermedad renal cronica G3a probable por eGFR previo cercano a 58 ml/min/1.73m2 y microalbuminuria.',
        '4. Dislipidemia mixta con suspension parcial de estatina por mialgias.',
        '5. Sospecha de apnea obstructiva del sueno por ronquido, somnolencia y obesidad.',
      ].join('\n'),
      plan: [
        'Confirmar tecnica de toma de PA y solicitar bitacora domiciliaria 14 dias.',
        'Reforzar adherencia, reducir sodio, caminata progresiva 150 min/semana si no hay sintomas de alarma.',
        'Solicitar HbA1c, perfil lipidico, creatinina/eGFR, potasio, EGO y albumina/creatinina urinaria.',
        'Revisar tolerancia a estatina y considerar ajuste en proxima consulta segun labs y riesgo cardiovascular.',
        'Tamizaje STOP-BANG y considerar referencia para estudio de sueno.',
        'Educar signos de alarma: dolor toracico, deficit neurologico, disnea, PA persistente >=180/120 o deterioro agudo.',
      ].join('\n'),
      notes: `${DEMO}: consulta base para pruebas de IA.`,
      summary: 'Control cardiometabolico complejo con HTA no controlada, DM2 suboptima, ERC G3a probable, dislipidemia y sospecha de apnea del sueno.',
      metadata: { seed: SEED, sequence: 1 },
      opened_at: new Date('2026-05-09T15:30:00.000Z'),
      closed_at: new Date('2026-05-09T16:05:00.000Z'),
    },
    {
      tenant_id: doctor.tenant_id,
      patient_id: patient.id,
      doctor_id: doctor.id,
      encounter_type: 'FOLLOW_UP',
      status: 'CLOSED',
      chief_complaint: 'Revision de laboratorios y ajuste de riesgo cardiometabolico',
      subjective: [
        'Paciente trae resultados externos. Refiere mejoria parcial de cefalea, pero persisten cifras PA 145-155/90-96.',
        'Ha reducido bebidas azucaradas. Sigue con somnolencia diurna. No ha tenido hipoglucemias documentadas.',
        'Refiere ardor plantar nocturno ocasional. No lesiones en pies.',
      ].join('\n'),
      objective: [
        'PA 150/92 mmHg, FC 82 lpm, peso 93.4 kg. Exploracion sin edema. Pies sin ulceras, piel seca, sensibilidad vibratoria discretamente reducida.',
      ].join('\n'),
      assessment: [
        'HTA aun no controlada.',
        'DM2 con HbA1c 8.4%, requiere intensificar intervencion y revisar adherencia.',
        'Microalbuminuria positiva y eGFR 58 compatible con dano renal temprano.',
        'LDL 162 mg/dL y TG 238 mg/dL: riesgo cardiovascular alto.',
      ].join('\n'),
      plan: [
        'Documentar resultados y revisar interacciones/adherencia antes de cambios mayores.',
        'Solicitar fondo de ojo anual, evaluar pie diabetico en cada control y educacion de cuidado de pies.',
        'Programar seguimiento en 2-4 semanas con bitacora PA/glucosa.',
      ].join('\n'),
      notes: `${DEMO}: seguimiento con labs anormales.`,
      summary: 'Laboratorios confirman mal control metabolico, microalbuminuria y dislipidemia marcada.',
      metadata: { seed: SEED, sequence: 2 },
      opened_at: new Date('2026-05-13T14:20:00.000Z'),
      closed_at: new Date('2026-05-13T14:50:00.000Z'),
    },
    {
      tenant_id: doctor.tenant_id,
      patient_id: patient.id,
      doctor_id: doctor.id,
      encounter_type: 'EMERGENCY',
      status: 'CLOSED',
      chief_complaint: 'Episodio de presion elevada con cefalea',
      subjective: [
        'Consulta por cefalea intensa la noche previa con PA domiciliaria 182/108 mmHg tras comida alta en sal y omision de medicamento.',
        'Niega deficit focal, dolor toracico, disnea, confusion, perdida de vision o oliguria. Mejoro tras reposo.',
      ].join('\n'),
      objective: 'PA inicial 176/104 mmHg, repetida tras reposo 164/98 mmHg. Neurologico sin focalidad. Sin datos de edema pulmonar.',
      assessment: 'Elevacion severa de PA sin datos clinicos documentados de dano agudo a organo blanco en esta evaluacion. Alto riesgo por comorbilidades.',
      plan: [
        'Reforzar signos de alarma y adherencia estricta.',
        'Evitar AINEs y exceso de sal. Confirmar lista completa de medicamentos externos.',
        'Revaloracion corta y correlacion con labs/ECG si sintomas recurren.',
      ].join('\n'),
      notes: `${DEMO}: evento util para que IA priorice alertas blandas sin diagnosticar urgencia.`,
      summary: 'Episodio de PA severamente elevada asociado a omision de dosis y dieta alta en sodio; sin focalidad neurologica documentada.',
      metadata: { seed: SEED, sequence: 3 },
      opened_at: new Date('2026-05-14T17:10:00.000Z'),
      closed_at: new Date('2026-05-14T17:35:00.000Z'),
    },
  ]).returning({ id: encounters.id, opened_at: encounters.opened_at })

  const [controlEncounter, labEncounter, emergencyEncounter] = encounterRows

  await db.insert(patientBackground).values([
    { tenant_id: doctor.tenant_id, patient_id: patient.id, category: 'AHF', content: `${DEMO}: Padre fallecido por infarto agudo al miocardio a los 59 anos. Madre con diabetes tipo 2 e hipertension. Hermano con apnea obstructiva del sueno.`, recorded_by: doctor.id },
    { tenant_id: doctor.tenant_id, patient_id: patient.id, category: 'APP', content: `${DEMO}: Hipertension arterial diagnosticada hace 8 anos; diabetes mellitus tipo 2 hace 6 anos; enfermedad renal cronica G3a probable; obesidad grado I; dislipidemia mixta; neuropatia periferica diabetica incipiente.`, recorded_by: doctor.id },
    { tenant_id: doctor.tenant_id, patient_id: patient.id, category: 'APNP', content: `${DEMO}: Exfumador 10 paquetes/ano, suspendido hace 4 anos. Alcohol social 1-2 veces/mes. Trabajo sedentario. Dieta alta en sodio y carbohidratos refinados. Actividad fisica irregular.`, recorded_by: doctor.id },
    { tenant_id: doctor.tenant_id, patient_id: patient.id, category: 'AQ', content: `${DEMO}: Apendicectomia a los 22 anos sin complicaciones.`, recorded_by: doctor.id },
    { tenant_id: doctor.tenant_id, patient_id: patient.id, category: 'ALERGIAS', content: `${DEMO}: Alergia a penicilina referida en infancia: urticaria generalizada. Niega anafilaxia documentada.`, recorded_by: doctor.id },
    { tenant_id: doctor.tenant_id, patient_id: patient.id, category: 'MEDICAMENTOS', content: `${DEMO}: Losartan 100 mg cada manana; amlodipino 5 mg noche; metformina XR 1000 mg noche con olvidos frecuentes; atorvastatina 40 mg suspendida intermitentemente por mialgias; ibuprofeno ocasional automedicado para cefalea.`, recorded_by: doctor.id },
  ])

  await db.insert(patientProblems).values([
    { tenant_id: doctor.tenant_id, patient_id: patient.id, problem_number: 1, title: 'Hipertension arterial no controlada', description: 'Cifras persistentes por encima de meta con episodio reciente de PA severamente elevada.', icd10_code: 'I10', icd10_description: 'Hipertension esencial primaria', status: 'CHRONIC', onset_date: '2018-04-01', notes: `${DEMO}: Vigilar adherencia, sodio, AINEs, apnea del sueno y dano a organo blanco.`, identified_in_encounter_id: controlEncounter.id, created_by: doctor.id },
    { tenant_id: doctor.tenant_id, patient_id: patient.id, problem_number: 2, title: 'Diabetes mellitus tipo 2 con control suboptimo', description: 'HbA1c 8.4%, glucosa en ayunas 168 mg/dL, parestesias leves en pies.', icd10_code: 'E11.9', icd10_description: 'Diabetes mellitus tipo 2 sin complicaciones especificadas', status: 'CHRONIC', onset_date: '2020-02-01', notes: `${DEMO}: Requiere educacion, adherencia y cribado de complicaciones.`, identified_in_encounter_id: labEncounter.id, created_by: doctor.id },
    { tenant_id: doctor.tenant_id, patient_id: patient.id, problem_number: 3, title: 'Enfermedad renal cronica G3a probable con microalbuminuria', description: 'Creatinina 1.42 mg/dL, eGFR 58, albumina/creatinina urinaria 92 mg/g.', icd10_code: 'N18.31', icd10_description: 'Enfermedad renal cronica, estadio 3a', status: 'ACTIVE', onset_date: '2026-05-13', notes: `${DEMO}: Evitar nefrotoxicos, vigilar potasio/creatinina y control de PA/DM.`, identified_in_encounter_id: labEncounter.id, created_by: doctor.id },
    { tenant_id: doctor.tenant_id, patient_id: patient.id, problem_number: 4, title: 'Dislipidemia mixta de alto riesgo', description: 'LDL 162 mg/dL, TG 238 mg/dL, antecedente familiar de IAM prematuro.', icd10_code: 'E78.2', icd10_description: 'Hiperlipidemia mixta', status: 'ACTIVE', onset_date: '2026-05-13', notes: `${DEMO}: Evaluar tolerancia a estatina y adherencia.`, identified_in_encounter_id: labEncounter.id, created_by: doctor.id },
    { tenant_id: doctor.tenant_id, patient_id: patient.id, problem_number: 5, title: 'Sospecha de apnea obstructiva del sueno', description: 'Ronquido intenso, somnolencia diurna, obesidad e hipertension dificil de controlar.', icd10_code: 'G47.33', icd10_description: 'Apnea obstructiva del sueno', status: 'ACTIVE', onset_date: '2026-05-09', notes: `${DEMO}: Pendiente STOP-BANG y posible referencia a estudio de sueno.`, identified_in_encounter_id: controlEncounter.id, created_by: doctor.id },
  ])

  await db.insert(vitalSigns).values([
    { tenant_id: doctor.tenant_id, patient_id: patient.id, encounter_id: controlEncounter.id, blood_pressure_systolic: 158, blood_pressure_diastolic: 96, heart_rate: 86, respiratory_rate: 18, temperature_celsius: '36.7', weight_kg: '94.20', height_cm: '170.0', oxygen_saturation: 96, glucose_mg_dl: 182, recorded_by: doctor.id, recorded_at: new Date('2026-05-09T15:34:00.000Z') },
    { tenant_id: doctor.tenant_id, patient_id: patient.id, encounter_id: labEncounter.id, blood_pressure_systolic: 150, blood_pressure_diastolic: 92, heart_rate: 82, respiratory_rate: 17, temperature_celsius: '36.6', weight_kg: '93.40', height_cm: '170.0', oxygen_saturation: 97, glucose_mg_dl: 168, recorded_by: doctor.id, recorded_at: new Date('2026-05-13T14:25:00.000Z') },
    { tenant_id: doctor.tenant_id, patient_id: patient.id, encounter_id: emergencyEncounter.id, blood_pressure_systolic: 176, blood_pressure_diastolic: 104, heart_rate: 94, respiratory_rate: 20, temperature_celsius: '36.8', weight_kg: '93.80', height_cm: '170.0', oxygen_saturation: 96, glucose_mg_dl: 196, recorded_by: doctor.id, recorded_at: new Date('2026-05-14T17:12:00.000Z') },
  ])

  const [labOrder] = await db.insert(labOrders).values({
    tenant_id: doctor.tenant_id,
    patient_id: patient.id,
    encounter_id: labEncounter.id,
    ordered_by: doctor.id,
    status: 'COMPLETED',
    notes: `${DEMO}: Panel externo transcrito manualmente para pruebas de IA.`,
    ordered_at: new Date('2026-05-13T14:40:00.000Z'),
  }).returning({ id: labOrders.id })

  await db.insert(labResults).values([
    labResult(labOrder.id, doctor.tenant_id, 'Metabolico', 'Glucosa en ayunas', '168', '168', 'mg/dL', '70', '99', 'HIGH', 1),
    labResult(labOrder.id, doctor.tenant_id, 'Metabolico', 'HbA1c', '8.4', '8.4', '%', '4.0', '5.6', 'HIGH', 2),
    labResult(labOrder.id, doctor.tenant_id, 'Renal', 'Creatinina', '1.42', '1.42', 'mg/dL', '0.70', '1.20', 'HIGH', 3),
    labResult(labOrder.id, doctor.tenant_id, 'Renal', 'eGFR CKD-EPI', '58', '58', 'mL/min/1.73m2', '90', null, 'LOW', 4),
    labResult(labOrder.id, doctor.tenant_id, 'Renal', 'Albumina/creatinina urinaria', '92', '92', 'mg/g', null, '30', 'HIGH', 5),
    labResult(labOrder.id, doctor.tenant_id, 'Electrolitos', 'Potasio', '5.1', '5.1', 'mmol/L', '3.5', '5.0', 'HIGH', 6),
    labResult(labOrder.id, doctor.tenant_id, 'Lipidos', 'LDL colesterol', '162', '162', 'mg/dL', null, '100', 'HIGH', 7),
    labResult(labOrder.id, doctor.tenant_id, 'Lipidos', 'Trigliceridos', '238', '238', 'mg/dL', null, '150', 'HIGH', 8),
    labResult(labOrder.id, doctor.tenant_id, 'Hematologia', 'Hemoglobina', '13.1', '13.1', 'g/dL', '13.5', '17.5', 'LOW', 9),
    labResult(labOrder.id, doctor.tenant_id, 'Orina', 'Proteinuria tira reactiva', '1+', null, null, null, null, 'HIGH', 10),
  ])

  const [plan] = await db.insert(treatmentPlans).values({
    tenant_id: doctor.tenant_id,
    patient_id: patient.id,
    encounter_id: controlEncounter.id,
    created_by: doctor.id,
    name: 'Plan cardiometabolico integral',
    status: 'ACTIVE',
    start_date: '2026-05-09',
    instructions: `${DEMO}: Plan activo ficticio para validar que la IA lea tratamientos, adherencia y brechas.`,
    activated_at: new Date('2026-05-09T16:05:00.000Z'),
  }).returning({ id: treatmentPlans.id })

  await db.insert(medicationItems).values([
    { treatment_plan_id: plan.id, drug_name: 'Losartan', presentation: 'Tableta', concentration: '100 mg', dose_amount: 100, dose_unit: 'mg', route: 'oral', frequency_type: 'DAILY', times_per_day: ['07:00'], special_instructions: 'Tomar por la manana. Vigilar potasio y funcion renal.', with_food: false, sort_order: 1 },
    { treatment_plan_id: plan.id, drug_name: 'Amlodipino', presentation: 'Tableta', concentration: '5 mg', dose_amount: 5, dose_unit: 'mg', route: 'oral', frequency_type: 'DAILY', times_per_day: ['21:00'], special_instructions: 'Reportar edema o mareos.', with_food: false, sort_order: 2 },
    { treatment_plan_id: plan.id, drug_name: 'Metformina XR', presentation: 'Tableta liberacion prolongada', concentration: '1000 mg', dose_amount: 1000, dose_unit: 'mg', route: 'oral', frequency_type: 'DAILY', times_per_day: ['20:00'], special_instructions: 'Tomar con cena; revisar tolerancia GI y adherencia.', with_food: true, sort_order: 3 },
    { treatment_plan_id: plan.id, drug_name: 'Atorvastatina', presentation: 'Tableta', concentration: '40 mg', dose_amount: 40, dose_unit: 'mg', route: 'oral', frequency_type: 'DAILY', times_per_day: ['21:00'], special_instructions: 'Paciente la suspendio por mialgias; requiere conciliacion antes de continuidad.', with_food: false, sort_order: 4 },
  ])

  await db.insert(treatmentInterventions).values([
    { tenant_id: doctor.tenant_id, treatment_plan_id: plan.id, patient_id: patient.id, type: 'DIET', title: 'Reduccion de sodio y azucares simples', description: 'Meta inicial: evitar bebidas azucaradas, comida rapida y embutidos; registrar 3 dias de dieta.', frequency: 'Diario', duration: '4 semanas', instructions: 'Llevar registro a proxima consulta.', sort_order: 1 },
    { tenant_id: doctor.tenant_id, treatment_plan_id: plan.id, patient_id: patient.id, type: 'MONITORING', title: 'Bitacora PA/glucosa', description: 'PA dos veces al dia y glucosa en ayunas 4 dias/semana.', frequency: 'Diario', duration: '14 dias', instructions: 'Registrar hora, valor, sintomas y omisiones de medicacion.', sort_order: 2 },
    { tenant_id: doctor.tenant_id, treatment_plan_id: plan.id, patient_id: patient.id, type: 'EXERCISE', title: 'Caminata progresiva', description: 'Iniciar 20 minutos, 5 dias/semana si no hay dolor toracico, disnea o mareo.', frequency: '5 veces/semana', duration: '4 semanas', instructions: 'Suspender y consultar si aparecen sintomas de alarma.', sort_order: 3 },
  ])

  const [provenance] = await db.insert(clinicalDataProvenance).values({
    tenant_id: doctor.tenant_id,
    patient_id: patient.id,
    encounter_id: labEncounter.id,
    source_type: 'EXTERNAL_RECORD',
    source_resource_type: 'MANUAL_TRANSCRIPTION',
    source_label: `${DEMO}: laboratorio externo transcrito`,
    source_excerpt: 'HbA1c 8.4%, LDL 162 mg/dL, eGFR 58, ACR 92 mg/g, potasio 5.1 mmol/L.',
    target_resource_type: 'LAB_ORDER',
    target_resource_id: labOrder.id,
    target_field: 'results',
    extraction_method: 'manual-demo-seed',
    confidence: 0.88,
    metadata: { seed: SEED },
    recorded_by: doctor.id,
  }).returning({ id: clinicalDataProvenance.id })

  await db.insert(clinicalReviewItems).values([
    {
      tenant_id: doctor.tenant_id,
      patient_id: patient.id,
      encounter_id: labEncounter.id,
      provenance_id: provenance.id,
      item_type: 'LAB_RESULT',
      status: 'PENDING',
      priority: 'HIGH',
      title: `${DEMO}: Confirmar ERC G3a y albuminuria`,
      summary: 'Resultado externo sugiere eGFR 58 y ACR 92 mg/g; requiere validacion, tendencia y correlacion clinica.',
      proposed_payload: { seed: SEED, finding: 'CKD_G3A_ALBUMINURIA' },
      normalized_payload: { problem: 'Enfermedad renal cronica G3a probable con microalbuminuria' },
      confidence: 0.78,
      reasoning: 'Dato transcrito de laboratorio externo; debe validarse antes de convertirse en diagnostico estable.',
      created_by: doctor.id,
    },
    {
      tenant_id: doctor.tenant_id,
      patient_id: patient.id,
      encounter_id: controlEncounter.id,
      item_type: 'MEDICATION',
      status: 'PENDING',
      priority: 'NORMAL',
      title: `${DEMO}: Conciliar automedicacion con ibuprofeno`,
      summary: 'Paciente usa ibuprofeno ocasional para cefalea en contexto de HTA no controlada y ERC probable.',
      proposed_payload: { seed: SEED, medication: 'Ibuprofeno ocasional' },
      normalized_payload: { action: 'medication_reconciliation' },
      confidence: 0.7,
      reasoning: 'Riesgo potencial por comorbilidades; requiere revision medica.',
      created_by: doctor.id,
    },
  ])

  await db.insert(clinicalAudioTranscripts).values({
    tenant_id: doctor.tenant_id,
    patient_id: patient.id,
    encounter_id: controlEncounter.id,
    status: 'NEEDS_REVIEW',
    source_label: `${DEMO}: transcripcion manual de llamada de seguimiento`,
    language: 'es',
    processor: 'manual-demo-seed',
    transcript_text: 'Doctor, a veces se me olvida la medicina de la noche. Mi esposa dice que ronco mucho y me quedo dormido en el dia. Tambien me preocupa que la presion sube cuando como en la calle.',
    segments: [
      { speaker: 'patient', text: 'A veces se me olvida la medicina de la noche.' },
      { speaker: 'patient', text: 'Mi esposa dice que ronco mucho y me quedo dormido en el dia.' },
    ],
    summary: 'Paciente reporta omisiones de medicacion nocturna, ronquido intenso, somnolencia diurna y relacion entre dieta fuera de casa y elevacion de PA.',
    duration_seconds: 74,
    confidence: 0.82,
    created_by: doctor.id,
  })

  console.log(JSON.stringify({
    ok: true,
    tenant_id: doctor.tenant_id,
    patient_id: patient.id,
    patient: `${patient.first_name} ${patient.last_name}`,
    seeded: {
      encounters: encounterRows.length,
      problems: 5,
      background: 6,
      vital_signs: 3,
      lab_orders: 1,
      lab_results: 10,
      treatment_plans: 1,
      review_items: 2,
      transcripts: 1,
    },
  }, null, 2))
}

async function clearPreviousDemo(patientId: string) {
  await db.execute(sql`
    delete from clinical_review_items
    where patient_id = ${patientId}
      and (title like ${`${DEMO}:%`} or proposed_payload->>'seed' = ${SEED})
  `)
  await db.execute(sql`
    delete from clinical_audio_transcripts
    where patient_id = ${patientId}
      and source_label like ${`${DEMO}:%`}
  `)
  await db.execute(sql`
    delete from clinical_data_provenance
    where patient_id = ${patientId}
      and metadata->>'seed' = ${SEED}
  `)
  await db.execute(sql`
    delete from lab_results
    where order_id in (
      select id from lab_orders
      where patient_id = ${patientId}
        and notes like ${`${DEMO}:%`}
    )
  `)
  await db.execute(sql`
    delete from lab_orders
    where patient_id = ${patientId}
      and notes like ${`${DEMO}:%`}
  `)
  await db.execute(sql`
    delete from vital_signs
    where patient_id = ${patientId}
      and encounter_id in (
        select id from encounters
        where patient_id = ${patientId}
          and metadata->>'seed' = ${SEED}
      )
  `)
  await db.execute(sql`
    delete from medication_items
    where treatment_plan_id in (
      select id from treatment_plans
      where patient_id = ${patientId}
        and instructions like ${`${DEMO}:%`}
    )
  `)
  await db.execute(sql`
    delete from treatment_interventions
    where patient_id = ${patientId}
      and treatment_plan_id in (
        select id from treatment_plans
        where patient_id = ${patientId}
          and instructions like ${`${DEMO}:%`}
      )
  `)
  await db.execute(sql`
    delete from treatment_plans
    where patient_id = ${patientId}
      and instructions like ${`${DEMO}:%`}
  `)
  await db.execute(sql`
    delete from patient_problems
    where patient_id = ${patientId}
      and notes like ${`${DEMO}:%`}
  `)
  await db.execute(sql`
    delete from patient_background
    where patient_id = ${patientId}
      and content like ${`${DEMO}:%`}
  `)
  await db.execute(sql`
    delete from encounters
    where patient_id = ${patientId}
      and metadata->>'seed' = ${SEED}
  `)
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
