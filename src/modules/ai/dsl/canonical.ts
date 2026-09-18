/**
 * DSL canonico del diagrama de clases UML.
 *
 * Es la proyeccion legible que recibe y devuelve el modelo de IA (black box).
 * Las claves estan en espanol (la instruccion del usuario tambien va en espanol)
 * pero los *valores* de los enumerados son en ingles (class, private, inheritance...)
 * porque son los tokens con los que el modelo fue entrenado.
 *
 * El modelo recibe el diagrama COMPLETO y devuelve el diagrama COMPLETO editado,
 * nunca diferencias. El backend calcula el diff en dsl/diff.ts.
 */

/** Tipos de entidad UML que soporta el editor. */
export type EntidadTipo = 'class' | 'interface' | 'abstract' | 'enumeration';

/** Tipos de relacion UML (igual que UMLEdgeType del frontend). */
export type TipoRelacion =
  | 'inheritance'
  | 'implementation'
  | 'association'
  | 'aggregation'
  | 'composition'
  | 'dependency';

/** Visibilidad de un atributo o metodo. */
export type Visibilidad = 'public' | 'private' | 'protected' | 'package';

/** Atributo dentro del DSL canonico. Los flags solo se emiten si son true. */
export interface CanonicalField {
  visibilidad: Visibilidad;
  nombre: string;
  tipo: string;
  estatico?: true;
  readonly?: true;
  /** Valor por defecto (se omite si esta vacio). */
  valor?: string;
}

/** Parametro de un metodo. */
export interface CanonicalParam {
  nombre: string;
  tipo: string;
}

/** Metodo dentro del DSL canonico. */
export interface CanonicalMethod {
  visibilidad: Visibilidad;
  nombre: string;
  params: CanonicalParam[];
  /** Tipo de retorno (default "void"). */
  ret: string;
  estatico?: true;
  abstracto?: true;
}

/** Entidad canonica (clase, interfaz, clase abstracta o enumeracion). */
export interface CanonicalEntity {
  /** Id canonico: "n1", "n2" para existentes; "n11", "n12" para nuevas. */
  id: string;
  tipo: EntidadTipo;
  nombre: string;
  atributos: CanonicalField[];
  metodos: CanonicalMethod[];
  /** Literales, solo para enumeraciones (se omiten si no hay). */
  literales?: string[];
}

/** Relacion canonica entre dos entidades. */
export interface CanonicalRelation {
  /** Id canonico: "e1", "e2" para existentes; "e21" para nuevas. */
  id: string;
  tipo: TipoRelacion;
  /** Id canonico de la entidad origen. */
  origen: string;
  /** Id canonico de la entidad destino. */
  destino: string;
  /** Label opcional de la relacion. */
  label?: string;
  multiplicidadOrigen?: string;
  multiplicidadDestino?: string;
  /**
   * Señal interna de eliminacion en modo foco: si el modelo devuelve la
   * relacion con "eliminar": true se filtra en la reconstruccion y el diff
   * genera un deleteRelacion. Nunca llega a las acciones ni al lienzo.
   */
  eliminar?: boolean;
}

/** Diagrama completo tal como se envia al modelo. */
export interface CanonicalDiagram {
  entidades: CanonicalEntity[];
  relaciones: CanonicalRelation[];
}

/** Tipos de respuesta del modelo. */
export type ModelOutputTipo = 'diagrama' | 'chat';

/** Salida completa esperada del modelo: explicacion + diagrama nuevo. */
export interface ModelOutput {
  /** Tipo de respuesta: 'diagrama' para cambios en el diagrama, 'chat' para conversacion. Default: 'diagrama'. */
  tipo?: ModelOutputTipo;
  /** Explicacion breve en espanol de lo que cambio (va al chat). */
  mensaje: string;
  /** Entidades y relaciones: requerido solo si tipo es "diagrama". */
  entidades?: CanonicalEntity[];
  relaciones?: CanonicalRelation[];
}

/**
 * Acciones elementales que expresa el diff entre el diagrama actual y el
 * devuelto por el modelo. Son el contrato con el frontend para la vista
 * previa y la aplicacion de cambios.
 */
export type DiagramAction =
  | {
      tipo: 'createEntidad';
      /** Descripcion legible de la accion (para el resumen del chat). */
      descripcion: string;
      /** Entidad a crear (id canonico inventado; el frontend genera el real). */
      entidad: CanonicalEntity;
    }
  | {
      tipo: 'updateEntidad';
      descripcion: string;
      /** Id real del store de la entidad a modificar. */
      id: string;
      /** Nuevo estado completo de la entidad (el frontend regenera ids internos). */
      entidad: CanonicalEntity;
    }
  | { tipo: 'deleteEntidad'; descripcion: string; id: string }
  | {
      tipo: 'createRelacion';
      descripcion: string;
      /** Origen/destino en ids reales (existentes) o canonicos (nuevas entidades). */
      relacion: CanonicalRelation;
    }
  | {
      tipo: 'updateRelacion';
      descripcion: string;
      /** Id real del store de la relacion a modificar. */
      id: string;
      relacion: CanonicalRelation;
    }
  | { tipo: 'deleteRelacion'; descripcion: string; id: string };

/** Indica si una accion es de creacion (no requiere id real). */
export function isCreationAction(
  accion: DiagramAction,
): accion is Extract<
  DiagramAction,
  { tipo: 'createEntidad' | 'createRelacion' }
> {
  return accion.tipo === 'createEntidad' || accion.tipo === 'createRelacion';
}

/**
 * Proyeccion del estado actual del lienzo.
 * Conserva el mapeo id canonico <-> id real que usa resolve.ts.
 */
export interface Projection {
  /** Diagrama canonico completo (sin ids reales, sin posiciones). */
  resultado: CanonicalDiagram;
  /** Mapeo id canonico -> id real del store (entidades y relaciones). */
  idMap: Map<string, string>;
  /** Hash del contenido canonico (para la cache de respuestas). */
  stateHash: string;
}
