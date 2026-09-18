/**
 * Servicio orquestador de generacion Spring Boot.
 * Flujo: verifica acceso al diagrama -> proyecta el snapshot al DSL
 * canonico (projectState) -> por cada entidad genera su carpeta/modulo
 * (1 carpeta por tabla, archivos planos con prefijo, accessors clasicos,
 * CRUD funcional sin TODOs) + archivos base del proyecto (pom, properties
 * con Postgres local, Application, 404, CORS, README, gitignore).
 * El resultado es un proyecto Maven corrible con `mvn spring-boot:run`.
 */
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CanonicalEntity } from '../ai/dsl/canonical';
import { projectState } from '../ai/dsl/project';
import { GenerateModulesDto } from './dto/generate-modules.dto';
import { generateController } from './generator/controller.generator';
import { generateRequest, generateResponse } from './generator/dto.generator';
import {
  generateEntity,
  generateEnum,
  generateInterface,
} from './generator/entity.generator';
import { EnumNames, toFolderName } from './generator/java-types';
import { generateMapper } from './generator/mapper.generator';
import {
  appClassName,
  generateApplicationClass,
  generateCorsConfig,
  generateExceptionHandler,
  generateGitignore,
  generateNotFoundException,
  generatePom,
  generateProperties,
  generateReadme,
  splitPackage,
} from './generator/project.generator';
import { generateRepository } from './generator/repository.generator';
import { generateService } from './generator/service.generator';

/** Archivo generado (ruta dentro del proyecto + contenido). */
export interface GeneratedFile {
  /** Ruta relativa a la raiz del proyecto (ej. src/main/java/.../producto/Producto.java). */
  path: string;
  /** Contenido completo del archivo. */
  content: string;
}

/** Resultado de POST /spring-boot/modules. */
export interface GenerateModulesResult {
  /** Cantidad de modulos (carpetas) generados. */
  moduloCount: number;
  /** Cantidad total de archivos (modulos + base del proyecto). */
  fileCount: number;
  /** Archivos generados (ruta + contenido). */
  files: GeneratedFile[];
}

/** Paquete base por defecto si el cliente no lo envia. */
const DEFAULT_PACKAGE_BASE = 'com.ejemplo.tienda';

/**
 * Servicio de generacion determinista (sin IA): plantillas fijas sobre el DSL.
 */
@Injectable()
export class SpringBootService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Genera el proyecto Spring Boot completo del diagrama.
   * @param userId - Id del usuario autenticado (JWT)
   * @param dto - Diagrama, snapshot y packageBase
   * @returns Proyecto Maven listo para `mvn spring-boot:run`
   * @throws NotFoundException si el diagrama no existe
   * @throws ForbiddenException si el usuario no tiene acceso
   */
  async generateModules(
    userId: string,
    dto: GenerateModulesDto,
  ): Promise<GenerateModulesResult> {
    await this.verificarAcceso(dto.diagramId, userId);
    const packageBase = dto.packageBase ?? DEFAULT_PACKAGE_BASE;
    const { artifactId } = splitPackage(packageBase);
    const baseJava = `src/main/java/${packageBase.replace(/\./g, '/')}`;

    // Proyecta el snapshot del lienzo al DSL canonico (ids n1/e1...)
    const { resultado } = projectState(dto.snapshot);
    const byId = new Map<string, CanonicalEntity>();
    for (const e of resultado.entidades) byId.set(e.id, e);
    const enums: EnumNames = new Set(
      resultado.entidades
        .filter((e) => e.tipo === 'enumeration')
        .map((e) => e.nombre),
    );

    const files: GeneratedFile[] = [];
    const modulosPersistentes: string[] = [];
    let moduloCount = 0;

    for (const entidad of resultado.entidades) {
      const folder = toFolderName(entidad.nombre);
      const paquete = `${packageBase}.${folder}`;
      const dir = `${baseJava}/${folder}`;
      const relaciones = resultado.relaciones.filter(
        (r) => r.origen === entidad.id || r.destino === entidad.id,
      );

      if (entidad.tipo === 'interface') {
        files.push({
          path: `${dir}/${entidad.nombre}.java`,
          content: generateInterface(entidad, packageBase, folder),
        });
        moduloCount += 1;
        continue;
      }
      if (entidad.tipo === 'enumeration') {
        files.push({
          path: `${dir}/${entidad.nombre}.java`,
          content: generateEnum(entidad, packageBase, folder),
        });
        moduloCount += 1;
        continue;
      }

      // Clase / abstracta: modulo completo (entity + repo + service + controller + dtos + mapper)
      const nombre = entidad.nombre;
      modulosPersistentes.push(nombre);
      files.push({
        path: `${dir}/${nombre}.java`,
        content: generateEntity(entidad, relaciones, {
          packageBase,
          folder,
          byId,
          enums,
        }),
      });
      files.push({
        path: `${dir}/${nombre}Repository.java`,
        content: generateRepository(nombre, packageBase, folder),
      });
      files.push({
        path: `${dir}/${nombre}Service.java`,
        content: generateService(nombre, paquete, {
          packageBase,
          entidad,
          relaciones,
          byId,
        }),
      });
      files.push({
        path: `${dir}/${nombre}Controller.java`,
        content: generateController(nombre, paquete),
      });
      files.push({
        path: `${dir}/${nombre}Request.java`,
        content: generateRequest(entidad, relaciones, byId, enums, paquete),
      });
      files.push({
        path: `${dir}/${nombre}Response.java`,
        content: generateResponse(entidad, enums, paquete),
      });
      files.push({
        path: `${dir}/${nombre}Mapper.java`,
        content: generateMapper(entidad, paquete),
      });
      moduloCount += 1;
    }

    // Archivos base del proyecto (corrible sin nada manual)
    files.push({ path: 'pom.xml', content: generatePom(packageBase) });
    files.push({
      path: 'src/main/resources/application.properties',
      content: generateProperties(),
    });
    files.push({
      path: `${baseJava}/${appClassName(artifactId)}.java`,
      content: generateApplicationClass(packageBase, artifactId),
    });
    files.push({
      path: `${baseJava}/common/ResourceNotFoundException.java`,
      content: generateNotFoundException(packageBase),
    });
    files.push({
      path: `${baseJava}/common/GlobalExceptionHandler.java`,
      content: generateExceptionHandler(packageBase),
    });
    files.push({
      path: `${baseJava}/config/CorsConfig.java`,
      content: generateCorsConfig(packageBase),
    });
    files.push({ path: '.gitignore', content: generateGitignore() });
    files.push({
      path: 'README.md',
      content: generateReadme(artifactId, modulosPersistentes),
    });

    return { moduloCount, fileCount: files.length, files };
  }

  /**
   * Verifica que el diagrama exista y que el usuario tenga acceso
   * (dueno del workspace o colaborador).
   */
  private async verificarAcceso(
    diagramId: string,
    userId: string,
  ): Promise<void> {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id: diagramId },
      include: {
        workspace: { select: { ownerId: true } },
        collaborators: { where: { userId }, select: { role: true } },
      },
    });
    if (!diagram) throw new NotFoundException('Diagrama no encontrado');
    const esDueno = diagram.workspace.ownerId === userId;
    const esColaborador = diagram.collaborators.length > 0;
    if (!esDueno && !esColaborador) {
      throw new ForbiddenException('No tienes acceso a este diagrama');
    }
  }
}
