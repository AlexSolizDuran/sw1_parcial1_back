/**
 * Tipos del DSL de "screens" (config CRUD por pantalla).
 * Espejan el JSON que el frontend envia junto al snapshot: cada screen
 * define una tabla con sus campos, validaciones y las rutas exactas de
 * sus endpoints (list/search/create/update/delete).
 *
 * Este DSL es la fuente de la que el generador Spring Boot emite un modulo
 * CRUD completo por pantalla, sin depender del diagrama UML.
 */

/** Tipos de campo soportados por el DSL de screens. */
export type ScreenFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'select'
  | 'object'
  | 'array';

/** Select con opciones fijas (value + label para mostrar). */
export interface ScreenSelectOption {
  value: string;
  label?: string;
}

/** Select que es FK hacia otra screen (guarda su idField, muestra `of`). */
export interface ScreenSelectFrom {
  /** Id de la screen referenciada (ej. "categories"). */
  screen: string;
  /** Campo de la screen referenciada que se muestra (ej. "name"). */
  of: string;
  /** Campo id de la screen referenciada (default "id") que guarda la screen. */
  idField?: string;
}

/** Campo de una screen (columna de la tabla). */
export interface ScreenField {
  /** Nombre de la columna/campo (ej. "name", "category_id"). */
  name: string;
  /** Etiqueta visible (default: nombre humanizado). */
  label?: string;
  /** Tipo de campo (text, number, select, array...). */
  type: ScreenFieldType;
  /** El campo no puede ser nulo en el formulario. */
  required?: boolean;
  /** No editable en el formulario (created_at, total). */
  readOnly?: boolean;
  /** Permite null en la base de datos. */
  nullable?: boolean;
  /** Valor por defecto. */
  default?: unknown;
  /** Longitud maxima (text/textarea). */
  maxLength?: number;
  /** Regex de validacion (text). */
  pattern?: string;
  /** Rango minimo (number/integer). */
  min?: number;
  /** Rango maximo (number/integer). */
  max?: number;
  /** Solo para type=select: opciones fijas o FK hacia otra screen. */
  options?: ScreenSelectOption[];
  /** Solo para type=select: FK hacia otra screen. */
  from?: ScreenSelectFrom;
  /** Solo para type=array: campos del elemento de la lista. */
  fields?: ScreenField[];
}

/** Endpoint de una screen (metodo + ruta exacta). */
export interface ScreenEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
}

/** Una pantalla CRUD de la aplicacion. */
export interface ScreenConfig {
  /** Id de la screen: base para el nombre de clase Java (ej. customers). */
  id: string;
  /** Titulo visible (opcional). */
  title?: string;
  /** Nombre del campo que es el id (default "id"). */
  idField?: string;
  /** Si el listado devuelve {content:[...],...} en vez de array puro. */
  itemsField?: string;
  /** Parametros estaticos del listado (ej. {"sort":"-created_at"}). */
  queryParams?: Record<string, string>;
  /** Campos por los que busca el endpoint search (default: todos text). */
  searchFields?: string[];
  /** Endpoint de listado (GET). */
  list: ScreenEndpoint;
  /** Endpoint de busqueda opcional (GET, con {q}). */
  search?: ScreenEndpoint;
  /** Endpoint de creacion opcional (POST). */
  create?: ScreenEndpoint;
  /** Endpoint de actualizacion opcional (PUT). */
  update?: ScreenEndpoint;
  /** Endpoint de eliminacion opcional (DELETE). */
  delete?: ScreenEndpoint;
  /** Definicion de columnas/formulario. */
  fields: ScreenField[];
}