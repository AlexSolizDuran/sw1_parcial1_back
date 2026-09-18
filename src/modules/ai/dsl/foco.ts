/**
 * Reconstruccion del diagrama en modo foco (entidad seleccionada).
 *
 * En modo foco el modelo NO reproduce el diagrama completo: devuelve SOLO
 * la entidad seleccionada (o la omite si hay que eliminarla) y las
 * relaciones que la tocan en su estado final. Esta funcion reconstruye el
 * diagrama completo combinando:
 *   - entidad seleccionada: la version del modelo, o ELIMINADA SOLO si el
 *     modelo devolvio "entidades": [] (señal explicita de borrado).
 *     Si la devuelve con otro id (id drift) se remapea al id canonico; si
 *     la omite sin señal de borrado se conserva la version actual avisando,
 *     para NUNCA eliminar la tabla seleccionada por error del modelo.
 *   - relaciones tocantes: se aplica la version del modelo si las devuelve,
 *     se conservan tal cual si las omite (la omision nunca borra), y se
 *     eliminan SOLO con la señal explicita "eliminar": true. Al eliminar la
 *     entidad, sus relaciones caen con ella.
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

/** Resultado de la reconstruccion en modo foco. */
export interface ReconstruccionFoco {
  /** Diagrama completo reconstruido listo para el diff. */
  diagrama: CanonicalDiagram;
  /** Avisos por decisiones tomadas ante ambiguedad del modelo. */
  advertencias: string[];
}

/** Version final de la entidad seleccionada y sus ids alternativos. */
interface EntidadFoco {
  /** Entidad final (undefined = el modelo pidio eliminarla). */
  entidad: CanonicalEntity | undefined;
  /** Ids alternativos que uso el modelo para referenciar esta entidad. */
  aliasIds: string[];
}

/**
 * Reconstruye el diagrama completo a partir de la salida reducida del foco.
 * @param actual - Diagrama actual proyectado (completo)
 * @param salida - Salida del modelo en modo foco (solo lo seleccionado)
 * @param idCanonico - Id canonico de la entidad seleccionada (ej: "n16")
 * @returns Diagrama completo listo para el diff + advertencias
 */
export function reconstruirConFoco(
  actual: CanonicalDiagram,
  salida: CanonicalDiagram,
  idCanonico: string,
): ReconstruccionFoco {
  const advertencias: string[] = [];

  // Entidad seleccionada segun el modelo (undefined = se elimina).
  const { entidad: entidadModelo, aliasIds } = resolverEntidadSeleccionada(
    actual,
    salida,
    idCanonico,
    advertencias,
  );

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
  //    Regla de seguridad (espejo de entidades): la omision NUNCA borra una
  //    relacion. Se conserva la actual si el modelo no la devuelve; se aplica
  //    su version si la devuelve; y se elimina SOLO si el modelo la marca con
  //    "eliminar": true (señal explicita que el prompt exige para borrar).
  //    Si la entidad vino con id driftado, sus extremos se remapean al id
  //    canonico para no dejar relaciones colgando.
  const aliasSet = new Set(aliasIds);
  const eliminadosExplicitos = new Set<string>();
  const tocantesModelo = new Map<string, CanonicalRelation>();
  for (const r of salida.relaciones) {
    const origen = aliasSet.has(r.origen) ? idCanonico : r.origen;
    const destino = aliasSet.has(r.destino) ? idCanonico : r.destino;
    if (origen !== idCanonico && destino !== idCanonico) continue;
    if (r.eliminar === true) {
      // Señal explicita de borrado del lado del modelo
      eliminadosExplicitos.add(r.id);
      continue;
    }
    // Se limpia la señal interna para que no viaje en las acciones
    const version = { ...r, origen, destino };
    delete version.eliminar;
    tocantesModelo.set(r.id, version);
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
    if (eliminadosExplicitos.has(r.id)) {
      // El modelo pidio borrar esta relacion explicitamente
      continue;
    }
    // Version del modelo si la devolvio; si la omitio se conserva la actual
    relaciones.push(tocantesModelo.get(r.id) ?? r);
  }

  // 3. Relaciones nuevas del modelo (ids no existentes) que tocan al foco
  const idsActuales = new Set(actual.relaciones.map((r) => r.id));
  for (const [id, r] of tocantesModelo) {
    if (!idsActuales.has(id) && entidadModelo !== undefined) {
      relaciones.push(r);
    }
  }

  return { diagrama: { entidades, relaciones }, advertencias };
}

/**
 * Decide que version de la entidad seleccionada prevalece en el foco.
 *
 * Regla de seguridad: la entidad SOLO se elimina cuando el modelo devuelve
 * "entidades": [] (señal explicita que el prompt exige para borrar). Si la
 * devuelve con otro id se rescata (id drift / renombre); si la omite sin
 * señal de borrado se conserva la version actual con un aviso.
 */
function resolverEntidadSeleccionada(
  actual: CanonicalDiagram,
  salida: CanonicalDiagram,
  idCanonico: string,
  advertencias: string[],
): EntidadFoco {
  // Caso feliz: el modelo respeta el id canonico
  const conIdCanonico = salida.entidades.find((e) => e.id === idCanonico);
  if (conIdCanonico) return { entidad: conIdCanonico, aliasIds: [] };

  // Señal explicita de borrado: el contrato del prompt exige "entidades": []
  if (salida.entidades.length === 0) {
    return { entidad: undefined, aliasIds: [] };
  }

  // Id drift / renombre: la entidad volvio con otro id. Se rescata la que
  // mejor corresponde a la seleccionada (mismo nombre o la unica devuelta).
  const rescatada = rescatarEntidadFoco(salida.entidades, actual, idCanonico);
  if (rescatada) {
    advertencias.push(
      `La IA devolvió la entidad seleccionada con el id '${rescatada.id}' en vez de '${idCanonico}'; se usó esa versión y se conservó el id original.`,
    );
    // Se remapea al id canonico para mantener el vinculo con el lienzo y se
    // recuerda el id alternativo para normalizar las relaciones tocantes.
    return {
      entidad: { ...rescatada, id: idCanonico },
      aliasIds: [rescatada.id],
    };
  }

  // Ausencia ambigua (truncamiento u omision sin señal de borrado): se
  // conserva la version actual; nunca eliminar la tabla por error.
  advertencias.push(
    'La IA no devolvió la entidad seleccionada ni indicó eliminarla; se mantuvo sin cambios.',
  );
  return {
    entidad: actual.entidades.find((e) => e.id === idCanonico),
    aliasIds: [],
  };
}

/**
 * Busca en la salida del modelo la entidad que corresponde a la seleccionada
 * cuando el id canonico no coincide (id drift o renombre).
 * @returns La entidad rescatada o null si la salida es ambigua
 */
function rescatarEntidadFoco(
  candidatas: CanonicalEntity[],
  actual: CanonicalDiagram,
  idCanonico: string,
): CanonicalEntity | null {
  const nombreActual = actual.entidades.find(
    (e) => e.id === idCanonico,
  )?.nombre;

  // Prioridad 1: mismo nombre (id drift puro)
  const porNombre = candidatas.find(
    (e) => e.id !== idCanonico && e.nombre === nombreActual,
  );
  if (porNombre) return porNombre;

  // Prioridad 2: unica entidad devuelta = la seleccionada editada (posible
  // renombre). Se acepta porque en modo foco el modelo solo ve ese elemento.
  if (candidatas.length === 1) return candidatas[0];

  return null;
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
