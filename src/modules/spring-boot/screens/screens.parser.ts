/**
 * Parser del DSL de screens: valida el JSON que llega del frontend,
 * normaliza las rutas (quita prefijo /api ya que el generador no lo usa)
 * y devuelve la lista de screens tipada. Cualquier campo con forma rara
 * se completa con su default o se reporta con un mensaje claro.
 *
 * No depende de Precision: la validacion es estructural (id, list, fields)
 * para no romper el arranque si el JSON tiene campos opcionales con
 * nombres distintos en el futuro.
 */
import { BadRequestException } from '@nestjs/common';
import type {
  ScreenConfig,
  ScreenEndpoint,
  ScreenField,
} from './screens.types';

/** Resultado del parse: screens validas + mensaje de resumen. */
export interface ParseScreensResult {
  screens: ScreenConfig[];
}

/**
 * Quita un prefijo "/api" inicial y normaliza la ruta a una forma empezada
 * por "/". Ej: "/api/customers" -> "/customers", "customers/" -> "/customers".
 */
export function normalizarPath(path: string): string {
  let p = path.trim();
  if (p.startsWith('/api')) p = p.slice(4);
  if (p.startsWith('/api/')) p = p.slice(4);
  if (!p.startsWith('/')) p = `/${p}`;
  // sin slash final para que "/customers/" sea "/customers"
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/**
 * Valida que una screen sea estructuralmente correcta y aplica defaults.
 * @param raw - Screen cruda como llega del JSON
 * @returns Screen normalizada
 * @throws BadRequestException si falta id, list o fields (o no son validos)
 */
export function parseScreen(raw: Record<string, unknown>): ScreenConfig {
  const { id } = raw;
  if (typeof id !== 'string' || id.trim() === '') {
    throw new BadRequestException(
      'Cada screen debe tener un id (ej. "customers").',
    );
  }
  const listRaw = raw.list as Record<string, unknown> | undefined;
  if (
    !listRaw ||
    typeof listRaw.path !== 'string' ||
    typeof listRaw.method !== 'string'
  ) {
    throw new BadRequestException(
      `La screen "${id}" necesita un endpoint "list" con method y path.`,
    );
  }
  const fieldsRaw = raw.fields as unknown;
  if (!Array.isArray(fieldsRaw)) {
    throw new BadRequestException(
      `La screen "${id}" necesita un arreglo "fields".`,
    );
  }

  const endpoint = (
    e: Record<string, unknown> | undefined,
    nombre: string,
  ): ScreenEndpoint | undefined => {
    if (!e) return undefined;
    if (typeof e.path !== 'string') {
      throw new BadRequestException(
        `La screen "${id}" endpoint "${nombre}" no tiene path.`,
      );
    }
    const method =
      typeof e.method === 'string' ? e.method.toUpperCase() : undefined;
    if (
      method !== 'GET' &&
      method !== 'POST' &&
      method !== 'PUT' &&
      method !== 'DELETE'
    ) {
      throw new BadRequestException(
        `La screen "${id}" endpoint "${nombre}" debe ser GET/POST/PUT/DELETE.`,
      );
    }
    return {
      method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
      path: normalizarPath(e.path),
    };
  };

  const fields = (fieldsRaw as unknown[]).map((f) =>
    parseField(id, f as Record<string, unknown>),
  );

  return {
    id,
    title: typeof raw.title === 'string' ? raw.title : undefined,
    idField: typeof raw.idField === 'string' ? raw.idField : undefined,
    itemsField:
      typeof raw.itemsField === 'string' ? raw.itemsField : undefined,
    queryParams:
      raw.queryParams && typeof raw.queryParams === 'object'
        ? (raw.queryParams as Record<string, string>)
        : undefined,
    searchFields: Array.isArray(raw.searchFields)
      ? (raw.searchFields as string[])
      : undefined,
    list: endpoint(listRaw, 'list')!,
    search: endpoint(raw.search as Record<string, unknown>, 'search'),
    create: endpoint(raw.create as Record<string, unknown>, 'create'),
    update: endpoint(raw.update as Record<string, unknown>, 'update'),
    delete: endpoint(raw.delete as Record<string, unknown>, 'delete'),
    fields,
  };
}

/**
 * Valida un campo crudo y completa defaults.
 * @param screenId - Id de la screen (para mensajes de error)
 * @param raw - Campo crudo
 * @returns Campo normalizado
 * @throws BadRequestException si falta name o type
 */
export function parseField(
  screenId: string,
  raw: Record<string, unknown>,
): ScreenField {
  const { name, type } = raw;
  if (typeof name !== 'string' || name.trim() === '') {
    throw new BadRequestException(
      `La screen "${screenId}" tiene un campo sin nombre.`,
    );
  }
  const tiposValidos = [
    'text',
    'textarea',
    'number',
    'integer',
    'boolean',
    'date',
    'datetime',
    'select',
    'object',
    'array',
  ];
  if (
    typeof type !== 'string' ||
    !tiposValidos.includes(type)
  ) {
    throw new BadRequestException(
      `El campo "${name}" de "${screenId}" tiene tipo invalido "${String(type)}".`,
    );
  }
  const field: ScreenField = {
    name,
    type: type as ScreenField['type'],
    label: typeof raw.label === 'string' ? raw.label : undefined,
    required: typeof raw.required === 'boolean' ? raw.required : undefined,
    readOnly: typeof raw.readOnly === 'boolean' ? raw.readOnly : undefined,
    nullable: typeof raw.nullable === 'boolean' ? raw.nullable : undefined,
    default: raw.default ?? raw.defaultValue,
    maxLength: typeof raw.maxLength === 'number' ? raw.maxLength : undefined,
    pattern: typeof raw.pattern === 'string' ? raw.pattern : undefined,
    min: typeof raw.min === 'number' ? raw.min : undefined,
    max: typeof raw.max === 'number' ? raw.max : undefined,
    options: Array.isArray(raw.options)
      ? (raw.options as ScreenField['options'])
      : undefined,
    from:
      raw.from && typeof raw.from === 'object'
        ? (raw.from as ScreenField['from'])
        : undefined,
    fields:
      type === 'array' && Array.isArray(raw.fields)
        ? (raw.fields as unknown[]).map((f) =>
            parseField(screenId, f as Record<string, unknown>),
          )
        : undefined,
  };
  return field;
}

/**
 * Parsea el arreglo de screens del payload.
 * @param raw - Valor crudo de `screens` (array o undefined)
 * @returns Screens tipadas y normalizadas
 * @throws BadRequestException si no es un arreglo o alguna screen es invalida
 */
export function parseScreens(raw: unknown): ParseScreensResult {
  if (raw === undefined || raw === null) return { screens: [] };
  if (!Array.isArray(raw)) {
    throw new BadRequestException('"screens" debe ser un arreglo.');
  }
  return {
    screens: raw.map((s) => parseScreen(s as Record<string, unknown>)),
  };
}