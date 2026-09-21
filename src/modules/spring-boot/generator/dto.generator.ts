/**
 * Generador de DTOs por tabla.
 * Dos archivos por tabla: <Nombre>Request.java (entrada) y
 * <Nombre>Response.java (salida). Las FK viajan como ids en el Request.
 * Accessors clasicos (sin Lombok) para compilar en cualquier IDE.
 */
import type {
  CanonicalEntity,
  CanonicalRelation,
} from '../../ai/dsl/canonical';
import {
  EnumNames,
  capitalizar,
  esNombreId,
  importsForTypes,
  toCamelCase,
  toJavaType,
} from './java-types';

/**
 * Imports que requiere el DTO segun sus campos: java.time / java.math
 * (por tipo) y enumeraciones del diagrama (viven en otra carpeta/modulo).
 * @param campos - Pares tipo/nombre del DTO
 * @param enums - Enumeraciones del diagrama (para detectar tipos enum)
 * @param paquete - Paquete del modulo (ej. com.ejemplo.tienda.producto)
 * @returns Lineas de import (sin duplicados, ordenadas)
 */
function importsDto(
  campos: Array<{ tipo: string; nombre: string }>,
  enums: EnumNames,
  paquete: string,
): string[] {
  const lines = new Set<string>();
  for (const linea of importsForTypes(campos.map((c) => c.tipo))) {
    lines.add(linea);
  }
  // El paquete base es el paquete del modulo sin la ultima carpeta
  const base = paquete.slice(0, paquete.lastIndexOf('.'));
  for (const c of campos) {
    if (enums.has(c.tipo)) {
      lines.add(
        `import ${base}.${c.tipo.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}.${c.tipo};`,
      );
    }
  }
  return Array.from(lines).sort();
}

/**
 * Genera los accessors clasicos de una lista de campos.
 * @param campos - Pares tipo/nombre
 * @returns Bloque de getters y setters
 */
function accessors(campos: Array<{ tipo: string; nombre: string }>): string {
  return campos
    .map(
      (c) => `    public ${c.tipo} get${capitalizar(c.nombre)}() {
        return ${c.nombre};
    }

    public void set${capitalizar(c.nombre)}(${c.tipo} ${c.nombre}) {
        this.${c.nombre} = ${c.nombre};
    }`,
    )
    .join('\n\n');
}

/**
 * Genera el DTO de entrada (lo que recibe POST/PUT).
 * @param entidad - Entidad canonica
 * @param relaciones - Relaciones que tocan a la entidad
 * @param byId - Mapa canonico para resolver nombres de entidades relacionadas
 * @param enums - Enumeraciones del diagrama
 * @param paquete - Paquete del modulo (ej. com.ejemplo.tienda.producto)
 * @returns Codigo Java del Request
 */
export function generateRequest(
  entidad: CanonicalEntity,
  relaciones: CanonicalRelation[],
  byId: Map<string, CanonicalEntity>,
  enums: EnumNames,
  paquete: string,
): string {
  const nombre = entidad.nombre;
  const campos: Array<{ tipo: string; nombre: string }> = [];
  // El atributo `id` del diagrama es la PK auto-generada: no va en el body
  // del POST/PUT (la BD lo genera), asi el Request nunca lo duplica.
  for (const attr of entidad.atributos.filter(
    (a) => !a.estatico && !esNombreId(a.nombre),
  )) {
    campos.push({ tipo: toJavaType(attr.tipo, enums), nombre: attr.nombre });
  }
  // Las relaciones ManyToOne/OneToOne entran como <campo>Id
  for (const rel of relaciones) {
    if (
      rel.tipo === 'inheritance' ||
      rel.tipo === 'implementation' ||
      rel.tipo === 'dependency'
    )
      continue;
    const esOrigen = rel.origen === entidad.id;
    const otro = byId.get(esOrigen ? rel.destino : rel.origen);
    if (!otro || otro.tipo === 'interface' || otro.tipo === 'enumeration')
      continue;
    // Solo el lado que lleva @JoinColumn recibe el id: el lado "muchos",
    // el 1-1 o la hija de composicion
    const miMult = esOrigen
      ? rel.multiplicidadOrigen
      : rel.multiplicidadDestino;
    const otraMult = esOrigen
      ? rel.multiplicidadDestino
      : rel.multiplicidadOrigen;
    const yoMuchos = !!miMult?.includes('*');
    const otroMuchos = !!otraMult?.includes('*');
    // Composicion fuerte: solo la parte (destino) lleva la FK, el todo no
    // (en la entidad el todo genera @OneToMany(cascade) y la parte @ManyToOne).
    const esComposicionHija = rel.tipo === 'composition' && !esOrigen;
    if (rel.tipo === 'composition' && esOrigen) continue;
    if (
      (yoMuchos && !otroMuchos) ||
      (!yoMuchos && !otroMuchos) ||
      esComposicionHija
    ) {
      campos.push({ tipo: 'Long', nombre: `${toCamelCase(otro.nombre)}Id` });
    }
  }
  const declaracion = campos
    .map((c) => `    private ${c.tipo} ${c.nombre};`)
    .join('\n');
  const bloqueImports = importsDto(campos, enums, paquete);
  return `package ${paquete};
${bloqueImports.length > 0 ? `\n${bloqueImports.join('\n')}` : ''}

// DTO de entrada de ${nombre}: lo que recibe POST / PUT (sin id)
public class ${nombre}Request {
${declaracion === '' ? '    // Sin campos de entrada' : declaracion}

${campos.length > 0 ? accessors(campos) : ''}
}
`;
}

/**
 * Genera el DTO de salida (lo que devuelve GET).
 * @param entidad - Entidad canonica
 * @param enums - Enumeraciones del diagrama
 * @param paquete - Paquete del modulo
 * @returns Codigo Java del Response
 */
export function generateResponse(
  entidad: CanonicalEntity,
  enums: EnumNames,
  paquete: string,
): string {
  const nombre = entidad.nombre;
  const campos: Array<{ tipo: string; nombre: string }> = [
    { tipo: 'Long', nombre: 'id' },
  ];
  // El atributo `id` del diagrama se absorbe en el campo PK de arriba:
  // solo debe verse UN unico id en el Response.
  for (const attr of entidad.atributos.filter(
    (a) => !a.estatico && !esNombreId(a.nombre),
  )) {
    campos.push({ tipo: toJavaType(attr.tipo, enums), nombre: attr.nombre });
  }
  const declaracion = campos
    .map((c) => `    private ${c.tipo} ${c.nombre};`)
    .join('\n');
  const bloqueImports = importsDto(campos, enums, paquete);
  return `package ${paquete};
${bloqueImports.length > 0 ? `\n${bloqueImports.join('\n')}` : ''}

// DTO de salida de ${nombre}: lo que devuelve GET (con id)
public class ${nombre}Response {
${declaracion}

${accessors(campos)}
}
`;
}
