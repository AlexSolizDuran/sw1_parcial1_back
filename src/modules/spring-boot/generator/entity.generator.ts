/**
 * Generador de @Entity JPA por cada clase UML.
 * Convencion: 1 carpeta por tabla, archivos planos con prefijo
 * (producto/Producto.java). Sin subcarpetas internas.
 * Accessors clasicos (get/set escritos, sin Lombok) para que el proyecto
 * compile sin plugins extra en el IDE.
 * Supuesto documentado: en composicion/agregacion/asociacion el ORIGEN
 * de la arista es el "todo"/dueno y el DESTINO la "parte".
 */
import type {
  CanonicalEntity,
  CanonicalRelation,
} from '../../ai/dsl/canonical';
import {
  EnumNames,
  capitalizar,
  importsForTypes,
  isMany,
  toCamelCase,
  toJavaType,
  toTableName,
} from './java-types';

/** Contexto de generacion de una entidad. */
export interface EntityContext {
  /** Paquete base (ej. com.ejemplo.tienda). */
  packageBase: string;
  /** Carpeta de la tabla (ej. producto). */
  folder: string;
  /** Todas las entidades indexadas por id canonico (para resolver relaciones). */
  byId: Map<string, CanonicalEntity>;
  /** Nombres de enumeraciones del diagrama. */
  enums: EnumNames;
}

/** Campo con su tipo Java (para declarar + accessors). */
interface Campo {
  tipo: string;
  nombre: string;
}

/**
 * Genera el contenido de <Nombre>.java (@Entity).
 * @param entidad - Entidad canonica a generar
 * @param relaciones - Relaciones que tocan a la entidad
 * @param ctx - Contexto con packageBase, carpeta y mapa de entidades
 * @returns Codigo Java completo de la entidad
 */
