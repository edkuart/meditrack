import { config } from '../../shared/config.ts'
import { AppError } from '../../shared/errors.ts'
import { log, serializeError } from '../../shared/observability/logger.ts'
import {
  buildClinicalCopilotDraft,
  type ClinicalCopilotDraft,
  type ClinicalCopilotMode,
  type SummaryLike,
} from './ai-assist.engine.ts'

type AiProvider = 'local' | 'openai' | 'anthropic'
export type ClinicalCopilotModelTier = 'standard' | 'premium'

export interface ClinicalCopilotGeneration {
  draft: ClinicalCopilotDraft
  provider: AiProvider
  model: string
  model_tier: ClinicalCopilotModelTier
  fallback_reason?: string
}

const CLINICAL_SYSTEM_INSTRUCTIONS = [
  'Eres un copiloto clinico asistivo para medicos.',
  'No diagnostiques, no prescribas y no inventes datos.',
  'Usa solo el contexto clinico recibido.',
  'Si faltan datos, dilo como brecha clinica o pregunta sugerida.',
  'Devuelve exclusivamente JSON valido con estas llaves:',
  'summary, answer, suggested_questions, clinical_gaps, soft_alerts, soap_draft.',
  'soap_draft debe incluir subjective, objective, assessment y plan cuando aplique.',
  'Prioriza utilidad en consulta: respuestas breves, escaneables y accionables.',
  'En answer usa encabezados cortos y maximo 220 palabras salvo que el usuario pida mas detalle.',
  'Para ASK_CLINICAL_QUESTION, answer debe usar exactamente estos encabezados en lineas separadas: Riesgos inmediatos:, Datos a confirmar:, Preguntas clave:, Siguiente paso seguro:.',
  'Usa bullets cortos debajo de cada encabezado. No escribas listas numeradas dentro de un parrafo largo.',
  'Si la pregunta pide decidir urgencia, evaluacion presencial o seguimiento ambulatorio, no clasifiques por un dato aislado; compara estabilidad actual, sintomas de alarma, tendencia, comorbilidades y disponibilidad de seguimiento.',
  'Para decisiones de triage, usa lenguaje condicional: "requiere valorar presencial si..." o "seguimiento ambulatorio podria ser razonable si...", sin afirmar disposicion definitiva.',
  'soft_alerts debe contener solo riesgos clinicos especificos que puedan cambiar prioridad, seguridad o necesidad de evaluacion presencial.',
  'No conviertas valores limitrofes o levemente anormales en soft_alerts salvo que tengan tendencia, sintomas, condicion de alto riesgo o combinacion peligrosa documentada.',
  'No incluyas en soft_alerts problemas cronicos/importantes que no cambien prioridad inmediata; colocalos en Datos a confirmar o clinical_gaps.',
  'Hipotiroidismo, TSH elevada, dislipidemia, HbA1c o hallazgos metabolicos no son soft_alerts salvo crisis/sintomas severos o combinacion de seguridad inmediata documentada.',
  'No pongas avisos genericos de validacion, responsabilidad, juicio clinico o seguridad dentro de soft_alerts.',
  'suggested_questions debe contener preguntas concretas para hacerle al paciente; no repitas preguntas que ya escribiste en answer.',
  'clinical_gaps debe contener datos faltantes o pendientes de confirmar; no repitas preguntas ni alertas.',
  'No incluyas mas de 5 preguntas sugeridas ni mas de 5 brechas clinicas.',
].join('\n')

const CLINICAL_COPILOT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    answer: { type: 'string' },
    suggested_questions: {
      type: 'array',
      items: { type: 'string' },
    },
    clinical_gaps: {
      type: 'array',
      items: { type: 'string' },
    },
    soft_alerts: {
      type: 'array',
      items: { type: 'string' },
    },
    soap_draft: {
      type: 'object',
      additionalProperties: false,
      properties: {
        subjective: { type: 'string' },
        objective: { type: 'string' },
        assessment: { type: 'string' },
        plan: { type: 'string' },
      },
    },
  },
} as const

