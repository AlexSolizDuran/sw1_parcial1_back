/**
 * Generador de un modulo CRUD por screen (config JSON del frontend).
 *
 * Cada screen genera una carpeta con los mismos archivos planos que el
 * generador UML (Entity, Repository, Service, Controller, Request, Response,
 * Mapper) pero:
 *  - los nombres de clase/carpeta salen del `id` la screen tal cual
 *    (customers -> Customers, carpeta customers),
 *  - las rutas de los endpoints son las EXACTAS del JSON (sin `/api`),
 *  - los campos se mapean desde `fields` (text, number, select, array...),
 *  - los selects con `from` son FKs reales (@ManyToOne) hacia la screen
 *    referenciada si esta tambien se genera (si no, quedan como Long),
 *  - los arrays se modelan con @ElementCollection y una clase embebida.
 *
 * Determinista, sin IA. Compila con el mismo pom/base que el modo UML.
 */
import type {
  ScreenConfig,
  ScreenField,
} from '../screens/screens.types';
import {
  capitalizar,
  importsForTypes,
  toCamelCase,
  toFolderName,
} from './java-types';

/** Contexto de generacion de todos los screens (para resolver FKs cruzadas). */
export interface ScreensContext {
  /** Idi de todas las screens que se generan (para FKs validas). */
  idsGenerados: Set<string>;
  /** Clase Java de una screen por su id (ej. customers -> Customers). */
  clasePorId: Map<string, string>;
  /** Mapa de screenId -> paquete del modulo (com.ejemplo.tienda.<carpeta>). */
  paquetePorId: Map<string, string>;
  /** Paquete base (ej. com.ejemplo.tienda). */
  packageBase: string;
  /** Carpeta raiz de java (src/main/java/<package en path>). */
  baseJava: string;
}

/** Archivo generado (compatible con GenerateModulesResult). */
export interface ScreenFile {
  path: string;
  content: string;
}

/** Nombre de clase Java a partir del id (customers -> Customers). */
export function claseDesdeId(id: string): string {
  return capitalizar(toFolderName(id));
}

/** Convierte un nombre de campo del JSON a variable Java (category_id -> categoryId). */
export function nombreCampo(name: string): string {
  return toCamelCase(name).replace(/_([a-zA-Z0-9])/g, (_, c) =>
    c.toUpperCase(),
  );
}

/**
 * Indica si un field de la screen es el id (PK), comparado con idField de
 * forma case-insensitive. Ese field se absorbe en la PK Long
 * (`@GeneratedValue IDENTITY`) y NO se genera como columna ni en los DTOs,
 * evitando el duplicado que romperia la compilacion.
 */
function esFieldId(f: ScreenField, idField: string): boolean {
  return nombreCampo(f.name).toLowerCase() === idField.toLowerCase();
}

/**
 * Anotacion @JsonProperty para que el JSON de entrada/salida use el nombre
 * EXACTO del DSL (ej. `category_id`), no el camelCase de Java.
 * El movil lee/escribe con `field.name`, asi el contrato es 1:1.
 */
function jsonProperty(f: ScreenField): string {
  const nombreJava = nombreCampo(f.name);
  return nombreJava === f.name ? '' : `    @JsonProperty("${f.name}")`;
}

/**
 * Convierte un tipo de campo del DSL a tipo Java simple.
 * No cubre array (se maneja aparte con @ElementCollection) ni `from`
 * (FK real). Devuelve tambien el nombre de columna (el nombre tal cual).
 */
export function campoJava(
  field: ScreenField,
): { tipo: string; nombreJava: string; columna: string } {
  const nombreJava = nombreCampo(field.name);
  let tipo: string;
  switch (field.type) {
    case 'number':
      tipo = 'BigDecimal';
      break;
    case 'integer':
      tipo = 'Integer';
      break;
    case 'boolean':
      tipo = 'Boolean';
      break;
    case 'date':
      tipo = 'LocalDate';
      break;
    case 'datetime':
      tipo = 'LocalDateTime';
      break;
    case 'textarea':
      tipo = 'String';
      break;
    case 'select':
      // Con opciones fijas es un String; con FK se resuelve en generarEntidad
      tipo = 'String';
      break;
    case 'object':
      // No hay tipo nativo: se guarda como texto JSON
      tipo = 'String';
      break;
    case 'text':
    default:
      tipo = 'String';
      break;
  }
  return { tipo, nombreJava, columna: field.name };
}

