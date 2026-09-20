/**
 * Deriva las "screens" (config CRUD) directamente desde el diagrama UML
 * canonico (entidades + relaciones) que proyecta projectState del snapshot.
 *
 * Regla: por cada CLASE o clase abstracta del diagrama se genera una screen
 * de CRUD; los atributos se convierten en campos tipados y las relaciones
 * accesibles se convierten en FKs (select con `from` hacia otra screen).
 * Los endpoints usan las rutas REST plurales del generador UML (sin /api).
 *
 * Esta derivacion permite que el generador Spring Boot funcione "mediante el
 * diagrama": el frontend solo envia el snapshot, y aqui se construyen las
 * screens que el generador screen-module.generator consume.
 */
import type { CanonicalDiagram, CanonicalEntity } from '../../ai/dsl/canonical';
import {
  toJavaType,
  toPluralPath,
} from '../generator/java-types';
import type {
  ScreenConfig,
  ScreenField,
  ScreenSelectFrom,
} from './screens.types';

/** Mapea un tipo Java (resuelto desde UML) a un tipo de campo de screen. */
function tipoCampo(javaType: string): ScreenField['type'] {
  switch (javaType) {
    case 'Boolean':
      return 'boolean';
    case 'Integer':
    case 'Long':
      return 'integer';
    case 'Double':
    case 'BigDecimal':
      return 'number';
    case 'LocalDate':
      return 'date';
    case 'LocalDateTime':
      return 'datetime';
    case 'String':
    default:
      return 'text';
  }
}

/** Indica si una multiplicidad UML representa "muchos". */
function esMuchos(multiplicidad: string | undefined): boolean {
  return Boolean(
    multiplicidad && multiplicidad.trim() !== '' && multiplicidad.includes('*'),
  );
}

/**
 * Reglas de FK identicas al generador UML (entity.generator):
 * el lado "muchos" lleva la FK, salvo composicion (el hijo la lleva siempre).
 */
function guardaFk(
  soyOrigen: boolean,
  rel: {
    tipo: string;
    multiplicidadOrigen?: string;
    multiplicidadDestino?: string;
  },
): boolean {
  const miMult = soyOrigen ? rel.multiplicidadOrigen : rel.multiplicidadDestino;
  const otraMult = soyOrigen
    ? rel.multiplicidadDestino
    : rel.multiplicidadOrigen;
  const yoSoyMuchos = esMuchos(miMult);
  const otroEsMuchos = esMuchos(otraMult);
  if (rel.tipo === 'composition') return !soyOrigen;
  if (yoSoyMuchos && otroEsMuchos) return false;
  if (yoSoyMuchos && !otroEsMuchos) return true;
  if (!yoSoyMuchos && otroEsMuchos) return false;
  return true; // uno a uno: FK aqui
}

/** Campos derivados de los atributos de una entidad. */
function camposDeAtributos(
  entidad: CanonicalEntity,
  enums: Map<string, string[]>,
): ScreenField[] {
  return entidad.atributos.map((a) => {
    const java = toJavaType(a.tipo, new Set(enums.keys()));
    const literales = enums.get(java);
    const campo: ScreenField = literales
      ? {
          name: a.nombre,
          type: 'select',
          options: literales.map((l) => ({ value: l, label: l })),
        }
      : { name: a.nombre, type: tipoCampo(java) };
    if (a.readonly) campo.readOnly = true;
    if (a.valor) campo.default = a.valor;
    return campo;
  });
}

/** Convierte una entidad clase/abstracta en una ScreenConfig CRUD. */
function screenDesdeEntidad(
  entidad: CanonicalEntity,
  relaciones: CanonicalDiagram['relaciones'],
  entidades: CanonicalEntity[],
  enums: Map<string, string[]>,
): ScreenConfig {
  const id = toPluralPath(entidad.nombre);
  const porId = new Map(entidades.map((e) => [e.id, e]));

  const fks: ScreenField[] = [];
  for (const r of relaciones) {
    if (r.origen !== entidad.id && r.destino !== entidad.id) continue;
    if (r.tipo === 'dependency') continue;
    const soyOrigen = r.origen === entidad.id;
    if (!guardaFk(soyOrigen, r)) continue;
    const otro = porId.get(soyOrigen ? r.destino : r.origen);
    if (!otro || otro.tipo === 'interface' || otro.tipo === 'enumeration')
      continue;
    const otroId = toPluralPath(otro.nombre);
    // Campo visible de la screen referenciada: primer texto o su id
    const texto = otro.atributos.find((a) => {
      const java = toJavaType(a.tipo, new Set(enums.keys()));
      return java === 'String' || enums.has(java);
    });
    const from: ScreenSelectFrom = {
      screen: otroId,
      of: texto ? texto.nombre : 'id',
      idField: 'id',
    };
    const nombre = `${otroId.replace(/-/g, '_')}_id`;
    fks.push({ name: nombre, type: 'select', from });
  }

  const campos = [...camposDeAtributos(entidad, enums), ...fks];
  const searchFields = campos
    .filter((c) => c.type === 'text' || c.type === 'textarea')
    .slice(0, 3)
    .map((c) => c.name);

  return {
    id,
    title: entidad.nombre,
    list: { method: 'GET', path: `/${id}` },
    search: { method: 'GET', path: `/${id}/search?q={q}` },
    create: { method: 'POST', path: `/${id}` },
    update: { method: 'PUT', path: `/${id}/{id}` },
    delete: { method: 'DELETE', path: `/${id}/{id}` },
    searchFields,
    fields: campos,
  } satisfies ScreenConfig;
}

/**
 * Deriva las screens de un diagrama canonico.
 * @param diagrama - Salida de projectState(snapshot)
 * @returns Screens en orden de aparicion (1 por clase o clase abstracta)
 */
export function derivarScreensDeDiagrama(
  diagrama: CanonicalDiagram,
): ScreenConfig[] {
  const enums = new Map<string, string[]>();
  for (const e of diagrama.entidades) {
    if (e.tipo === 'enumeration' && e.literales) {
      enums.set(e.nombre, e.literales);
    }
  }
  return diagrama.entidades
    .filter((e) => e.tipo === 'class' || e.tipo === 'abstract')
    .map((e) =>
      screenDesdeEntidad(e, diagrama.relaciones, diagrama.entidades, enums),
    );
}