export function generateEntity(
  entidad: CanonicalEntity,
  relaciones: CanonicalRelation[],
  ctx: EntityContext,
): string {
  const nombre = entidad.nombre;
  const paquete = `${ctx.packageBase}.${ctx.folder}`;

  // Herencia: si esta entidad es ORIGEN de inheritance, el destino es el padre
  const padre = relaciones.find(
    (r) => r.tipo === 'inheritance' && r.origen === entidad.id,
  );
  const padreNombre = padre ? ctx.byId.get(padre.destino)?.nombre : undefined;

  // Interfaces: si es ORIGEN de implementation, implementa esas interfaces.
  // Se guardan las entidades (no solo nombres) para generar los stubs.
  const interfacesEntidades = relaciones
    .filter((r) => r.tipo === 'implementation' && r.origen === entidad.id)
    .map((r) => ctx.byId.get(r.destino))
    .filter((e): e is CanonicalEntity => !!e && e.tipo === 'interface');
  const interfaces = interfacesEntidades.map((e) => e.nombre);

  // Atributos propios (se omiten static: no se persisten)
  const camposPropios = entidad.atributos.filter((a) => !a.estatico);
  const tiposJava = camposPropios.map((a) => toJavaType(a.tipo, ctx.enums));

  // Todos los campos para los accessors (id + propios + relaciones)
  const todos: Campo[] = [{ tipo: 'Long', nombre: 'id' }];
  const lineasDeclaracion: string[] = [
    '    @Id',
    '    @GeneratedValue(strategy = GenerationType.IDENTITY)',
    '    private Long id;',
    '',
  ];
  for (const attr of camposPropios) {
    const javaType = toJavaType(attr.tipo, ctx.enums);
    todos.push({ tipo: javaType, nombre: attr.nombre });
    // Si el tipo es un enum del diagrama, se persiste como STRING
    if (ctx.enums.has(javaType)) {
      lineasDeclaracion.push('    @Enumerated(EnumType.STRING)');
    }
    lineasDeclaracion.push(`    private ${javaType} ${attr.nombre};`);
  }

  // Campos de relacion (JPA) + imports cruzados entre carpetas
  const importsCruzados = new Set<string>();
  let usaList = false;

  for (const rel of relaciones) {
    if (
      rel.tipo === 'inheritance' ||
      rel.tipo === 'implementation' ||
      rel.tipo === 'dependency'
    ) {
      continue; // no generan columnas, solo extends/implements (o nada)
    }
    const esOrigen = rel.origen === entidad.id;
    const otroId = esOrigen ? rel.destino : rel.origen;
    const otro = ctx.byId.get(otroId);
    // Solo se generan relaciones entre entidades persistibles
    if (!otro || otro.tipo === 'interface' || otro.tipo === 'enumeration')
      continue;

    const otroNombre = otro.nombre;
    const otroCampo = toCamelCase(otroNombre);
    const miCampo = toCamelCase(nombre);
    const miMult = esOrigen
      ? rel.multiplicidadOrigen
      : rel.multiplicidadDestino;
    const otraMult = esOrigen
      ? rel.multiplicidadDestino
      : rel.multiplicidadOrigen;
    const yoSoyMuchos = isMany(miMult);
    const otroEsMuchos = isMany(otraMult);

    // Import cruzado: la entidad vive en otra carpeta/modulo
    importsCruzados.add(
      `import ${ctx.packageBase}.${otroNombre.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}.${otroNombre};`,
    );

    if (rel.tipo === 'composition') {
      // Composicion fuerte: el ORIGEN es el todo (cascade + orphanRemoval)
      if (esOrigen) {
        usaList = true;
        todos.push({ tipo: `List<${otroNombre}>`, nombre: `${otroCampo}s` });
        lineasDeclaracion.push(
          `    // Composicion: si muere ${nombre}, mueren sus ${otroCampo}s`,
          `    @OneToMany(mappedBy = "${miCampo}", cascade = CascadeType.ALL, orphanRemoval = true)`,
          `    private List<${otroNombre}> ${otroCampo}s;`,
        );
      } else {
        todos.push({ tipo: otroNombre, nombre: otroCampo });
        lineasDeclaracion.push(
          `    @ManyToOne`,
          `    @JoinColumn(name = "${otroCampo}_id")`,
          `    private ${otroNombre} ${otroCampo};`,
        );
      }
      continue;
    }

    // Asociacion y agregacion (debil): sin cascade.
    // El lado "muchos" lleva la FK (@ManyToOne); el lado "uno" la coleccion.
    if (yoSoyMuchos && otroEsMuchos) {
      // Muchos a muchos: el ORIGEN es el dueno (@JoinTable), el destino mapea
      usaList = true;
      todos.push({ tipo: `List<${otroNombre}>`, nombre: `${otroCampo}s` });
      if (esOrigen) {
        const tablaJoin =
          `${toTableName(nombre)}_${toTableName(otroNombre)}`.replace(
            /s_/g,
            '_',
          );
        lineasDeclaracion.push(
          `    @ManyToMany`,
          `    @JoinTable(name = "${tablaJoin}",`,
          `        joinColumns = @JoinColumn(name = "${miCampo}_id"),`,
          `        inverseJoinColumns = @JoinColumn(name = "${otroCampo}_id"))`,
          `    private List<${otroNombre}> ${otroCampo}s;`,
        );
      } else {
        lineasDeclaracion.push(
          `    @ManyToMany(mappedBy = "${miCampo}s")`,
          `    private List<${otroNombre}> ${otroCampo}s;`,
        );
      }
    } else if (yoSoyMuchos && !otroEsMuchos) {
      todos.push({ tipo: otroNombre, nombre: otroCampo });
      lineasDeclaracion.push(
        `    @ManyToOne`,
        `    @JoinColumn(name = "${otroCampo}_id")`,
        `    private ${otroNombre} ${otroCampo};`,
      );
    } else if (!yoSoyMuchos && otroEsMuchos) {
      usaList = true;
      todos.push({ tipo: `List<${otroNombre}>`, nombre: `${otroCampo}s` });
      lineasDeclaracion.push(
        `    @OneToMany(mappedBy = "${miCampo}")`,
        `    private List<${otroNombre}> ${otroCampo}s;`,
      );
    } else {
      todos.push({ tipo: otroNombre, nombre: otroCampo });
      lineasDeclaracion.push(
        `    @OneToOne`,
        `    @JoinColumn(name = "${otroCampo}_id")`,
        `    private ${otroNombre} ${otroCampo};`,
      );
    }
  }

  // Cabecera de herencia
  const clausulaHerencia = padreNombre ? ` extends ${padreNombre}` : '';
  const clausulaInterfaces =
    interfaces.length > 0 ? ` implements ${interfaces.join(', ')}` : '';
  if (padreNombre) {
    importsCruzados.add(
      `import ${ctx.packageBase}.${padreNombre.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}.${padreNombre};`,
    );
  }
  // Las interfaces implementadas viven en otro paquete: import obligatorio
  // para que la clase compile (cada interfaz se genera en su propia carpeta).
  for (const interfaceNombre of interfaces) {
    importsCruzados.add(
      `import ${ctx.packageBase}.${interfaceNombre.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}.${interfaceNombre};`,
    );
  }
  // Atributos cuyo tipo es una enumeracion del diagrama (vive en otra
  // carpeta): el import es obligatorio o la entidad no compila.
  for (const javaType of tiposJava) {
    if (ctx.enums.has(javaType)) {
      importsCruzados.add(
        `import ${ctx.packageBase}.${javaType.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}.${javaType};`,
      );
    }
  }

  const importsTiempo = importsForTypes(tiposJava);
  const imports = [
    'import jakarta.persistence.*;',
    ...(usaList ? ['import java.util.List;'] : []),
    ...importsTiempo,
    ...Array.from(importsCruzados).sort(),
  ];

  // Accessors clasicos para cada campo (el id tambien, lo usa el Mapper)
  const accessors = todos
    .map(
      (c) => `    public ${c.tipo} get${capitalizar(c.nombre)}() {
        return ${c.nombre};
    }

    public void set${capitalizar(c.nombre)}(${c.tipo} ${c.nombre}) {
        this.${c.nombre} = ${c.nombre};
    }`,
    )
    .join('\n\n');

  // Stubs de los metodos de las interfaces implementadas: sin ellos la clase
  // no compila ("is not abstract and does not override"). Mismo contrato que
  // generateInterface (ret verbatim, params via toJavaType sin enums).
  const stubs = interfacesEntidades
    .flatMap((iface) => iface.metodos ?? [])
    .map((m) => {
      const paramsStub = m.params
        .map((p) => `${toJavaType(p.tipo, new Set())} ${p.nombre}`)
        .join(', ');
      const ret = m.ret || 'void';
      return `    @Override
    public ${ret} ${m.nombre}(${paramsStub}) {
${cuerpoStub(ret)}
    }`;
    })
    .join('\n\n');

  return `package ${paquete};

${imports.join('\n')}

// Entidad ${nombre}: tabla ${toTableName(nombre)}
@Entity
@Table(name = "${toTableName(nombre)}")
public class ${nombre}${clausulaHerencia}${clausulaInterfaces} {
${lineasDeclaracion.join('\n')}

${accessors}
${stubs === '' ? '' : `\n${stubs}\n`}
}
`;
}

