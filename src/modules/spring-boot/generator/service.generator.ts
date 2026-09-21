/**
 * Generador de @Service por tabla.
 * CRUD completo y funcional: findAll, findById (404 si no existe),
 * save (create con mapeo Request->Entity + FKs), update y deleteById.
 * Usa ResourceNotFoundException (common) en vez de RuntimeException.
 */
import type {
  CanonicalEntity,
  CanonicalRelation,
} from '../../ai/dsl/canonical';
import { capitalizar, esNombreId, toCamelCase, toFolderName } from './java-types';

/** FK que el servicio debe resolver (lado con @JoinColumn). */
interface Fk {
  /** Nombre de la entidad relacionada (ej. Categoria). */
  entidad: string;
  /** Campo en esta entidad (ej. categoria). */
  campo: string;
  /** Campo id en el Request (ej. categoriaId). */
  campoId: string;
  /** Repository relacionado (ej. CategoriaRepository). */
  repo: string;
  /** Paquete del modulo relacionado (ej. com.ejemplo.tienda.categoria). */
  paquete: string;
}

/** Contexto para generar el servicio con sus FKs. */
export interface ServiceContext {
  packageBase: string;
  entidad: CanonicalEntity;
  relaciones: CanonicalRelation[];
  byId: Map<string, CanonicalEntity>;
}

/**
 * Calcula las FKs que este servicio debe resolver (las relaciones donde
 * esta entidad lleva @JoinColumn: lado "muchos", 1-1 o hija de composicion).
 */
function calcularFks(ctx: ServiceContext): Fk[] {
  const fks: Fk[] = [];
  const vistos = new Set<string>();
  for (const rel of ctx.relaciones) {
    if (
      rel.tipo === 'inheritance' ||
      rel.tipo === 'implementation' ||
      rel.tipo === 'dependency'
    ) {
      continue;
    }
    const esOrigen = rel.origen === ctx.entidad.id;
    const otro = ctx.byId.get(esOrigen ? rel.destino : rel.origen);
    if (!otro || otro.tipo === 'interface' || otro.tipo === 'enumeration')
      continue;
    const miMult = esOrigen
      ? rel.multiplicidadOrigen
      : rel.multiplicidadDestino;
    const otraMult = esOrigen
      ? rel.multiplicidadDestino
      : rel.multiplicidadOrigen;
    const yoMuchos = !!miMult?.includes('*');
    const otroMuchos = !!otraMult?.includes('*');
    // Composicion fuerte: solo la parte (destino) lleva la FK, el todo no.
    // En la entidad el todo genera @OneToMany(cascade) y la parte @ManyToOne.
    const esComposicionHija = rel.tipo === 'composition' && !esOrigen;
    if (rel.tipo === 'composition' && esOrigen) continue;
    if (
      (yoMuchos && !otroMuchos) ||
      (!yoMuchos && !otroMuchos) ||
      esComposicionHija
    ) {
      const campo = toCamelCase(otro.nombre);
      if (vistos.has(campo)) continue;
      vistos.add(campo);
      fks.push({
        entidad: otro.nombre,
        campo,
        campoId: `${campo}Id`,
        repo: `${otro.nombre}Repository`,
        paquete: `${ctx.packageBase}.${toFolderName(otro.nombre)}`,
      });
    }
  }
  return fks;
}

/**
 * Genera el servicio de una entidad (CRUD funcional, sin TODOs).
 * @param nombre - Nombre de la entidad (ej. Producto)
 * @param paquete - Paquete del modulo (ej. com.ejemplo.tienda.producto)
 * @param ctx - Contexto con relaciones para resolver FKs
 * @returns Codigo Java del servicio
 */