/** Indica si la screen es FK valida (existe y se genera). */
function esFkValida(
  field: ScreenField,
  ctx: ScreensContext,
): boolean {
  return (
    field.type === 'select' &&
    field.from !== undefined &&
    ctx.idsGenerados.has(field.from.screen)
  );
}

/**
 * Genera todos los archivos del modulo de una screen.
 * @param screen - Screen tipada
 * @param ctx - Contexto global de screens
 * @returns Archivos (path + contenido) del modulo
 */
export function generateScreenModule(
  screen: ScreenConfig,
  ctx: ScreensContext,
): ScreenFile[] {
  const clase = ctx.clasePorId.get(screen.id) ?? claseDesdeId(screen.id);
  const folder = toFolderName(screen.id);
  const paquete = ctx.paquetePorId.get(screen.id) ?? `${ctx.packageBase}.${folder}`;
  const dir = `${ctx.baseJava}/${folder}`;

  const archivos: ScreenFile[] = [];

  // 1. Embeddable: una clase por campo array (elementos de la lista)
  const embebidas = screen.fields
    .filter((f) => f.type === 'array')
    .map((f) => generarEmbebida(screen, f, paquete));
  for (const e of embebidas) {
    archivos.push({ path: `${ctx.baseJava}/${folder}/${e.nombre}.java`, content: e.codigo });
  }

  // 2. Entidad (@Entity)
  archivos.push({
    path: `${dir}/${clase}.java`,
    content: generarEntidad(screen, clase, paquete, embebidas.map((e) => e.nombre), ctx),
  });

  // 3. Repository
  archivos.push({
    path: `${dir}/${clase}Repository.java`,
    content: generarRepository(clase, paquete),
  });

  // 4. Request (entrada, sin readOnly)
  archivos.push({
    path: `${dir}/${clase}Request.java`,
    content: generarRequest(screen, clase, paquete, embebidas.map((e) => e.nombre), ctx),
  });

  // 5. Response (salida, con id)
  archivos.push({
    path: `${dir}/${clase}Response.java`,
    content: generarResponse(screen, clase, paquete, embebidas.map((e) => e.nombre), ctx),
  });

  // 6. Mapper (Entity -> Response)
  archivos.push({
    path: `${dir}/${clase}Mapper.java`,
    content: generarMapper(screen, clase, paquete, embebidas.map((e) => e.nombre), ctx),
  });

  // 7. Service (CRUD + search + resolucion de FKs)
  archivos.push({
    path: `${dir}/${clase}Service.java`,
    content: generarService(screen, clase, paquete, ctx),
  });

  // 8. Controller con las rutas exactas del JSON
  archivos.push({
    path: `${dir}/${clase}Controller.java`,
    content: generarController(screen, clase, paquete),
  });

  return archivos;
}

/**
 * Genera la clase embebida @Embeddable para un campo array.
 * El nombre es <Clase><Campo capitalizado> (ej. CustomersItems).
 */
function generarEmbebida(
  screen: ScreenConfig,
  field: ScreenField,
  paquete: string,
): { nombre: string; codigo: string } {
  const clase = `${claseDesdeId(screen.id)}${capitalizar(field.name)}`;
  const campos = (field.fields ?? []).map((f) => campoJava(f));
  const declaracion = campos
    .map((c) => `    private ${c.tipo} ${c.nombreJava};`)
    .join('\n');
  const accessors = campos
    .map(
      (c) => `    public ${c.tipo} get${capitalizar(c.nombreJava)}() {
        return ${c.nombreJava};
    }

    public void set${capitalizar(c.nombreJava)}(${c.tipo} ${c.nombreJava}) {
        this.${c.nombreJava} = ${c.nombreJava};
    }`,
    )
    .join('\n\n');
  const imports = importsForTypes(campos.map((c) => c.tipo));
  return {
    nombre: clase,
    codigo: `package ${paquete};
${imports.length > 0 ? `\n${imports.join('\n')}` : ''}

import jakarta.persistence.Embeddable;

// Elemento embebido de ${screen.id}.${field.name}: fila dentro del array
@Embeddable
public class ${clase} {
${declaracion === '' ? '    // Sin campos' : declaracion}

${accessors}
}
`,
  };
}

