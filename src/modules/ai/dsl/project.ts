/**
 * Proyeccion del estado del lienzo (reactFlowState) al DSL canonico.
 *
 * Convierte los nodos/aristas de React Flow en el formato compacto que recibe
 * el modelo. Se eliminan: ids reales, posiciones, flags en false y campos
 * vacios. Los ids se reescriben como n1/n2... y e1/e2... para que el modelo
 * no vea identificadores internos del store.
 */
import { createHash } from 'node:crypto';
import type {
  CanonicalDiagram,
  CanonicalEntity,
  CanonicalField,
  CanonicalMethod,
  CanonicalParam,
  CanonicalRelation,
  EntidadTipo,
  Projection,
  TipoRelacion,
  Visibilidad,
} from './canonical';

/** Forma minima del snapshot que manda el frontend (reactFlowState). */
export interface SnapshotEntrada {
  nodes?: Array<{
    id?: unknown;
    type?: unknown;
    position?: unknown;
    data?: Record<string, unknown>;
  }>;
  edges?: Array<{
    id?: unknown;
    source?: unknown;
    target?: unknown;
    type?: unknown;
    label?: unknown;
    sourceMultiplicity?: unknown;
    targetMultiplicity?: unknown;
  }>;
}

/** Valores validos para evitar castear datos corruptos al DSL. */
const TIPOS_ENTIDAD: EntidadTipo[] = [
  'class',
  'interface',
  'abstract',
  'enumeration',
];

const TIPOS_RELACION: TipoRelacion[] = [
  'inheritance',
  'implementation',
  'association',
  'aggregation',
  'composition',
  'dependency',
];

const VISIBILIDADES: Visibilidad[] = [
  'public',
  'private',
  'protected',
  'package',
];

/** Reduce un nodo de React Flow a su entidad canonica. */
function proyectarEntidad(
  node: NonNullable<SnapshotEntrada['nodes']>[number],
  index: number,
): CanonicalEntity {
  const data = node.data ?? {};
  const fields = Array.isArray(data.fields) ? data.fields : [];
  const methods = Array.isArray(data.methods) ? data.methods : [];
  const literals = Array.isArray(data.literals) ? data.literals : [];

  const tipo =
    typeof node.type === 'string' &&
    TIPOS_ENTIDAD.includes(node.type as EntidadTipo)
      ? (node.type as EntidadTipo)
      : 'class';

  const atributos = fields.map((f): CanonicalField => {
    const field = f as Record<string, unknown>;
    return {
      visibilidad: esVisibilidad(field.visibilidad)
        ? field.visibilidad
        : 'public',
      nombre: cadena(field.name, 'campo'),
      tipo: cadena(field.type, 'void'),
      // Solo se emiten los flags activos para reducir tokens
      ...(field.isStatic === true && { estatico: true as const }),
      ...(field.isReadonly === true && { readonly: true as const }),
      ...(cadena(field.defaultValue, '') !== '' && {
        valor: cadena(field.defaultValue, ''),
      }),
    };
  });

  const metodos = methods.map((m): CanonicalMethod => {
    const metodo = m as Record<string, unknown>;
    const params = Array.isArray(metodo.params) ? metodo.params : [];
    return {
      visibilidad: esVisibilidad(metodo.visibility)
        ? metodo.visibility
        : 'public',
      nombre: cadena(metodo.name, 'metodo'),
      ret: cadena(metodo.returnType, 'void'),
      params: params.map((p): CanonicalParam => {
        const param = p as Record<string, unknown>;
        return {
          nombre: cadena(param.name, 'param'),
          tipo: cadena(param.type, 'void'),
        };
      }),
      ...(metodo.isStatic === true && { estatico: true as const }),
      ...(metodo.isAbstract === true && { abstracto: true as const }),
    };
  });

  return {
    id: `n${index}`,
    tipo,
    nombre: cadena(data.name, 'Clase'),
    atributos,
    metodos,
    ...(tipo === 'enumeration' &&
      literals.length > 0 && {
        literales: literals.map((l) => cadena(l, '')),
      }),
  };
}

