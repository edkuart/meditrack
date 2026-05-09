export type AiAssistMode = 'SUMMARIZE_ENCOUNTER' | 'SIMPLIFY_FOR_PATIENT'

export interface AiAssistDraft {
  mode: AiAssistMode
  text: string
  safety_notice: string
  model: 'local-assist-v1'
}

const SAFETY_NOTICE = 'Borrador asistivo: revisar, editar y validar clínicamente antes de guardar. No genera diagnósticos ni indicaciones nuevas.'

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