/** Genera la entidad @Entity de la screen (tabla = id de la screen). */
function generarEntidad(
  screen: ScreenConfig,
  clase: string,
  paquete: string,
  embebidas: string[],
  ctx: ScreensContext,
): string {
  const tabla = screen.id;
  const idField = screen.idField ?? 'id';
  const campos = screen.fields.filter(
    (f) => f.type !== 'array' && !esFieldId(f, idField),
  );
  const lineas: string[] = [
    '    @Id',
    '    @GeneratedValue(strategy = GenerationType.IDENTITY)',
    `    private Long ${idField};`,
    '',
  ];
  const accessorTodos: Array<{ tipo: string; nombre: string }> = [
    { tipo: 'Long', nombre: idField },
  ];
  const tipos = new Set<string>();
  const importsCruzados = new Set<string>();

  for (const f of campos) {
    const { tipo, nombreJava, columna } = campoJava(f);
    // Select con FK hacia otra screen generada: @ManyToOne
    if (esFkValida(f, ctx)) {
      const destino = ctx.clasePorId.get(f.from!.screen)!;
      const paqueteDestino = ctx.paquetePorId.get(f.from!.screen)!;
      importsCruzados.add(`import ${paqueteDestino}.${destino};`);
      accessorTodos.push({ tipo: destino, nombre: nombreJava });
      // La columna usa el nombre del campo tal cual (category_id)
      lineas.push(
        `    @ManyToOne`,
        `    @JoinColumn(name = "${columna}")`,
        `    private ${destino} ${nombreJava};`,
      );
      continue;
    }
    tipos.add(tipo);
    accessorTodos.push({ tipo, nombre: nombreJava });
    if (f.required === true && f.nullable !== true) {
      lineas.push(`    @Column(nullable = false)`);
    } else if (typeof f.maxLength === 'number') {
      lineas.push(`    @Column(length = ${f.maxLength})`);
    } else {
      lineas.push(`    @Column`);
    }
    lineas.push(`    private ${tipo} ${nombreJava};`);
  }

  // Arrays: @ElementCollection hacia las clases embebidas
  let usaList = false;
  const camposArray = screen.fields.filter((f) => f.type === 'array');
  for (let i = 0; i < camposArray.length; i++) {
    const f = camposArray[i];
    const nombreJava = nombreCampo(f.name);
    const tipoLista = embebidas[i] ?? `${clase}${capitalizar(f.name)}`;
    usaList = true;
    accessorTodos.push({ tipo: `List<${tipoLista}>`, nombre: nombreJava });
    lineas.push(
      `    // ${f.name}: lista de ${tipoLista} dentro de ${tabla}`,
      `    @ElementCollection`,
      `    @CollectionTable(name = "${tabla}_${toFolderName(f.name)}",`,
      `        joinColumns = @JoinColumn(name = "${idField}"))`,
      `    private List<${tipoLista}> ${nombreJava};`,
    );
  }

  const imports = [
    'import jakarta.persistence.*;',
    ...(usaList ? ['import java.util.List;'] : []),
    ...Array.from(importsCruzados).sort(),
    ...importsForTypes(Array.from(tipos)),
  ];

  const accessors = accessorTodos
    .map(
      (c) => `    public ${c.tipo} get${capitalizar(c.nombre)}() {
        return ${c.nombre};
    }

    public void set${capitalizar(c.nombre)}(${c.tipo} ${c.nombre}) {
        this.${c.nombre} = ${c.nombre};
    }`,
    )
    .join('\n\n');

  return `package ${paquete};

${imports.join('\n')}

// Entidad ${clase}: tabla ${tabla} (screen del JSON)
@Entity
@Table(name = "${tabla}")
public class ${clase} {
${lineas.join('\n')}

${accessors}
}
`;
}