export async function generateClinicalCopilotDraft(
  mode: ClinicalCopilotMode,
  summary: SummaryLike,
  sourceText?: string,
  question?: string,
  modelTier: ClinicalCopilotModelTier = 'standard',
): Promise<ClinicalCopilotGeneration> {
  const localDraft = buildClinicalCopilotDraft(mode, summary, sourceText, question)
  const provider = resolveProvider()

  if (provider === 'local') {
    return { draft: localDraft, provider: 'local', model: localDraft.model, model_tier: 'standard' }
  }

  const model = getProviderModel(provider, modelTier)
  const apiKey = getProviderApiKey(provider)
  if (!apiKey) {
    return {
      draft: localDraft,
      provider: 'local',
      model: localDraft.model,
      model_tier: 'standard',
      fallback_reason: `${provider.toUpperCase()}_API_KEY_MISSING`,
    }
  }

  if (!config.ai.externalEnabled) {
    log.info('clinical_ai_external_inferred_from_provider_key', {
      provider,
      model,
    })
  }

  try {
    const prompt = buildClinicalPrompt(mode, summary, sourceText, question)
    const rawText = provider === 'openai'
      ? await callOpenAi(apiKey, model, prompt)
      : await callAnthropic(apiKey, model, prompt)

    const externalDraft = mergeExternalDraft(localDraft, parseJsonObject(rawText), model)
    return { draft: externalDraft, provider, model, model_tier: modelTier }
  } catch (error) {
    log.warn('clinical_ai_provider_failed', {
      provider,
      model,
      error: serializeError(error),
    })

    if (config.ai.fallbackToLocal) {
      return {
        draft: localDraft,
        provider: 'local',
        model: localDraft.model,
        model_tier: 'standard',
        fallback_reason: `${provider.toUpperCase()}_REQUEST_FAILED`,
      }
    }

    throw new AppError(502, 'AI_PROVIDER_ERROR', 'Clinical AI provider request failed')
  }
}

function normalizeProvider(value: string): AiProvider {
  if (value === 'openai' || value === 'anthropic') return value
  return 'local'
}

function resolveProvider(): AiProvider {
  const configuredProvider = normalizeProvider(config.ai.provider)
  if (configuredProvider !== 'local') return configuredProvider
  if (config.ai.openai.apiKey) return 'openai'
  if (config.ai.anthropic.apiKey) return 'anthropic'
  return 'local'
}

function getProviderModel(provider: AiProvider, modelTier: ClinicalCopilotModelTier) {
  if (provider === 'openai') {
    return modelTier === 'premium' ? config.ai.openai.premiumModel : config.ai.openai.model
  }
  if (provider === 'anthropic') {
    return modelTier === 'premium' ? config.ai.anthropic.premiumModel : config.ai.anthropic.model
  }
  return 'meditrack-copilot-local-v1'
}

function getProviderApiKey(provider: AiProvider) {
  if (provider === 'openai') return config.ai.openai.apiKey
  if (provider === 'anthropic') return config.ai.anthropic.apiKey
  return ''
}

function buildClinicalPrompt(
  mode: ClinicalCopilotMode,
  summary: SummaryLike,
  sourceText?: string,
  question?: string,
) {
  const payload = {
    task: mode,
    question: question?.trim() || null,
    answer_contract: buildAnswerContract(mode, question),
    source_text: sourceText?.trim().slice(0, 5000) || null,
    clinical_context: compactClinicalContext(summary),
  }

  return [
    'Genera una respuesta clinica asistiva en espanol para el medico.',
    'El JSON debe ser breve, trazable al contexto y apto para revision humana.',
    'Evita listas largas: selecciona lo mas importante.',
    'La validacion medica ya se muestra por separado en la interfaz; no la repitas como alerta clinica.',
    'No incluyas markdown fuera del JSON.',
    JSON.stringify(payload),
  ].join('\n\n')
}

