/**
 * Mapa de tipos UML (del diagrama) a tipos Java (Spring Boot).
 * Los tipos desconocidos caen a String para no romper la compilacion.
 */

/** Nombres de enumeraciones del diagrama (para detectar @Enumerated). */
export type EnumNames = Set<string>;

/**
 * Convierte un tipo UML a su equivalente Java.
 * @param umlType - Tipo escrito en el atributo (ej. int, String, LocalDate)
 * @param enums - Nombres de enumeraciones del diagrama
 * @returns Tipo Java correspondiente
 */
export function toJavaType(umlType: string, enums: EnumNames): string {
  const t = umlType.trim();
  // Si el tipo es una enumeracion del diagrama, se usa tal cual (el enum generado)
  for (const e of enums) {
    if (e.toLowerCase() === t.toLowerCase()) return e;
  }
  switch (t.toLowerCase()) {
    case 'int':
    case 'integer':
      return 'Integer';
    case 'long':
      return 'Long';
    case 'double':
    case 'float':
      return 'Double';
    case 'boolean':
    case 'bool':
      return 'Boolean';
    case 'string':
      return 'String';
    case 'date':
    case 'localdate':
      return 'LocalDate';
    case 'datetime':
    case 'localdatetime':
      return 'LocalDateTime';
    case 'bigdecimal':
    case 'decimal':
    case 'money':
      return 'BigDecimal';
    default:
      return 'String';
  }
}

/**
 * Imports java.time / java.math necesarios segun los tipos usados.
 * @param javaTypes - Tipos Java ya resueltos de la entidad
 * @returns Lineas de import (sin duplicados)
 */
export function importsForTypes(javaTypes: string[]): string[] {
  const imports: string[] = [];
  if (javaTypes.includes('LocalDate'))
    imports.push('import java.time.LocalDate;');
  if (javaTypes.includes('LocalDateTime'))
    imports.push('import java.time.LocalDateTime;');
  if (javaTypes.includes('BigDecimal'))
    imports.push('import java.math.BigDecimal;');
  return imports;
}

/** Convierte "nombre" en "Nombre" (para getters/setters y nombres de clase). */
export function capitalizar(texto: string): string {
  if (texto.length === 0) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Convierte "DetalleVenta" en "detalleVenta" (nombre de campo). */
export function toCamelCase(name: string): string {
  if (name.length === 0) return name;
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** Convierte "DetalleVenta" en "detalle-venta" (segmento de URL). */
export function toKebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

/** Convierte "DetalleVenta" en "detalleventa" (nombre de carpeta/paquete). */
export function toFolderName(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

/** Convierte "DetalleVenta" en "detalleventas" (nombre de tabla). */
export function toTableName(name: string): string {
  return `${toFolderName(name)}s`;
}

/** Plural simple para paths REST (categoria -> categorias). */
export function toPluralPath(name: string): string {
  const kebab = toKebabCase(name);
  if (kebab.endsWith('s')) return kebab;
  if (kebab.endsWith('n')) return `${kebab}es`;
  return `${kebab}s`;
}

/** Indica si una multiplicidad UML representa "muchos". */
export function isMany(multiplicidad: string | undefined): boolean {
  if (!multiplicidad || multiplicidad.trim() === '') return false;
  const m = multiplicidad.trim();
  return m.includes('*');
}
