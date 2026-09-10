/**
 * Reconstruccion del diagrama en modo foco (entidad seleccionada).
 *
 * En modo foco el modelo NO reproduce el diagrama completo: devuelve SOLO
 * la entidad seleccionada (o la omite si hay que eliminarla) y las
 * relaciones que la tocan en su estado final. Esta funcion reconstruye el
 * diagrama completo combinando:
 *   - entidad seleccionada: la version del modelo (o eliminada si la omite)
 *   - relaciones tocantes: las del modelo (ausente = eliminada)
 *   - resto de entidades y relaciones: intactas, tal cual estaban
 *
 * Asi el diff aguas abajo solo genera acciones sobre lo seleccionado y
 * desaparece la pared de "Se ignoro" por entidades omitidas/truncadas.
 */
import type {
  CanonicalDiagram,
  CanonicalEntity,
  CanonicalRelation,
} from './canonical';

/**
 * Reconstruye el diagrama completo a partir de la salida reducida del foco.
 * @param actual - Diagrama actual proyectado (completo)
 * @param salida - Salida del modelo en modo foco (solo lo seleccionado)
 * @param idCanonico - Id canonico de la entidad seleccionada (ej: "n16")
 * @returns Diagrama completo listo para el diff
 */
export function reconstruirConFoco(
  actual: CanonicalDiagram,
  salida: CanonicalDiagram,
  idCanonico: string,
): CanonicalDiagram {
  // Entidad seleccionada segun el modelo (undefined = el modelo la elimino)
  const entidadModelo = salida.entidades.find((e) => e.id === idCanonico);

  // 1. Entidades: todas las no seleccionadas intactas + la seleccionada
  //    en su version del modelo (o nada, si hay que eliminarla).
  const entidades: CanonicalEntity[] = actual.entidades.filter(
    (e) => e.id !== idCanonico,
  );
  if (entidadModelo) {
    entidades.push(entidadModelo);
  }

  // 2. Relaciones: solo se aceptan del modelo las que tocan a la entidad
  //    seleccionada; cualquier otra se ignora (fuera del alcance del foco).
  const tocantesModelo = new Map<string, CanonicalRelation>();
  for (const r of salida.relaciones) {
    if (r.origen === idCanonico || r.destino === idCanonico) {
      tocantesModelo.set(r.id, r);
    }
  }

  const relaciones: CanonicalRelation[] = [];
  for (const r of actual.relaciones) {
    const tocaSeleccion = r.origen === idCanonico || r.destino === idCanonico;
    if (!tocaSeleccion) {
      // Relacion ajena: se preserva intacta siempre
      relaciones.push(r);
      continue;
    }
    if (entidadModelo === undefined) {
      // Entidad eliminada: sus relaciones caen con ella
      continue;
    }
    // Relacion tocante: la version del modelo, o eliminada si la omite
    const versionModelo = tocantesModelo.get(r.id);
    if (versionModelo) relaciones.push(versionModelo);
  }

  // 3. Relaciones nuevas del modelo (ids no existentes) que tocan al foco
  const idsActuales = new Set(actual.relaciones.map((r) => r.id));
  for (const [id, r] of tocantesModelo) {
    if (!idsActuales.has(id) && entidadModelo !== undefined) {
      relaciones.push(r);
    }
  }

  return { entidades, relaciones };
}

/**
 * Extrae el contexto reducido que se le envia al modelo en modo foco:
 * la entidad seleccionada completa + sus relaciones + los ids canonicos
 * de las demas entidades (solo como referencia para nuevas relaciones).
 * @param actual - Diagrama actual proyectado (completo)
 * @param idCanonico - Id canonico de la entidad seleccionada
 * @returns Objeto compacto para el prompt de foco
 */
export function contextoFoco(
  actual: CanonicalDiagram,
  idCanonico: string,
): {
  seleccionada: CanonicalEntity | null;
  relacionesTocantes: CanonicalRelation[];
  otrasEntidades: string[];
} {
  const seleccionada =
    actual.entidades.find((e) => e.id === idCanonico) ?? null;
  const relacionesTocantes = actual.relaciones.filter(
    (r) => r.origen === idCanonico || r.destino === idCanonico,
  );
  const otrasEntidades = actual.entidades
    .filter((e) => e.id !== idCanonico)
    .map((e) => `${e.id}:"${e.nombre}"`);
  return { seleccionada, relacionesTocantes, otrasEntidades };
}