/** Genera el repository Spring Data (sin logica, como el UML). */
function generarRepository(clase: string, paquete: string): string {
  return `package ${paquete};

import org.springframework.data.jpa.repository.JpaRepository;

// Repository de ${clase}: acceso a la tabla ${clase.toLowerCase()}s
public interface ${clase}Repository extends JpaRepository<${clase}, Long> {
}
`;
}

/** Valida campos obligatorios/max/pattern para el Request. */
function anotacionValidacion(f: ScreenField): string[] {
  const anotaciones: string[] = [];
  if (f.required === true) {
    if (f.type === 'text' || f.type === 'textarea') {
      anotaciones.push('    @NotBlank');
    } else {
      anotaciones.push('    @NotNull');
    }
  }
  if (typeof f.maxLength === 'number') {
    anotaciones.push(`    @Size(max = ${f.maxLength})`);
  }
  if (typeof f.pattern === 'string') {
    anotaciones.push(`    @Pattern(regexp = "${f.pattern}")`);
  }
  if ((f.type === 'number' || f.type === 'integer') && typeof f.min === 'number') {
    anotaciones.push(`    @Min(${f.min})`);
  }
  if ((f.type === 'number' || f.type === 'integer') && typeof f.max === 'number') {
    anotaciones.push(`    @Max(${f.max})`);
  }
  return anotaciones;
}

/** Genera el DTO de entrada (sin readOnly, sin id). */
function generarRequest(
  screen: ScreenConfig,
  clase: string,
  paquete: string,
  embebidas: string[],
  ctx: ScreensContext,
): string {
  const idField = screen.idField ?? 'id';
  const campos = screen.fields.filter(
    (f) => f.type !== 'array' && f.readOnly !== true && !esFieldId(f, idField),
  );
  const declaracion: string[] = [];
  const imports = new Set<string>();
  const usaValidation = campos.some(
    (f) =>
      f.required === true ||
      typeof f.maxLength === 'number' ||
      typeof f.pattern === 'string' ||
      typeof f.min === 'number' ||
      typeof f.max === 'number',
  );
  const usaJsonProperty = campos.some((f) => nombreCampo(f.name) !== f.name);
  if (usaJsonProperty) imports.add('import com.fasterxml.jackson.annotation.JsonProperty;');

  for (const f of campos) {
    const validaciones = anotacionValidacion(f);
    const anotacionJson = jsonProperty(f);
    if (esFkValida(f, ctx)) {
      // En el Request la FK viaja como id escalar (Long), con el nombre del DSL
      declaracion.push(anotacionJson, `    private Long ${nombreCampo(f.name)};`);
      continue;
    }
    const { tipo, nombreJava } = campoJava(f);
    if (tipo === 'BigDecimal') imports.add('import java.math.BigDecimal;');
    if (tipo === 'LocalDate') imports.add('import java.time.LocalDate;');
    if (tipo === 'LocalDateTime') imports.add('import java.time.LocalDateTime;');
    declaracion.push(...validaciones, anotacionJson, `    private ${tipo} ${nombreJava};`);
  }

  // Arrays: la Request lleva la lista del mismo tipo embebido
  const camposArray = screen.fields.filter((f) => f.type === 'array');
  for (let i = 0; i < camposArray.length; i++) {
    const f = camposArray[i];
    const tipoLista = embebidas[i] ?? `${clase}${capitalizar(f.name)}`;
    imports.add('import java.util.List;');
    imports.add(`import ${paquete}.${tipoLista};`);
    declaracion.push(`    private List<${tipoLista}> ${nombreCampo(f.name)};`);
  }

  // Accessors: campos editables + arrays (el tipo ya se resolvio arriba)
  const tipoRequest = (f: ScreenField): string => {
    if (esFkValida(f, ctx)) return 'Long';
    if (f.type === 'array') {
      const idx = camposArray.indexOf(f);
      return `List<${embebidas[idx] ?? `${clase}${capitalizar(f.name)}`}>`;
    }
    return campoJava(f).tipo;
  };
  const accessorFields = [
    ...campos,
    ...camposArray,
  ];
  const accessors = accessorFields.map((f) => {
    const nombreJava = nombreCampo(f.name);
    const tipo = tipoRequest(f);
    return `    public ${tipo} get${capitalizar(nombreJava)}() {
        return ${nombreJava};
    }

    public void set${capitalizar(nombreJava)}(${tipo} ${nombreJava}) {
        this.${nombreJava} = ${nombreJava};
    }`;
  }).join('\n\n');

  return `package ${paquete};
${imports.size > 0 ? `\n${Array.from(imports).sort().join('\n')}` : ''}
${usaValidation ? `\nimport jakarta.validation.constraints.*;` : ''}

// DTO de entrada de ${clase}: lo que recibe POST / PUT (sin id)
public class ${clase}Request {
${declaracion.join('\n')}

${accessors}
}
`;
}

