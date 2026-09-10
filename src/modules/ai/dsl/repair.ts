/**
 * Reparacion de la salida del modelo: extrae el objeto JSON del texto crudo.
 *
 * Los modelos no siempre devuelven JSON puro; pueden envolverlo en bloques
 * markdown, agregar texto arriba/abajo o dejar comas finales. Este modulo
 * intenta rescatar el JSON en orden creciente de agresividad.
 */

/** Limpia caracteres invisibles y recupera JSON de un texto. */
function limpiar(texto: string): string {
  let limpio = texto.replace(/```(?:json)?/gi, '').trim();
  // Comas finales dentro de objetos/arrays (error comun en LLMs)
  limpio = limpio.replace(/,\s*([}\]])/g, '$1');
  return limpio;
}

/**
 * Busca el primer bloque balanceado { ... } dentro del texto.
 * Soporta cadenas con llaves anidadas y escapa comillas dentro de strings.
 * @param texto - Salida cruda del modelo
 * @returns El substring del primer objeto JSON balanceado o null
 */
function extraerBloqueBalanceado(texto: string): string | null {
  let inicio = -1;
  let profundidad = 0;
  let enString = false;
  let escapado = false;

  for (let i = 0; i < texto.length; i += 1) {
    const ch = texto[i];
    if (enString) {
      if (escapado) {
        escapado = false;
      } else if (ch === '\\') {
        escapado = true;
      } else if (ch === '"') {
        enString = false;
      }
      continue;
    }
    if (ch === '"') {
      enString = true;
      continue;
    }
    if (ch === '{') {
      if (inicio === -1) inicio = i;
      profundidad += 1;
    } else if (ch === '}') {
      profundidad -= 1;
      if (profundidad === 0 && inicio !== -1) {
        return texto.slice(inicio, i + 1).trim();
      }
    }
  }
  return null;
}

/**
 * Extrae y parsea el JSON de la salida del modelo.
 * @param texto - Salida cruda del modelo
 * @returns El valor parseado
 * @throws Error si no se encuentra un JSON valido
 */
export function extractJson(texto: string): unknown {
  if (!texto || texto.trim() === '') {
    throw new Error('La respuesta del modelo esta vacia.');
  }

  const candidates = [limpiar(texto), extraerBloqueBalanceado(texto)].filter(
    (c): c is string => Boolean(c),
  );

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Se intenta con el siguiente candidato
    }
  }

  throw new Error('No se pudo extraer un objeto JSON valido de la respuesta.');
}
