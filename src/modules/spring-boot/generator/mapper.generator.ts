/**
 * Generador de Mapper Entity <-> DTO por tabla.
 * Un archivo por tabla: <Nombre>Mapper.java (metodos estaticos toResponse).
 */
import type { CanonicalEntity } from '../../ai/dsl/canonical';

/**
 * Genera el mapper de una entidad.
 * @param entidad - Entidad canonica
 * @param paquete - Paquete del modulo
 * @returns Codigo Java del mapper
 */
export function generateMapper(
  entidad: CanonicalEntity,
  paquete: string,
): string {
  const nombre = entidad.nombre;
  const asignaciones = entidad.atributos
    .filter((a) => !a.estatico)
    .map(
      (a) =>
        `        res.set${capitalizar(a.nombre)}(entity.get${capitalizar(a.nombre)}());`,
    )
    .join('\n');
  return `package ${paquete};

// Mapper de ${nombre}: convierte Entity <-> DTO
public class ${nombre}Mapper {

    // Convierte la entidad persistida al DTO de salida
    public static ${nombre}Response toResponse(${nombre} entity) {
        ${nombre}Response res = new ${nombre}Response();
        res.setId(entity.getId());
${asignaciones === '' ? '        // Sin atributos que mapear' : asignaciones}
        return res;
    }
}
`;
}

/** Convierte "nombre" en "Nombre" para getters/setters. */
function capitalizar(texto: string): string {
  if (texto.length === 0) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