/** Genera el DTO de salida (id + todos los campos, no readOnly se incluye). */
function generarResponse(
  screen: ScreenConfig,
  clase: string,
  paquete: string,
  embebidas: string[],
  ctx: ScreensContext,
): string {
  const idField = screen.idField ?? 'id';
  const campos = screen.fields.filter(
    (f) => f.type !== 'array' && !esFieldId(f, idField),
  );
  const declaracion: string[] = [`    private Long ${idField};`];
  const imports = new Set<string>();
  const usaJsonProperty = campos.some((f) => nombreCampo(f.name) !== f.name);
  if (usaJsonProperty) imports.add('import com.fasterxml.jackson.annotation.JsonProperty;');
  if (campos.length === 0 && screen.fields.every((f) => f.type !== 'array')) {
    declaracion.push('    // Sin campos de salida');
  }

  const accessorTodos: Array<{ tipo: string; nombre: string }> = [
    { tipo: 'Long', nombre: idField },
  ];

  for (const f of campos) {
    const anotacionJson = jsonProperty(f);
    if (esFkValida(f, ctx)) {
      // La FK viaja como id escalar (Long), no como objeto anidado
      accessorTodos.push({ tipo: 'Long', nombre: nombreCampo(f.name) });
      declaracion.push(anotacionJson, `    private Long ${nombreCampo(f.name)};`);
      continue;
    }
    const { tipo, nombreJava } = campoJava(f);
    if (tipo === 'BigDecimal') imports.add('import java.math.BigDecimal;');
    if (tipo === 'LocalDate') imports.add('import java.time.LocalDate;');
    if (tipo === 'LocalDateTime') imports.add('import java.time.LocalDateTime;');
    accessorTodos.push({ tipo, nombre: nombreJava });
    declaracion.push(anotacionJson, `    private ${tipo} ${nombreJava};`);
  }

  // Arrays en el Response: el tipo embebido viaja tal cual
  const camposArray = screen.fields.filter((f) => f.type === 'array');
  for (let i = 0; i < camposArray.length; i++) {
    const f = camposArray[i];
    const tipoLista = embebidas[i] ?? `${clase}${capitalizar(f.name)}`;
    imports.add('import java.util.List;');
    imports.add(`import ${paquete}.${tipoLista};`);
    accessorTodos.push({ tipo: `List<${tipoLista}>`, nombre: nombreCampo(f.name) });
    declaracion.push(`    private List<${tipoLista}> ${nombreCampo(f.name)};`);
  }

  const accessors = accessorTodos
    .map(
      (c) => `    public ${c.tipo} get${capitalizar(c.nombre)}() {
        return ${c.nombre};
    }

    public void set${capitalizar(c.nombre)}(${c.tipo} ${c.nombre}) {
        this.${c.nombre} = ${c.nombre};
    }`,
    )
    .join('\n\n');

  return `package ${paquete};
${imports.size > 0 ? `\n${Array.from(imports).sort().join('\n')}` : ''}

// DTO de salida de ${clase}: lo que devuelve GET (con id)
public class ${clase}Response {
${declaracion.join('\n')}

${accessors}
}
`;
}

