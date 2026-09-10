/**
 * Resolucion de acciones canonicas a acciones aplicables.
 *
 * 1. Sustituye los ids canonicos (n1/e1) por los ids reales del store usando
 *    el idMap de la proyeccion. Los ids inventados por el modelo (entidades
 *    nuevas) se conservan para que el frontend genere el id real al aplicar.
 * 2. Aplica el alcance de seleccion PERMISIVO:
 *      - Entidad seleccionada: se permite modificar/eliminar esa entidad y sus
 *        relaciones conectadas. Crear entidades/relaciones nuevas: SIEMPRE.
 *      - Relacion seleccionada: solo se permite modificar/eliminar esa relacion.
 *    Cualquier otra accion se descarta y se reporta en advertencias.
 */
import type { DiagramAction, Projection } from './canonical';

/** Alcance de seleccion que manda el frontend junto con el snapshot. */
export interface Seleccion {
  /** Id real del elemento seleccionado en el lienzo. */
  id: string;
  kind: 'entidad' | 'relacion';
}

/** Resultado de la resolucion: acciones aplicables + advertencias. */
export interface ResultadoResolucion {
  acciones: DiagramAction[];
  advertencias: string[];
}

/**
 * Resuelve los ids canonicos a ids reales y filtra por seleccion.
 * @param acciones - Acciones canonicas del diff
 * @param proyeccion - Proyeccion con idMap y diagrama actual
 * @param seleccion - Elemento seleccionado (null = "Todo el lienzo")
 * @returns Acciones aplicables y advertencias de lo descartado
 */
export function resolveActions(
  acciones: DiagramAction[],
  proyeccion: Projection,
  seleccion: Seleccion | null,
): ResultadoResolucion {
  const { idMap, resultado } = proyeccion;
  const advertencias: string[] = [];
  const aplicables: DiagramAction[] = [];

  // Id canonico del elemento seleccionado (si existe en el snapshot)
  let canonicoSeleccion: string | null = null;
  let seleccionValida = false;
  if (seleccion) {
    for (const [canonico, real] of idMap) {
      if (real === seleccion.id) {
        canonicoSeleccion = canonico;
        seleccionValida = true;
        break;
      }
    }
  }

  /** Decide si una accion sobre una entidad es permitida por el alcance. */
  const entidadPermitida = (idReal: string): boolean => {
    if (!seleccion) return true;
    // Solo cuando esta seleccionada una entidad se permite editarla/eliminarla
    return seleccion.kind === 'entidad' && seleccion.id === idReal;
  };

  const relacionPermitida = (
    accion: Extract<
      DiagramAction,
      { tipo: 'updateRelacion' | 'deleteRelacion' }
    >,
  ): boolean => {
    if (!seleccion) return true;
    if (!seleccionValida) return false;
    // Relacion seleccionada explicitamente -> solo esa
    if (seleccion.kind === 'relacion') {
      return seleccion.id === (idMap.get(accion.id) ?? accion.id);
    }
    // Entidad seleccionada -> permitidas las relaciones conectadas a ella
    if (seleccion.kind === 'entidad' && canonicoSeleccion) {
      const relacionActual = resultado.relaciones.find(
        (r) => r.id === accion.id,
      );
      return (
        relacionActual !== undefined &&
        (relacionActual.origen === canonicoSeleccion ||
          relacionActual.destino === canonicoSeleccion)
      );
    }
    return false;
  };

  for (const accion of acciones) {
    switch (accion.tipo) {
      case 'createEntidad': {
        // Las entidades nuevas siempre pueden crearse (permitido)
        aplicables.push(accion);
        break;
      }
      case 'updateEntidad':
      case 'deleteEntidad': {
        const idReal = idMap.get(accion.id) ?? accion.id;
        if (entidadPermitida(idReal)) {
          aplicables.push({ ...accion, id: idReal });
        } else {
          advertencias.push(
            `Se ignoro: "${accion.descripcion}" (solo se edita lo seleccionado)`,
          );
        }
        break;
      }
      case 'createRelacion': {
        // Relaciones nuevas: se permiten, resolviendo extremos ya existentes
        const relacion = { ...accion.relacion };
        relacion.origen = idMap.get(relacion.origen) ?? relacion.origen;
        relacion.destino = idMap.get(relacion.destino) ?? relacion.destino;
        if (relacion.origen === '' || relacion.destino === '') {
          advertencias.push(
            `Se ignoro: "${accion.descripcion}" (referencia a entidad inexistente)`,
          );
        } else {
          aplicables.push({ ...accion, relacion });
        }
        break;
      }
      case 'updateRelacion':
      case 'deleteRelacion': {
        if (relacionPermitida(accion)) {
          const idReal = idMap.get(accion.id) ?? accion.id;
          aplicables.push(
            accion.tipo === 'updateRelacion'
              ? { ...accion, id: idReal, relacion: { ...accion.relacion } }
              : { ...accion, id: idReal },
          );
        } else {
          advertencias.push(
            `Se ignoro: "${accion.descripcion}" (solo se edita lo seleccionado)`,
          );
        }
        break;
      }
    }
  }

  return { acciones: aplicables, advertencias };
}
