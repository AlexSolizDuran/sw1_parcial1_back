/**
 * Calculo del diff entre el diagrama actual (canonico) y el devuelto por el
 * modelo. Produce acciones elementales ordenadas para aplicar en el frontend:
 *   1. eliminar relaciones    (nunca aplicar en el mismo orden que crea)
 *   2. eliminar entidades
 *   3. crear entidades
 *   4. actualizar entidades
 *   5. crear relaciones (despues de existir las entidades destino)
 *   6. actualizar relaciones
 */
import type {
  CanonicalDiagram,
  CanonicalEntity,
  CanonicalField,
  CanonicalMethod,
  CanonicalRelation,
  DiagramAction,
} from './canonical';

/** Compara un campo canonico ignorando claves opcionales ausentes. */
function igualCampo(a: CanonicalField, b: CanonicalField): boolean {
  return (
    a.visibilidad === b.visibilidad &&
    a.nombre === b.nombre &&
    a.tipo === b.tipo &&
    (a.estatico ?? false) === (b.estatico ?? false) &&
    (a.readonly ?? false) === (b.readonly ?? false) &&
    (a.valor ?? '') === (b.valor ?? '')
  );
}

function igualMetodo(a: CanonicalMethod, b: CanonicalMethod): boolean {
  const paramsIguales =
    a.params.length === b.params.length &&
    a.params.every((p, i) => {
      const otro = b.params[i];
      return (
        otro !== undefined && p.nombre === otro.nombre && p.tipo === otro.tipo
      );
    });
  return (
    a.visibilidad === b.visibilidad &&
    a.nombre === b.nombre &&
    a.ret === b.ret &&
    paramsIguales &&
    (a.estatico ?? false) === (b.estatico ?? false) &&
    (a.abstracto ?? false) === (b.abstracto ?? false)
  );
}

function igualLiterales(a: CanonicalEntity, b: CanonicalEntity): boolean {
  const litA = a.literales ?? [];
  const litB = b.literales ?? [];
  return litA.length === litB.length && litA.every((l, i) => l === litB[i]);
}

function igualEntidad(a: CanonicalEntity, b: CanonicalEntity): boolean {
  return (
    a.tipo === b.tipo &&
    a.nombre === b.nombre &&
    a.atributos.length === b.atributos.length &&
    a.atributos.every((f, i) => {
      const bf = b.atributos[i];
      return bf !== undefined && igualCampo(f, bf);
    }) &&
    a.metodos.length === b.metodos.length &&
    a.metodos.every((m, i) => {
      const bm = b.metodos[i];
      return bm !== undefined && igualMetodo(m, bm);
    }) &&
    igualLiterales(a, b)
  );
}

function igualRelacion(a: CanonicalRelation, b: CanonicalRelation): boolean {
  return (
    a.tipo === b.tipo &&
    a.origen === b.origen &&
    a.destino === b.destino &&
    (a.label ?? '') === (b.label ?? '') &&
    (a.multiplicidadOrigen ?? '') === (b.multiplicidadOrigen ?? '') &&
    (a.multiplicidadDestino ?? '') === (b.multiplicidadDestino ?? '')
  );
}

/** Construye un resumen corto de los cambios dentro de una entidad. */
function resumenCambios(a: CanonicalEntity, b: CanonicalEntity): string[] {
  const cambios: string[] = [];

  if (a.tipo !== b.tipo) cambios.push(`tipo -> ${b.tipo}`);

  const atribA = new Map(a.atributos.map((f) => [f.nombre, f]));
  const atribB = new Map(b.atributos.map((f) => [f.nombre, f]));
  for (const [nombre, campo] of atribB) {
    if (!atribA.has(nombre)) cambios.push(`+ atributo ${nombre}:${campo.tipo}`);
  }
  for (const [nombre] of atribA) {
    if (!atribB.has(nombre)) cambios.push(`- atributo ${nombre}`);
  }
  for (const [nombre, campo] of atribB) {
    const anterior = atribA.get(nombre);
    if (anterior && !igualCampo(anterior, campo))
      cambios.push(`~ atributo ${nombre}`);
  }

  const metA = new Map(a.metodos.map((m) => [m.nombre, m]));
  const metB = new Map(b.metodos.map((m) => [m.nombre, m]));
  for (const [nombre] of metB) {
    if (!metA.has(nombre)) cambios.push(`+ metodo ${nombre}(...)`);
  }
  for (const [nombre] of metA) {
    if (!metB.has(nombre)) cambios.push(`- metodo ${nombre}(...)`);
  }
  for (const [nombre, metodo] of metB) {
    const anterior = metA.get(nombre);
    if (anterior && !igualMetodo(anterior, metodo))
      cambios.push(`~ metodo ${nombre}(...)`);
  }

  if (!igualLiterales(a, b)) cambios.push('literales actualizados');

  return cambios;
}