/** Genera el mapper Entity -> Response (mismo patron que el UML). */
function generarMapper(
  screen: ScreenConfig,
  clase: string,
  paquete: string,
  embebidas: string[],
  ctx: ScreensContext,
): string {
  const idField = screen.idField ?? 'id';
  const campos = screen.fields.filter(
    (f) => f.type !== 'array' && !esFieldId(f, idField),
  );
  const lineas: string[] = [`        res.set${capitalizar(idField)}(entity.get${capitalizar(idField)}());`];
  for (const f of campos) {
    const nombreJava = nombreCampo(f.name);
    if (esFkValida(f, ctx)) {
      // La FK es una entidad @ManyToOne: se expone su id (escalar)
      lineas.push(`        res.set${capitalizar(nombreJava)}(entity.get${capitalizar(nombreJava)}() == null ? null : entity.get${capitalizar(nombreJava)}().getId());`);
      continue;
    }
    lineas.push(`        res.set${capitalizar(nombreJava)}(entity.get${capitalizar(nombreJava)}());`);
  }
  const camposArray = screen.fields.filter((f) => f.type === 'array');
  for (let i = 0; i < camposArray.length; i++) {
    const f = camposArray[i];
    const nombreJava = nombreCampo(f.name);
    lineas.push(`        res.set${capitalizar(nombreJava)}(entity.get${capitalizar(nombreJava)}());`);
  }

  return `package ${paquete};

// Mapper de ${clase}: convierte Entity <-> DTO
public class ${clase}Mapper {

    // Convierte la entidad persistida al DTO de salida
    public static ${clase}Response toResponse(${clase} entity) {
        ${clase}Response res = new ${clase}Response();
${lineas.join('\n')}
        return res;
    }
}
`;
}

/** FKs que el servicio debe resolver (campo + entidad destino). */
interface FkScreen {
  /** Campo en la entidad (ej. categoryId). */
  campo: string;
  /** Clase destino (ej. Categories). */
  destino: string;
  /** Repositorio destino (ej. CategoriesRepository). */
  repo: string;
  /** Paquete destino. */
  paquete: string;
}

/** Calcula las FKs de la screen (select con from hacia screen generada). */
function calcularFks(screen: ScreenConfig, ctx: ScreensContext): FkScreen[] {
  const fks: FkScreen[] = [];
  for (const f of screen.fields) {
    if (f.type !== 'select' || !f.from || !ctx.idsGenerados.has(f.from.screen))
      continue;
    const destino = ctx.clasePorId.get(f.from.screen)!;
    const paqueteDestino = ctx.paquetePorId.get(f.from.screen)!;
    fks.push({
      campo: nombreCampo(f.name),
      destino,
      repo: `${destino}Repository`,
      paquete: paqueteDestino,
    });
  }
  return fks;
}

/** Campos por los que busca el endpoint /search?q= (default: texto). */
function camposBusqueda(screen: ScreenConfig): string[] {
  if (screen.searchFields && screen.searchFields.length > 0) {
    return screen.searchFields;
  }
  return screen.fields
    .filter(
      (f) =>
        f.type === 'text' ||
        f.type === 'textarea' ||
        f.type === 'select',
    )
    .map((f) => nombreCampo(f.name));
}