/** Reduce una arista de React Flow a su relacion canonica. */
function proyectarRelacion(
  edge: NonNullable<SnapshotEntrada['edges']>[number],
  index: number,
  realACanonico: Map<string, string>,
): CanonicalRelation {
  const tipo =
    typeof edge.type === 'string' &&
    TIPOS_RELACION.includes(edge.type as TipoRelacion)
      ? (edge.type as TipoRelacion)
      : 'association';

  const data = edge as Record<string, unknown>;

  // Los extremos se canonizan (n1, n2...): el modelo trabaja con ids
  // canonicos y el filtro de seleccion los compara contra el id canonico.
  // Antes se dejaban los ids reales y el filtro nunca coincidia.
  const origen =
    typeof edge.source === 'string'
      ? (realACanonico.get(edge.source) ?? '')
      : '';
  const destino =
    typeof edge.target === 'string'
      ? (realACanonico.get(edge.target) ?? '')
      : '';

  return {
    id: `e${index}`,
    tipo,
    origen,
    destino,
    ...(cadena(edge.label, '') !== '' && { label: cadena(edge.label, '') }),
    ...(cadena(data.sourceMultiplicity, '') !== '' && {
      multiplicidadOrigen: cadena(data.sourceMultiplicity, ''),
    }),
    ...(cadena(data.targetMultiplicity, '') !== '' && {
      multiplicidadDestino: cadena(data.targetMultiplicity, ''),
    }),
  };
}

/** Normaliza un valor desconocido a string (nunca undefined). */
function cadena(valor: unknown, fallback: string): string {
  if (typeof valor === 'string' && valor.trim() !== '') return valor;
  return fallback;
}

function esVisibilidad(valor: unknown): valor is Visibilidad {
  return (
    typeof valor === 'string' && VISIBILIDADES.includes(valor as Visibilidad)
  );
}

/**
 * Proyecta el snapshot del frontend al DSL canonico.
 * @param snapshot - reactFlowState enviado por el cliente
 * @returns Proyeccion con el diagrama canonico, el idMap y el stateHash
 */
export function projectState(
  snapshot: SnapshotEntrada | undefined,
): Projection {
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  const edges = Array.isArray(snapshot?.edges) ? snapshot.edges : [];

  // Solo se proyectan nodos con tipo valido; ignoramos nodos invalidos
  const nodosValidos = nodes.filter(
    (n) => typeof n?.type !== 'object' || n?.type === undefined,
  );

  const entidades = nodosValidos
    .map((node, index) => proyectarEntidad(node, index + 1))
    .filter((e) => e.nombre !== '' && TIPOS_ENTIDAD.includes(e.tipo));

  // Mapa id real -> canonico para resolver los extremos de las aristas.
  // El indice coincide con el de las entidades (posicion en nodosValidos).
  const realACanonico = new Map<string, string>();
  nodosValidos.forEach((node, index) => {
    if (typeof node.id === 'string') realACanonico.set(node.id, `n${index + 1}`);
  });

  // Solo se proyectan aristas con origen/destino y tipo conocido
  const relaciones = edges
    .map((edge, index) => proyectarRelacion(edge, index + 1, realACanonico))
    .filter(
      (r) =>
        r.origen !== '' && r.destino !== '' && TIPOS_RELACION.includes(r.tipo),
    );

  const resultado: CanonicalDiagram = { entidades, relaciones };

  // idMap: id canonico -> id real (React Flow).
  // Se recorre el MISMO conjunto filtrado que genero las entidades para que
  // n<index> y e<index> coincidan con la posicion en `resultado`.
  const idMap = new Map<string, string>();
  let nSync = 0;
  for (const node of nodosValidos) {
    nSync += 1;
    if (typeof node.id === 'string') idMap.set(`n${nSync}`, node.id);
  }
  let eSync = 0;
  for (const edge of edges) {
    eSync += 1;
    if (typeof edge.id === 'string') idMap.set(`e${eSync}`, edge.id);
  }

  // Hash del contenido para detectar estado sin cambios y cachear respuestas
  const stateHash = createHash('sha256')
    .update(JSON.stringify(resultado))
    .digest('hex');

  return { resultado, idMap, stateHash };
}