/**
 * Cuerpo de un stub de metodo de interfaz: devuelve un valor por defecto
 * segun el tipo de retorno (nada para void, false para boolean, 0 para
 * numericos, null para el resto) para que la clase compile sin logica.
 * @param ret - Tipo de retorno declarado en la interfaz
 * @returns Cuerpo del metodo (indentado a 8 espacios)
 */
function cuerpoStub(ret: string): string {
  const r = ret.trim().toLowerCase();
  if (r === 'void')
    return '        // Stub generado: implementar la logica aqui';
  if (r === 'boolean' || r === 'bool') return '        return false;';
  if (
    [
      'int',
      'integer',
      'long',
      'double',
      'float',
      'bigdecimal',
      'short',
      'byte',
    ].includes(r)
  ) {
    return '        return 0;';
  }
  return '        return null;';
}

/**
 * Genera el archivo de una interfaz UML (sin @Entity).
 * @param entidad - Entidad tipo interface
 * @param packageBase - Paquete base
 * @param folder - Carpeta del modulo
 * @returns Codigo Java de la interfaz
 */
export function generateInterface(
  entidad: CanonicalEntity,
  packageBase: string,
  folder: string,
): string {
  const metodos = entidad.metodos
    .map((m) => {
      const params = m.params
        .map((p) => `${toJavaType(p.tipo, new Set())} ${p.nombre}`)
        .join(', ');
      return `    ${m.ret || 'void'} ${m.nombre}(${params});`;
    })
    .join('\n');
  return `package ${packageBase}.${folder};

// Interfaz ${entidad.nombre} del diagrama UML
public interface ${entidad.nombre} {
${metodos === '' ? '    // Sin operaciones declaradas' : metodos}
}
`;
}

/**
 * Genera el archivo de una enumeracion UML.
 * @param entidad - Entidad tipo enumeration
 * @param packageBase - Paquete base
 * @param folder - Carpeta del modulo
 * @returns Codigo Java del enum
 */
export function generateEnum(
  entidad: CanonicalEntity,
  packageBase: string,
  folder: string,
): string {
  const literales = (entidad.literales ?? ['VALOR_1']).join(',\n    ');
  return `package ${packageBase}.${folder};

// Enumeracion ${entidad.nombre} del diagrama UML
public enum ${entidad.nombre} {
    ${literales}
}
`;
}