/** Genera el servicio CRUD de la screen. */
function generarService(
  screen: ScreenConfig,
  clase: string,
  paquete: string,
  ctx: ScreensContext,
): string {
  const idField = screen.idField ?? 'id';
  const fks = calcularFks(screen, ctx);
  const camposSimples = screen.fields.filter(
    (f) =>
      f.type !== 'array' &&
      !esFkValida(f, ctx) &&
      f.readOnly !== true &&
      !esFieldId(f, idField),
  );
  const camposArray = screen.fields.filter((f) => f.type === 'array');

  const camposRepo = [
    `    private final ${clase}Repository repo;`,
    ...fks.map(
      (f) =>
        `    private final ${f.repo} ${toCamelCase(f.repo.replace(/Repository$/, ''))}Repo;`,
    ),
  ];
  const paramsCtor = [
    `${clase}Repository repo`,
    ...fks.map(
      (f) => `${f.repo} ${toCamelCase(f.repo.replace(/Repository$/, ''))}Repo`,
    ),
  ];
  const asignCtor = [
    '        this.repo = repo;',
    ...fks.map((f) => {
      const v = `${toCamelCase(f.repo.replace(/Repository$/, ''))}Repo`;
      return `        this.${v} = ${v};`;
    }),
  ];

  // Mapeo de campos simples (setX(req.getX()))
  const setSimples = camposSimples
    .map(
      (f) =>
        `        entity.set${capitalizar(nombreCampo(f.name))}(req.get${capitalizar(nombreCampo(f.name))}());`,
    )
    .join('\n');
  // Arrays: copiar la lista
  const setArrays = camposArray
    .map(
      (f) =>
        `        entity.set${capitalizar(nombreCampo(f.name))}(req.get${capitalizar(nombreCampo(f.name))}());`,
    )
    .join('\n');
  // FKs: resolver por id (404 si no existe)
  const setFks = fks
    .map(
      (f) => `        if (req.get${capitalizar(f.campo)}() != null) {
            ${f.destino} ${f.campo} = ${toCamelCase(f.repo.replace(/Repository$/, ''))}Repo.findById(req.get${capitalizar(f.campo)}())
                .orElseThrow(() -> new ResourceNotFoundException("${f.destino} no encontrado: " + req.get${capitalizar(f.campo)}()));
            entity.set${capitalizar(f.campo)}(${f.campo});
        }`,
    )
    .join('\n');
  const cuerpoMapeo = [setSimples, setArrays, setFks]
    .filter((s) => s !== '')
    .join('\n');

  // Search: filtro en memoria sobre los searchFields (toString contains)
  const busqueda = camposBusqueda(screen);
  const condicionBusqueda =
    busqueda.length > 0
      ? busqueda
          .map(
            (c) =>
              `entity.get${capitalizar(c)}() != null && entity.get${capitalizar(c)}().toString().toLowerCase().contains(q)`,
          )
          .join(' || ')
      : 'false';
  const pasosSearch = `        return repo.findAll().stream()
            .filter(entity -> ${condicionBusqueda})
            .map(${clase}Mapper::toResponse)
            .toList();`;

  const imports = [
    'import java.util.List;',
    'import org.springframework.stereotype.Service;',
    'import org.springframework.transaction.annotation.Transactional;',
    ...fks.map((f) => `import ${f.paquete}.${f.destino};`),
    ...fks.map((f) => `import ${f.paquete}.${f.repo};`),
  ];

  return `package ${paquete};

${imports.join('\n')}
import ${ctx.packageBase}.common.ResourceNotFoundException;

// Servicio de ${clase}: CRUD + search + resolucion de FKs (screen del JSON)
@Service
public class ${clase}Service {

${camposRepo.join('\n')}

    // Inyeccion por constructor (recomendada en Spring Boot)
    public ${clase}Service(${paramsCtor.join(', ')}) {
${asignCtor.join('\n')}
    }

    // Lista todos los registros
    public List<${clase}Response> findAll() {
        return repo.findAll().stream().map(${clase}Mapper::toResponse).toList();
    }

    // Busca uno por id o lanza 404
    public ${clase}Response findById(Long id) {
        ${clase} entity = repo.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("${clase} no encontrado: " + id));
        return ${clase}Mapper.toResponse(entity);
    }

    // Busca por texto en los searchFields (q)
    public List<${clase}Response> search(String q) {
        String needle = q == null ? "" : q.trim().toLowerCase();
${pasosSearch}
    }

    // Create (POST): el id lo genera la BD
    @Transactional
    public ${clase}Response save(${clase}Request req) {
        ${clase} entity = new ${clase}();
${cuerpoMapeo === '' ? '        // Sin campos que mapear' : cuerpoMapeo}
        ${clase} saved = repo.save(entity);
        return ${clase}Mapper.toResponse(saved);
    }

    // Update (PUT): requiere id existente, si no existe lanza 404
    @Transactional
    public ${clase}Response update(Long id, ${clase}Request req) {
        ${clase} entity = repo.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("${clase} no encontrado: " + id));
${cuerpoMapeo === '' ? '        // Sin campos que mapear' : cuerpoMapeo}
        ${clase} saved = repo.save(entity);
        return ${clase}Mapper.toResponse(saved);
    }

    // Delete (DELETE): elimina por id
    @Transactional
    public void deleteById(Long id) {
        repo.deleteById(id);
    }
}
`;
}