function buildAnswerContract(mode: ClinicalCopilotMode, question?: string) {
  const asksTriage = isTriageQuestion(question)
  if (mode === 'ASK_CLINICAL_QUESTION') {
    return {
      answer_format: [
        'Riesgos inmediatos:',
        asksTriage
          ? '- 2-3 bullets maximo sobre criterios que harian necesaria valoracion presencial/urgente; no usar un dato aislado como conclusion.'
          : '- 2-3 bullets maximo.',
        'Datos a confirmar:',
        asksTriage
          ? '- 2-3 bullets maximo: estabilidad actual, tendencia biometrica/labs, sintomas de alarma y capacidad de seguimiento.'
          : '- 2-3 bullets maximo.',
        'Preguntas clave:',
        asksTriage
          ? '- 2-3 preguntas maximo que cambien disposicion: disnea en reposo, dolor toracico, sincope, sangrado activo, deterioro funcional.'
          : '- 2-3 bullets maximo.',
        'Siguiente paso seguro:',
        asksTriage
          ? '- 1 frase condicional que separe cuando valorar presencial/urgente vs cuando podria seguir ambulatorio, sin diagnosticar ni prescribir.'
          : '- 1 frase, sin diagnosticar ni prescribir.',
      ],
      max_answer_words: 220,
      max_suggested_questions: 5,
      max_clinical_gaps: 5,
      max_soft_alerts: 4,
      field_rules: {
        answer: 'Incluye preguntas clave de decision clinica solo en la seccion Preguntas clave.',
        suggested_questions: 'Preguntas de entrevista para el paciente, sin repetir la seccion Preguntas clave.',
        soft_alerts: 'Solo riesgos de seguridad o cambio de prioridad. Excluir frases como requiere validacion medica o juicio clinico; mover hallazgos limitrofes/importantes no urgentes a Datos a confirmar o clinical_gaps.',
        triage: asksTriage
          ? 'No etiquetar como urgente o ambulatorio sin confirmar sintomas actuales y estabilidad. Biometria/labs orientan prioridad, pero no sustituyen evaluacion clinica.'
          : undefined,
      },
    }
  }

  return {
    answer_format: [
      'Resumen clinico breve.',
      'Acciones o preguntas priorizadas.',
      'Brechas que requieren validacion.',
    ],
    max_answer_words: 180,
    max_suggested_questions: 5,
    max_clinical_gaps: 5,
    max_soft_alerts: 4,
  }
}

function isTriageQuestion(question?: string) {
  if (!question) return false
  return /urgenc|urgente|emergenc|presencial|ambulator|seguimiento|prioridad|triage|derivar|referir|hospital/i.test(question)
}

function compactClinicalContext(summary: SummaryLike) {
  return {
    patient: {
      age: formatPatientAge(summary.patient.date_of_birth),
      sex: summary.patient.sex,
      notes: summary.patient.notes?.slice(0, 800) ?? null,
    },
    problems: summary.problems.map(problem => ({
      title: problem.title,
      status: problem.status,
      icd10_code: problem.icd10_code,
      notes: problem.notes?.slice(0, 500) ?? null,
    })),
    background: summary.background.map(item => ({
      category: item.category,
      content: item.content.slice(0, 800),
    })),
    latest_encounters: summary.latest_encounters.slice(0, 5).map(encounter => ({
      chief_complaint: encounter.chief_complaint,
      subjective: encounter.subjective,
      objective: encounter.objective,
      assessment: encounter.assessment,
      plan: encounter.plan,
      summary: encounter.summary,
    })),
    latest_vitals: summary.latest_vitals.slice(0, 5).map(vital => ({
      blood_pressure_systolic: vital.blood_pressure_systolic,
      blood_pressure_diastolic: vital.blood_pressure_diastolic,
      heart_rate: vital.heart_rate,
      respiratory_rate: vital.respiratory_rate,
      temperature_celsius: vital.temperature_celsius,
      weight_kg: vital.weight_kg,
      height_cm: vital.height_cm,
      bmi: calculateBmi(vital.weight_kg, vital.height_cm),
      oxygen_saturation: vital.oxygen_saturation,
      glucose_mg_dl: vital.glucose_mg_dl,
      recorded_at: vital.recorded_at.toISOString(),
    })),
    vital_trends: summarizeVitalTrends(summary),
    latest_labs: summary.latest_labs.slice(0, 5),
    treatments: summary.treatments.map(plan => ({
      name: plan.name,
      status: plan.status,
      medications: plan.medications,
      interventions: plan.interventions,
    })),
    pending_review_items: summary.pending_review_items,
  }
}

