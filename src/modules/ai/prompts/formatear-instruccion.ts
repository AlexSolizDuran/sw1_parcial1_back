/**
 * Formato del mensaje del usuario que recibe el modelo en modo no-foco.
 *
 * Se mantiene en un modulo aparte (sin dependencias de NestJS) para poder
 * testearlo en Jest sin arrastrar el ESM de @nestjs/config.
 */
import type { CanonicalDiagram } from '../dsl/canonical';

/**
 * Da formato al mensaje del usuario con la instruccion y el diagrama.
 * @param instruccion - Instruccion original del usuario
 * @param diagrama - Diagrama canonico completo
 * @param modo - 'agregar' (editar) o 'reemplazar' (generar desde cero)
 * @param restringir - true si el usuario pidio alcance restrictivo (checkbox "Solo")
 * @param idCanonicoSeleccion - Id canonico de la seleccion (null si no hay)
 * @returns Texto del mensaje user para el modelo
 */
export function formatearInstruccion(
  instruccion: string,
  diagrama: CanonicalDiagram,
  modo: 'agregar' | 'reemplazar',
  restringir: boolean,
  idCanonicoSeleccion: string | null,
): string {
  const modoTexto =
    modo === 'reemplazar'
      ? 'El diagrama actual está vacío: construí el diagrama COMPLETO desde cero siguiendo la instrucción.'
      : 'Modo agregar: editá el diagrama actual aplicando solo los cambios pedidos.';
  const seleccionada = idCanonicoSeleccion
    ? diagrama.entidades.find((e) => e.id === idCanonicoSeleccion)
    : null;
  const contexto =
    restringir && idCanonicoSeleccion
      ? `\nAlcance: actuá SOLO sobre el elemento seleccionado. No modifiques ni elimines otras entidades del diagrama.\n`
      : idCanonicoSeleccion
        ? `\nElemento seleccionado en el lienzo: ${seleccionada ? `"${seleccionada.nombre}"` : idCanonicoSeleccion}. Si la instrucción menciona "la clase seleccionada" o "esa clase", se refiere a este elemento. NO lo limites a él: aplicá los cambios pedidos sobre todo el diagrama.\n`
        : '';

  return `Instrucción: ${instruccion}\n\n${modoTexto}${contexto}\n## Diagrama actual (JSON)\n${JSON.stringify(diagrama)}`;
}