export function generateService(
  nombre: string,
  paquete: string,
  ctx: ServiceContext,
): string {
  const fks = calcularFks(ctx);
  // El atributo `id` del diagrama es la PK: nada que copiar desde el Request
  // (el valor lo genera la BD con IDENTITY).
  const propios = ctx.entidad.atributos.filter(
    (a) => !a.estatico && !esNombreId(a.nombre),
  );

  // Declaracion e inyeccion de repos (propio + uno por FK)
  const camposRepo = [
    `    private final ${nombre}Repository repo;`,
    ...fks.map(
      (f) =>
        `    private final ${f.repo} ${toCamelCase(f.repo.replace(/Repository$/, ''))}Repo;`,
    ),
  ];
  const paramsCtor = [
    `${nombre}Repository repo`,
    ...fks.map(
      (f) => `${f.repo} ${toCamelCase(f.repo.replace(/Repository$/, ''))}Repo`,
    ),
  ];
  const asignCtor = [
    `        this.repo = repo;`,
    ...fks.map((f) => {
      const varName = `${toCamelCase(f.repo.replace(/Repository$/, ''))}Repo`;
      return `        this.${varName} = ${varName};`;
    }),
  ];

  // Mapeo Request -> Entity (campos propios)
  const setPropios = propios
    .map(
      (a) =>
        `        entity.set${capitalizar(a.nombre)}(req.get${capitalizar(a.nombre)}());`,
    )
    .join('\n');
  // Resolucion de FKs por id (404 si la relacionada no existe)
  const setFks = fks
    .map(
      (f) => `        if (req.get${capitalizar(f.campoId)}() != null) {
            ${f.entidad} ${f.campo} = ${toCamelCase(f.repo.replace(/Repository$/, ''))}Repo.findById(req.get${capitalizar(f.campoId)}())
                .orElseThrow(() -> new ResourceNotFoundException("${f.entidad} no encontrado: " + req.get${capitalizar(f.campoId)}()));
            entity.set${capitalizar(f.campo)}(${f.campo});
        }`,
    )
    .join('\n');
  const cuerpoMapeo = [setPropios, setFks].filter((s) => s !== '').join('\n');

  const imports = [
    'import java.util.List;',
    'import org.springframework.stereotype.Service;',
    'import org.springframework.transaction.annotation.Transactional;',
    ...fks.map((f) => `import ${f.paquete}.${f.entidad};`),
    ...fks.map((f) => `import ${f.paquete}.${f.repo};`),
  ];

  return `package ${paquete};

${imports.join('\n')}
import ${ctx.packageBase}.common.ResourceNotFoundException;

// Servicio de ${nombre}: logica de negocio y CRUD
@Service
public class ${nombre}Service {

${camposRepo.join('\n')}

    // Inyeccion por constructor (recomendada en Spring Boot)
    public ${nombre}Service(${paramsCtor.join(', ')}) {
${asignCtor.join('\n')}
    }

    // Lista todos los registros
    public List<${nombre}Response> findAll() {
        return repo.findAll().stream().map(${nombre}Mapper::toResponse).toList();
    }

    // Busca uno por id o lanza 404
    public ${nombre}Response findById(Long id) {
        ${nombre} entity = repo.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("${nombre} no encontrado: " + id));
        return ${nombre}Mapper.toResponse(entity);
    }

    // Create (POST): el id lo genera la BD
    @Transactional
    public ${nombre}Response save(${nombre}Request req) {
        ${nombre} entity = new ${nombre}();
${cuerpoMapeo === '' ? '        // Sin campos que mapear' : cuerpoMapeo}
        ${nombre} saved = repo.save(entity);
        return ${nombre}Mapper.toResponse(saved);
    }

    // Update (PUT): requiere id existente, si no existe lanza 404
    @Transactional
    public ${nombre}Response update(Long id, ${nombre}Request req) {
        ${nombre} entity = repo.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("${nombre} no encontrado: " + id));
${cuerpoMapeo === '' ? '        // Sin campos que mapear' : cuerpoMapeo}
        ${nombre} saved = repo.save(entity);
        return ${nombre}Mapper.toResponse(saved);
    }

    // Delete (DELETE): elimina por id
    @Transactional
    public void deleteById(Long id) {
        repo.deleteById(id);
    }
}
`;
}
