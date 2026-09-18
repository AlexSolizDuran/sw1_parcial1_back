/**
 * Servicio de importacion de diagramas desde imagen (vision -> DSL)..
 *
 * Orquesta el circuito de una importacion:
 *   1. Verifica acceso al diagrama (requiere OWNER o EDITOR; VIEWER no edita).
 *   2. Envia la imagen al microservicio y valida el DSL devuelto.
 *   3. Proyecta el snapshot actual al DSL canonico y calcula el diff
 *      (modo "reemplazar": el DSL de la imagen pasa a ser el diagrama
 *      completo), resolviendo las acciones con ids reales.
 */
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { CanonicalDiagram, DiagramAction } from '../dsl/canonical';
import { diffDiagrams } from '../dsl/diff';
import { projectState } from '../dsl/project';
import { resolveActions } from '../dsl/resolve';
import { AiValidationError, validarDiagramoOutput } from '../dsl/validate';
import {
  ArchivoImagen,
  VisionGateway,
  VisionGatewayError,
} from './vision.gateway';

/** Respuesta de la importacion (contrato con el frontend). */
export interface ImportarImagenResponse {
  acciones: DiagramAction[];
  advertencias: string[];
}

/** Roles con permiso reales (mismo criterio que el agente COPILOT). */
const ROLES_VALIDADOS = ['OWNER', 'EDITOR', 'VIEWER'] as const;

/**
 * Servicio de IA: importa un diagrama de clases desde una imagen.
 */
@Injectable()
export class VisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: VisionGateway,
  ) {}

  /**
   * Importa una imagen como diagrama de clases (modo reemplazo).
   * @param diagramId - Id del diagrama destino
   * @param userId - Id del usuario autenticado
   * @param dto - Campos del formulario (snapshot JSON y esquema opcional)
   * @param file - Archivo de imagen recibido por el controlador
   * @returns Acciones aplicables (ids reales) y advertencias
   */
  async importarImagen(
    diagramId: string,
    userId: string,
    dto: { snapshot?: string; esquema?: string },
    file: ArchivoImagen,
  ): Promise<ImportarImagenResponse> {
    await this.exigirEditable(diagramId, userId);

    // 1. Microservicio: imagen -> DSL canonico
    let crudo: unknown;
    try {
      crudo = await this.gateway.extraerDiagrama(file, dto.esquema);
    } catch (error) {
      if (error instanceof VisionGatewayError) {
        throw new BadGatewayException(error.message);
      }
      throw error;
    }

    // 2. Validacion del contrato del microservicio
    let deseado: CanonicalDiagram;
    try {
      deseado = validarDiagramoOutput(crudo);
    } catch (error) {
      const detalle =
        error instanceof AiValidationError
          ? error.message
          : 'formato no reconocido';
      throw new BadGatewayException(
        `El microservicio de vision no devolvio un diagrama valido: ${detalle}`,
      );
    }

    // 3. Sin entidades detectadas: la imagen no era un diagrama de clases
    if (deseado.entidades.length === 0) {
      throw new BadRequestException(
        'No se detecto un diagrama de clases en la imagen.',
      );
    }

    // 4. Proyeccion del lienzo actual + diff + resolucion (modo reemplazar)
    const proyeccion = projectState(this.parsearSnapshot(dto.snapshot));
    const acciones = diffDiagrams(proyeccion.resultado, deseado);
    const { acciones: aplicables, advertencias } = resolveActions(
      acciones,
      proyeccion,
      null,
    );

    return { acciones: aplicables, advertencias };
  }

  // ─────────────────────────── Helpers privados ───────────────────────────

  /**
   * Verifica que el usuario pueda editar el diagrama.
   * VIEWER y sin acceso lanzan ForbiddenException; diagrama inexistente, 404.
   */
  private async exigirEditable(diagramId: string, userId: string) {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id: diagramId },
      include: {
        workspace: { select: { ownerId: true } },
        collaborators: { where: { userId }, select: { role: true } },
      },
    });
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    const esOwner = diagram.workspace.ownerId === userId;
    const colaborador = diagram.collaborators[0];
    if (!esOwner && !colaborador) {
      throw new ForbiddenException('No tienes acceso a este diagrama');
    }
    const esEditor =
      esOwner ||
      (colaborador !== undefined &&
        ROLES_VALIDADOS.includes(colaborador.role) &&
        colaborador.role !== 'VIEWER');
    if (!esEditor) {
      throw new ForbiddenException(
        'No tenes permisos para importar una imagen en este diagrama',
      );
    }
  }

  /**
   * Parsea el snapshot (reactFlowState) que llega como JSON en texto.
   * fallback a un objeto vacio si el campo no se envio.
   */
  private parsearSnapshot(snapshot: string | undefined) {
    if (snapshot === undefined || snapshot === '') return {};
    try {
      const valor = JSON.parse(snapshot) as unknown;
      return typeof valor === 'object' && valor !== null ? valor : {};
    } catch {
      throw new BadRequestException('El campo "snapshot" no es un JSON valido');
    }
  }
}