function summarizeVitalTrends(summary: SummaryLike) {
  const vitals = summary.latest_vitals.slice(0, 10)
  if (vitals.length === 0) return null
  return {
    count: vitals.length,
    weight_kg: summarizeNumeric(vitals.map(vital => vital.weight_kg)),
    systolic_bp: summarizeNumeric(vitals.map(vital => vital.blood_pressure_systolic)),
    diastolic_bp: summarizeNumeric(vitals.map(vital => vital.blood_pressure_diastolic)),
    heart_rate: summarizeNumeric(vitals.map(vital => vital.heart_rate)),
    oxygen_saturation: summarizeNumeric(vitals.map(vital => vital.oxygen_saturation)),
    glucose_mg_dl: summarizeNumeric(vitals.map(vital => vital.glucose_mg_dl)),
    most_recent_at: vitals[0]?.recorded_at.toISOString() ?? null,
    oldest_included_at: vitals.at(-1)?.recorded_at.toISOString() ?? null,
  }
}

function summarizeNumeric(values: Array<string | number | null | undefined>) {
  const numeric = values.map(Number).filter(Number.isFinite)
  if (numeric.length === 0) return null
  const latest = numeric[0]
  const oldest = numeric.at(-1) ?? latest
  return {
    latest,
    min: Math.min(...numeric),
    max: Math.max(...numeric),
    delta_from_oldest: Number((latest - oldest).toFixed(2)),
  }
}

function calculateBmi(weightKg: string | number | null | undefined, heightCm: string | number | null | undefined) {
  const weight = Number(weightKg)
  const height = Number(heightCm)
  if (!Number.isFinite(weight) || !Number.isFinite(height) || weight <= 0 || height <= 0) return null
  const meters = height / 100
  return Number((weight / (meters * meters)).toFixed(1))
}

function formatPatientAge(dateOfBirth: string | null) {
  if (!dateOfBirth) return 'no registrada'
  const birth = new Date(`${dateOfBirth}T00:00:00Z`)
  if (Number.isNaN(birth.getTime())) return 'no registrada'
  const now = new Date()
  let years = now.getUTCFullYear() - birth.getUTCFullYear()
  const monthDelta = now.getUTCMonth() - birth.getUTCMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birth.getUTCDate())) years -= 1
  return `${years} anos`
}

async function callOpenAi(apiKey: string, model: string, prompt: string) {
  const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions: CLINICAL_SYSTEM_INSTRUCTIONS,
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'clinical_copilot_draft',
          schema: CLINICAL_COPILOT_JSON_SCHEMA,
          strict: false,
        },
      },
      reasoning: { effort: getOpenAiReasoningEffort(model) },
      max_output_tokens: 3200,
    }),
  })

  const payload = await response.json() as unknown
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${extractProviderError(payload)}`)
  return extractOpenAiText(payload)
}

function getOpenAiReasoningEffort(model: string) {
  if (model.startsWith('gpt-5.5')) return 'low'
  return 'minimal'
}

async function callAnthropic(apiKey: string, model: string, prompt: string) {
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1800,
      system: CLINICAL_SYSTEM_INSTRUCTIONS,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const payload = await response.json() as unknown
  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${extractProviderError(payload)}`)
  return extractAnthropicText(payload)
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.ai.timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function parseJsonObject(text: string) {
  const trimmed = text.trim()
  const direct = tryParseJson(trimmed)
  if (direct) return direct

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const extracted = tryParseJson(trimmed.slice(start, end + 1))
    if (extracted) return extracted
  }

  throw new Error('AI provider returned non-JSON output')
}

