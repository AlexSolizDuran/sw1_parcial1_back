/**
 * Prompt de sistema del agente SUPPORT del diagramador UML.
 * Con RAG el conocimiento viaja en la INFO recuperada (top-3 de pgvector),
 * no en el system: aqui van solo instrucciones cortas + el manual completo
 * como FALLBACK (cuando el retrieval falla por red/DB, nunca se rompe).
 * La primera linea ([SUPPORT]) es el marcador que usa el proveedor mock.
 */
import { MANUAL } from './support-manual';

/** Instrucciones fijas del agente (cortas, ~200 palabras). */
const INSTRUCCIONES = [
  '[SUPPORT] Eres el asistente de ayuda de la plataforma de diagramas de clases UML.',
  'Respondes SIEMPRE en español, en texto plano (nada de JSON), con pasos numerados y cortos: maximo ~150 palabras.',
  '',
  '## REGLA DURA',
  'Responde SOLO con la INFO dada abajo. Si la INFO no cubre la pregunta o dice "(sin cobertura)",',
  'responde que solo puedes ayudar con el uso de la plataforma y ofrece los temas que si cubres',
  '(diagramas, editor, colaboradores, versiones, XMI, COPILOT, Spring Boot, cuenta).',
  'Nunca inventes botones, rutas ni pasos que no esten en la INFO.',
].join('\n');

/**
 * Construye el mensaje de sistema para el modelo (modo RAG).
 * @param info - Chunks recuperados ya formateados ("[1] titulo: pasos..."), o null si no hubo retrieval
 * @returns Texto del prompt de sistema
 */
export function supportSystemPrompt(info: string | null): string {
  if (info === null) {
    // Fallback total: sin retrieval (error de red/DB) va el manual completo
    return `${INSTRUCCIONES}\n\n## INFO (manual completo)\n${manualCompleto()}`;
  }
  return `${INSTRUCCIONES}\n\n## INFO\n${info}`;
}

/**
 * Manual completo como texto (fallback y compatibilidad).
 * @returns Titulo + pasos de todas las entradas
 */
export function manualCompleto(): string {
  return MANUAL.map((e) => `### ${e.titulo}\n${e.pasos}`).join('\n\n');
}

/**
 * Respuesta fija cuando nada del manual cubre la pregunta.
 * Es determinista (no pasa por el modelo): cero tokens y cero alucinacion.
 */
export const REDIRECCION_FUERA_DE_TEMA =
  'Solo puedo ayudarte con el uso de la plataforma. Puedo orientarte en: ' +
  'diagramas, editor, colaboradores y roles, versiones, exportar XMI, COPILOT, ' +
  'generar Spring Boot y cuenta. ¿Sobre cuál preguntas?';

/**
 * Formatea los chunks recuperados como INFO numerada para el prompt.
 * @param textos - Textos ya ordenados por relevancia ("titulo: pasos")
 * @returns Bloque INFO listo para inyectar (o "(sin cobertura)" si viene vacio)
 */
export function formatearInfo(textos: string[]): string {
  if (textos.length === 0) return '(sin cobertura)';
  return textos.map((t, i) => `[${i + 1}] ${t}`).join('\n\n');
}