/**
 * Calcula el diff canonico entre dos diagramas.
 * @param actual - Diagrama actual proyectado
 * @param deseado - Diagrama devuelto por el modelo
 * @returns Acciones ordenadas con ids canonicos y descripciones legibles
 */
export function diffDiagrams(
  actual: CanonicalDiagram,
  deseado: CanonicalDiagram,
): DiagramAction[] {
  const actualEntidades = new Map(actual.entidades.map((e) => [e.id, e]));
  const deseadoEntidades = new Map(deseado.entidades.map((e) => [e.id, e]));
  const actualRelaciones = new Map(actual.relaciones.map((r) => [r.id, r]));
  const deseadoRelaciones = new Map(deseado.relaciones.map((r) => [r.id, r]));

  const acciones: DiagramAction[] = [];

  // 1. Eliminar relaciones que ya no existen
  for (const [id, rel] of actualRelaciones) {
    if (!deseadoRelaciones.has(id)) {
      acciones.push({
        tipo: 'deleteRelacion',
        id,
        descripcion: `Eliminar relacion ${rel.tipo} (${rel.origen} -> ${rel.destino})`,
      });
    }
  }

  // 2. Eliminar entidades que ya no existen
  for (const [id] of actualEntidades) {
    if (!deseadoEntidades.has(id)) {
      acciones.push({
        tipo: 'deleteEntidad',
        id,
        descripcion: `Eliminar entidad ${id}`,
      });
    }
  }

  // 3. Crear entidades nuevas
  for (const entidad of deseado.entidades) {
    if (!actualEntidades.has(entidad.id)) {
      acciones.push({
        tipo: 'createEntidad',
        entidad,
        descripcion: `Crear ${etiquetaTipo(entidad.tipo)} "${entidad.nombre}"`,
      });
    }
  }

  // 4. Actualizar entidades existentes
  for (const entidad of deseado.entidades) {
    const actual = actualEntidades.get(entidad.id);
    if (actual && !igualEntidad(actual, entidad)) {
      const cambios = resumenCambios(actual, entidad);
      acciones.push({
        tipo: 'updateEntidad',
        id: entidad.id,
        entidad,
        descripcion: `Modificar "${entidad.nombre}"${cambios.length ? `: ${cambios.join(', ')}` : ''}`,
      });
    }
  }

  // 5. Crear relaciones nuevas (despues de existir las entidades destino)
  for (const relacion of deseado.relaciones) {
    if (!actualRelaciones.has(relacion.id)) {
      acciones.push({
        tipo: 'createRelacion',
        relacion,
        descripcion: `Crear relacion ${relacion.tipo} (${relacion.origen} -> ${relacion.destino})`,
      });
    }
  }

  // 6. Actualizar relaciones existentes
  for (const relacion of deseado.relaciones) {
    const actual = actualRelaciones.get(relacion.id);
    if (actual && !igualRelacion(actual, relacion)) {
      acciones.push({
        tipo: 'updateRelacion',
        id: relacion.id,
        relacion,
        descripcion: `Modificar relacion ${relacion.tipo} (${relacion.origen} -> ${relacion.destino})`,
      });
    }
  }

  return acciones;
}

/** Nombre legible de cada tipo de entidad para las descripciones. */
function etiquetaTipo(tipo: CanonicalEntity['tipo']): string {
  switch (tipo) {
    case 'interface':
      return 'interfaz';
    case 'abstract':
      return 'clase abstracta';
    case 'enumeration':
      return 'enumeracion';
    default:
      return 'clase';
  }
}
