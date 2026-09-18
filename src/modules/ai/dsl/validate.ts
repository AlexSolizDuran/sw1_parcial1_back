/**
 * Validacion de la salida del modelo de IA.
 * Garantiza que el JSON devuelto cumpla el contrato del DSL canonico antes
 * de calcular el diff. Si falla, se permite un reintento con la pista del error.
 */
import { BadRequestException } from '@nestjs/common';
import type {
  CanonicalDiagram,
  CanonicalEntity,
  CanonicalField,
  CanonicalMethod,
  CanonicalParam,
  CanonicalRelation,
  EntidadTipo,
  ModelOutput,
  ModelOutputTipo,
  TipoRelacion,
  Visibilidad,
} from './canonical';

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

/** Error con el detalle que se usa como pista para el reintento. */
export class AiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiValidationError';
  }
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function esCadenaNoVacia(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim() !== '';
}

function esCampo(valor: unknown): valor is CanonicalField {
  if (!esObjeto(valor)) return false;
  if (!esCadenaNoVacia(valor.nombre)) return false;
  if (!esCadenaNoVacia(valor.tipo)) return false;
  if (!VISIBILIDADES.includes(valor.visibilidad as Visibilidad)) return false;
  return true;
}

function esParam(valor: unknown): valor is CanonicalParam {
  if (!esObjeto(valor)) return false;
  return esCadenaNoVacia(valor.nombre) && esCadenaNoVacia(valor.tipo);
}

function esMetodo(valor: unknown): valor is CanonicalMethod {
  if (!esObjeto(valor)) return false;
  if (!esCadenaNoVacia(valor.nombre)) return false;
  if (!VISIBILIDADES.includes(valor.visibilidad as Visibilidad)) return false;
  if (!Array.isArray(valor.params)) return false;
  if (!valor.params.every(esParam)) return false;
  if (!esCadenaNoVacia(valor.ret)) return false;
  return true;
}

function esEntidad(valor: unknown): valor is CanonicalEntity {
  if (!esObjeto(valor)) return false;
  if (!esCadenaNoVacia(valor.id)) return false;
  if (!TIPOS_ENTIDAD.includes(valor.tipo as EntidadTipo)) return false;
  if (!esCadenaNoVacia(valor.nombre)) return false;
  if (!Array.isArray(valor.atributos) || !valor.atributos.every(esCampo)) {
    return false;
  }
  if (!Array.isArray(valor.metodos) || !valor.metodos.every(esMetodo)) {
    return false;
  }
  return true;
}

/** true si el valor es string (permite vacio). */
function esCadena(valor: unknown): valor is string {
  return typeof valor === 'string';
}

function esRelacion(valor: unknown): valor is CanonicalRelation {
  if (!esObjeto(valor)) return false;
  if (!esCadenaNoVacia(valor.id)) return false;
  if (!TIPOS_RELACION.includes(valor.tipo as TipoRelacion)) return false;
  if (!esCadenaNoVacia(valor.origen)) return false;
  if (!esCadenaNoVacia(valor.destino)) return false;
  // Campos opcionales: si vienen, deben ser strings (label y multiplicidades)
  if (valor.label !== undefined && !esCadena(valor.label)) return false;
  if (
    valor.multiplicidadOrigen !== undefined &&
    !esCadena(valor.multiplicidadOrigen)
  ) {
    return false;
  }
  if (
    valor.multiplicidadDestino !== undefined &&
    !esCadena(valor.multiplicidadDestino)
  ) {
    return false;
  }
  // Señal interna de eliminación en modo foco: si viene, debe ser booleano
  if (valor.eliminar !== undefined && typeof valor.eliminar !== 'boolean') {
    return false;
  }
  return true;
}

/**
 * Valida que el objeto parseado cumpla el contrato ModelOutput.
 * @param valor - JSON ya parseado de la salida del modelo
 * @returns El ModelOutput tipado
 * @throws AiValidationError con el detalle del primer error encontrado
 */