/**
 * Extrae el sub-path relativo al base y el nombre de la query param.
 * Ej: base "/customers", path "/customers/search?q={q}"
 *     -> { sub: "/search", param: "q" }
 */
function descomponerEndpoint(
  base: string,
  path: string,
): { sub: string; param?: string } {
  // Separa la query (?q={q})
  const sinQuery = path.split('?')[0] ?? path;
  const paramMatch = /\?([a-zA-Z0-9_-]+)=\{/.exec(path);
  const param = paramMatch ? paramMatch[1] : undefined;
  // Sub-path relativo al base
  let sub = sinQuery.replace(base, '');
  if (sub === '') sub = '';
  if (sub !== '' && !sub.startsWith('/')) sub = `/${sub}`;
  return { sub, param };
}

/** Genera el controller de la screen con las rutas EXACTAS del JSON. */
export function generarController(
  screen: ScreenConfig,
  clase: string,
  paquete: string,
): string {
  const base = screen.list.path;
  const idField = screen.idField ?? 'id';

  const metodos: string[] = [];
  // List: GET base
  metodos.push(`    // GET ${base} -> listar todos
    @Operation(summary = "Lista todos los registros de ${clase}")
    @GetMapping
    public List<${clase}Response> findAll() {
        return service.findAll();
    }
`);
  // GetOne: GET base/{id} (404 si no existe)
  metodos.push(`    // GET ${base}/{id} -> obtener uno (404 si no existe)
    @Operation(summary = "Obtiene un ${clase} por id")
    @GetMapping("/{id}")
    public ${clase}Response findById(@PathVariable Long id) {
        return service.findById(id);
    }
`);
  // Search: GET base/search?q=...
  if (screen.search) {
    const { sub, param } = descomponerEndpoint(base, screen.search.path);
    const mapping = sub === '' ? '@GetMapping' : `@GetMapping("${sub}")`;
    const paramName = param ?? 'q';
    metodos.push(`    // GET ${screen.search.path} -> buscar por texto
    @Operation(summary = "Busca ${clase} por texto")
    ${mapping}
    public List<${clase}Response> search(@RequestParam(name = "${paramName}", required = false) String ${paramName}) {
        return service.search(${paramName});
    }
`);
  }
  // Create: POST base (responde 201)
  if (screen.create) {
    metodos.push(`    // POST ${screen.create.path} -> crear (responde 201)
    @Operation(summary = "Crea un nuevo ${clase}")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ${clase}Response create(@RequestBody ${clase}Request req) {
        return service.save(req);
    }
`);
  }
  // Update: PUT base/{id}
  if (screen.update) {
    const { sub } = descomponerEndpoint(base, screen.update.path);
    const mapping = sub === '' ? '@PutMapping' : `@PutMapping("${sub}")`;
    metodos.push(`    // PUT ${screen.update.path} -> actualizar (404 si no existe)
    @Operation(summary = "Actualiza un ${clase} existente")
    ${mapping}
    public ${clase}Response update(@PathVariable Long id, @RequestBody ${clase}Request req) {
        return service.update(id, req);
    }
`);
  }
  // Delete: DELETE base/{id} (responde 204)
  if (screen.delete) {
    const { sub } = descomponerEndpoint(base, screen.delete.path);
    const mapping = sub === '' ? '@DeleteMapping' : `@DeleteMapping("${sub}")`;
    metodos.push(`    // DELETE ${screen.delete.path} -> eliminar (responde 204)
    @Operation(summary = "Elimina un ${clase} por id")
    ${mapping}
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.deleteById(id);
    }
`);
  }

  return `package ${paquete};

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

// Controlador de ${clase}: endpoints exactos del JSON (sin /api)
@RestController
@RequestMapping("${base}")
@Tag(name = "${clase}", description = "CRUD de ${screen.title ?? clase}")
public class ${clase}Controller {

    private final ${clase}Service service;

    public ${clase}Controller(${clase}Service service) {
        this.service = service;
    }

${metodos.join('\n')}
}
`;
}

/** Nombres de clases de cada screen para el README. */
export function screenClases(ids: string[]): string[] {
  return ids.map((id) => claseDesdeId(id));
}