function tryParseJson(text: string) {
  try {
    const parsed = JSON.parse(text) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function mergeExternalDraft(
  localDraft: ClinicalCopilotDraft,
  payload: Record<string, unknown>,
  model: string,
): ClinicalCopilotDraft {
  return cleanClinicalCopilotDraft({
    ...localDraft,
    model,
    summary: asCleanString(payload.summary) ?? localDraft.summary,
    answer: asCleanString(payload.answer) ?? localDraft.answer,
    suggested_questions: asStringArray(payload.suggested_questions, localDraft.suggested_questions, 5),
    clinical_gaps: asStringArray(payload.clinical_gaps, localDraft.clinical_gaps, 5),
    soft_alerts: asStringArray(payload.soft_alerts, localDraft.soft_alerts, 4),
    soap_draft: asSoapDraft(payload.soap_draft) ?? localDraft.soap_draft,
  })
}

export function cleanClinicalCopilotDraft(draft: ClinicalCopilotDraft): ClinicalCopilotDraft {
  const answer = sanitizeAnswer(draft.answer)
  const softAlerts = sanitizeSoftAlerts(draft.soft_alerts)
  const suggestedQuestions = sanitizeList(draft.suggested_questions, {
    avoidText: answer,
    avoidItems: softAlerts,
    limit: 5,
  })
  const clinicalGaps = sanitizeList(draft.clinical_gaps, {
    avoidText: answer,
    avoidItems: [...softAlerts, ...suggestedQuestions],
    limit: 5,
  })

  return {
    ...draft,
    answer,
    suggested_questions: suggestedQuestions,
    clinical_gaps: clinicalGaps,
    soft_alerts: softAlerts,
  }
}

function sanitizeAnswer(value: string | undefined) {
  if (!value) return value
  return value
    .replace(/\s*;?\s*requiere validaci[oó]n m[eé]dica\.?$/i, '')
    .replace(/\s*Todo debe ser confirmado y priorizado por el m[eé]dico tratante\.?/gi, '')
    .trim()
}

function sanitizeSoftAlerts(values: string[]) {
  const clinical = values.filter(value => !isGenericSafetyText(value) && !isNonPriorityClinicalFact(value))
  return sanitizeList(clinical, { limit: 4 })
}

function sanitizeList(
  values: string[],
  options: { avoidText?: string; avoidItems?: string[]; limit?: number } = {},
) {
  const accepted: string[] = []
  const avoidItems = options.avoidItems ?? []

  for (const value of values) {
    const clean = value.replace(/\s+/g, ' ').trim()
    if (!clean) continue
    if (isNearDuplicate(clean, accepted)) continue
    if (isNearDuplicate(clean, avoidItems)) continue
    if (options.avoidText && hasHighTokenOverlap(clean, options.avoidText)) continue
    accepted.push(clean)
    if (options.limit && accepted.length >= options.limit) break
  }

  return accepted
}

function isGenericSafetyText(value: string) {
  return /validaci[oó]n m[eé]dica|juicio cl[ií]nico|recomendaciones requieren|m[eé]dico debe|no sustituye|borrador asistivo|responsabilidad/i.test(value)
}

function isNonPriorityClinicalFact(value: string) {
  const normalized = normalizeComparable(value)
  const hasImmediateRisk = /crisis|sever|grave|sincope|sangrado|hemorrag|disnea|reposo|dolor torac|hipoperfusion|inestab|deterior|spo2|saturacion|taquicard|bradicard|hipotension|hipertensiva|potasio|hiperpotas|hipogluc|hipergluc|fiebre|sepsis|neurolog|oliguria|anuria|edema pulmon/i.test(normalized)

  if (/tsh|hipotiroid|tiroid|levotiroxina/i.test(normalized) && !hasImmediateRisk) return true
  if (/ldl|colesterol|triglicer|dislipidem|hba1c|prediabetes|obesidad|imc/i.test(normalized) && !hasImmediateRisk) return true
  if (/adherencia|mala adherencia|omisiones/i.test(normalized) && !hasImmediateRisk) return true

  return false
}

function isNearDuplicate(value: string, existing: string[]) {
  return existing.some(item => normalizeComparable(item) === normalizeComparable(value) || hasHighTokenOverlap(value, item))
}

function hasHighTokenOverlap(left: string, right: string) {
  const leftTokens = comparableTokens(left)
  const rightTokens = comparableTokens(right)
  if (leftTokens.length < 3 || rightTokens.length < 3) return false
  const rightSet = new Set(rightTokens)
  const shared = leftTokens.filter(token => rightSet.has(token)).length
  return shared / Math.min(leftTokens.length, rightTokens.length) >= 0.72
}

function comparableTokens(value: string) {
  return normalizeComparable(value)
    .split(' ')
    .filter(token => token.length >= 4)
}

function normalizeComparable(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[¿?.,;:()[\]{}"'`]/g, ' ')
    .replace(/\b(el|la|los|las|una|uno|unos|unas|con|por|para|del|que|debe|deberia|tiene|tener|paciente)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function asSoapDraft(value: unknown): ClinicalCopilotDraft['soap_draft'] | undefined {
  if (!isRecord(value)) return undefined
  const subjective = asCleanString(value.subjective)
  const objective = asCleanString(value.objective)
  const assessment = asCleanString(value.assessment)
  const plan = asCleanString(value.plan)
  if (!subjective && !objective && !assessment && !plan) return undefined
  return {
    subjective: subjective ?? 'Completar subjetivo.',
    objective: objective ?? 'Completar objetivo.',
    assessment: assessment ?? 'Completar evaluacion.',
    plan: plan ?? 'Completar plan.',
  }
}

function asStringArray(value: unknown, fallback: string[], limit: number) {
  if (!Array.isArray(value)) return fallback
  const clean = value
    .map(item => asCleanString(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, limit)
  return clean.length ? clean : fallback
}

function asCleanString(value: unknown) {
  if (typeof value !== 'string') return null
  const clean = value.trim()
  return clean.length ? clean.slice(0, 5000) : null
}

function extractOpenAiText(payload: unknown): string {
  if (!isRecord(payload)) throw new Error('OpenAI response was not an object')
  const shortcut = asCleanString(payload.output_text)
  if (shortcut) return shortcut

  const output = payload.output
  if (!Array.isArray(output)) throw new Error('OpenAI response did not include output text')

  const parts = output.flatMap(item => {
    if (!isRecord(item)) return []
    return extractContentText(item.content)
  })

  const text = parts.join('\n').trim()
  if (!text) throw new Error('OpenAI response text was empty')
  return text
}

function extractAnthropicText(payload: unknown): string {
  if (!isRecord(payload)) throw new Error('Anthropic response was not an object')
  const parts = extractContentText(payload.content)
  const text = parts.join('\n').trim()
  if (!text) throw new Error('Anthropic response text was empty')
  return text
}

function extractContentText(content: unknown): string[] {
  if (typeof content === 'string') return [content]
  if (!Array.isArray(content)) return []

  return content.flatMap(part => {
    if (typeof part === 'string') return [part]
    if (!isRecord(part)) return []
    const text = asCleanString(part.text)
    return text ? [text] : []
  })
}

function extractProviderError(payload: unknown) {
  if (!isRecord(payload)) return 'unknown provider error'
  const error = payload.error
  if (isRecord(error)) return asCleanString(error.message) ?? JSON.stringify(error)
  return JSON.stringify(payload).slice(0, 1000)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