export function validateModelOutput(valor: unknown): ModelOutput {
  if (!esObjeto(valor)) {
    throw new AiValidationError(
      'El resultado debe ser un objeto JSON con "mensaje", "entidades" y "relaciones".',
    );
  }
  if (!esCadenaNoVacia(valor.mensaje)) {
    throw new AiValidationError(
      'Falta el campo obligatorio "mensaje" (string).',
    );
  }

  // Determinar el tipo de respuesta (default: 'diagrama' para backward compat)
  const tipo = (valor.tipo as ModelOutputTipo) ?? 'diagrama';

  if (tipo === 'chat') {
    // Modo chat: solo requiere mensaje, entidades y relaciones son opcionales
    return {
      tipo: 'chat',
      mensaje: valor.mensaje,
    };
  }

  // Modo diagrama: requerir entidades y relaciones (validación existente)
  if (!Array.isArray(valor.entidades)) {
    throw new AiValidationError(
      'Falta el campo obligatorio "entidades" (array).',
    );
  }
  if (!Array.isArray(valor.relaciones)) {
    throw new AiValidationError(
      'Falta el campo obligatorio "relaciones" (array).',
    );
  }

  const entidades = valor.entidades as unknown[];
  const relaciones = valor.relaciones as unknown[];

  const indexEntidadInvalida = entidades.findIndex((e) => !esEntidad(e));
  if (indexEntidadInvalida !== -1) {
    throw new AiValidationError(
      `La entidad en la posicion ${indexEntidadInvalida} es invalida. Cada entidad debe tener ` +
        'id, tipo (class|interface|abstract|enumeration), nombre, atributos[] y metodos[].',
    );
  }

  const indexRelacionInvalida = relaciones.findIndex((r) => !esRelacion(r));
  if (indexRelacionInvalida !== -1) {
    throw new AiValidationError(
      `La relacion en la posicion ${indexRelacionInvalida} es invalida. Cada relacion debe tener ` +
        'id, tipo, origen y destino apuntando a ids existentes de entidades.',
    );
  }

  // Los ids deben ser unicos dentro de cada coleccion
  const idsEntidades = entidades.map((e) => (e as CanonicalEntity).id);
  if (new Set(idsEntidades).size !== idsEntidades.length) {
    throw new AiValidationError('Los ids de "entidades" no pueden repetirse.');
  }
  const idsRelaciones = relaciones.map((r) => (r as CanonicalRelation).id);
  if (new Set(idsRelaciones).size !== idsRelaciones.length) {
    throw new AiValidationError('Los ids de "relaciones" no pueden repetirse.');
  }

  return {
    tipo: 'diagrama',
    mensaje: valor.mensaje,
    entidades: entidades as CanonicalEntity[],
    relaciones: relaciones as CanonicalRelation[],
  };
}

/**
 * Convierte un error de validacion en una excepcion HTTP 400.
 * @param error - Error interno (AiValidationError u otro)
 * @param intento - Numero de intento fallido (1 o 2)
 * @throws BadRequestException siempre
 */
export function toHttpError(error: unknown, intento: number): never {
  const detalle =
    error instanceof AiValidationError
      ? error.message
      : 'El modelo devolvio una salida inesperada.';
  throw new BadRequestException(
    `La IA no genero un resultado valido (intento ${intento}): ${detalle}`,
  );
}

/**
 * Valida el diagrama canonico crudo devuelto por el microservicio vision->DSL.
 * A diferencia de ModelOutput (chat), el microservicio devuelve SOLO
 * { entidades, relaciones } sin la clave "mensaje". Reutiliza los mismos
 * validadores internos (esEntidad/esRelacion) y garantiza ids unicos.
 * @param valor - JSON ya parseado de la salida del microservicio
 * @returns El CanonicalDiagram tipado
 * @throws AiValidationError con el detalle del primer error encontrado
 */
export function validarDiagramoOutput(valor: unknown): CanonicalDiagram {
  if (!esObjeto(valor)) {
    throw new AiValidationError(
      'El resultado debe ser un objeto JSON con "entidades" y "relaciones".',
    );
  }
  if (!Array.isArray(valor.entidades)) {
    throw new AiValidationError(
      'Falta el campo obligatorio "entidades" (array).',
    );
  }
  if (valor.relaciones !== undefined && !Array.isArray(valor.relaciones)) {
    throw new AiValidationError('El campo "relaciones" debe ser un array.');
  }

  const entidades = valor.entidades as unknown[];
  const relaciones = (valor.relaciones ?? []) as unknown[];

  if (!entidades.every((e) => esEntidad(e))) {
    throw new AiValidationError(
      'Una o mas entidades no cumplen el contrato del DSL ' +
        '(id, tipo class|interface|abstract|enumeration, nombre, atributos[], metodos[]).',
    );
  }
  if (!relaciones.every((r) => esRelacion(r))) {
    throw new AiValidationError(
      'Una o mas relaciones no cumplen el contrato del DSL ' +
        '(id, tipo, origen y destino con ids existentes).',
    );
  }

  const idsEntidades = entidades.map((e) => e.id);
  if (new Set(idsEntidades).size !== idsEntidades.length) {
    throw new AiValidationError('Los ids de "entidades" no pueden repetirse.');
  }
  const idsRelaciones = relaciones.map((r) => r.id);
  if (new Set(idsRelaciones).size !== idsRelaciones.length) {
    throw new AiValidationError('Los ids de "relaciones" no pueden repetirse.');
  }

  return {
    entidades: entidades,
    relaciones: relaciones,
  };
}
