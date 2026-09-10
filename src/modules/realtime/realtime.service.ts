import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as Y from 'yjs';
import { CollaboratorRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Resultado de la validacion de acceso a un diagrama:
 * indica el rol efectivo del usuario (para distinguir EDITOR de VIEWER).
 */
export interface AccessResult {
  /** Rol del usuario respecto al diagrama. */
  role: CollaboratorRole;
  /** True si el usuario es el owner del diagrama/workspace. */
  isOwner: boolean;
}

/**
 * Logica de negocio de la colaboracion en tiempo real.
 * Mantiene en memoria los documentos Yjs activos por diagrama y los
 * persiste en NeonDB cuando recibimos updates de los clientes.
 */
@Injectable()
export class RealtimeService {
  /**
   * Cache en memoria de los documentos Yjs por id de diagrama.
   * Evita recargar el Y.Doc desde la base de datos en cada update.
   */
  private readonly docs = new Map<string, Y.Doc>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida que el usuario tenga acceso al diagrama y devuelve su rol.
   * @param userId - Id del usuario autenticado (del JWT)
   * @param diagramId - Id del diagrama al que quiere unirse
   * @returns El rol efectivo del usuario (OWNER/EDITOR/VIEWER)
   * @throws ForbiddenException si el usuario no participa en el diagrama
   */
  async validateAccess(
    userId: string,
    diagramId: string,
  ): Promise<AccessResult> {
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

    // El owner del workspace tiene rol OWNER
    if (diagram.workspace.ownerId === userId) {
      return { role: CollaboratorRole.OWNER, isOwner: true };
    }

    // El resto debe ser colaborador del diagrama
    const collaborator = diagram.collaborators[0];
    if (!collaborator) {
      throw new ForbiddenException('No tienes acceso a este diagrama');
    }

    return { role: collaborator.role, isOwner: false };
  }

  /**
   * Verifica que el usuario pueda editar (persistir updates) en el diagrama.
   * Los VIEWER solo observan; no pueden enviar cambios.
   * @param userId - Id del usuario autenticado
   * @param diagramId - Id del diagrama
   * @throws ForbiddenException si el usuario es VIEWER o no tiene acceso
   */
  async assertCanEdit(userId: string, diagramId: string): Promise<void> {
    const access = await this.validateAccess(userId, diagramId);
    if (access.role === CollaboratorRole.VIEWER) {
      throw new ForbiddenException(
        'No tienes permisos para editar este diagrama',
      );
    }
  }

  /**
   * Obtiene (o crea) el Y.Doc en memoria de un diagrama.
   * La primera vez, lo carga desde el campo yjsDocument de NeonDB.
   * @param diagramId - Id del diagrama
   * @returns El Y.Doc compartido del diagrama
   */
  async getDoc(diagramId: string): Promise<Y.Doc> {
    let doc = this.docs.get(diagramId);

    if (!doc) {
      doc = new Y.Doc();
      // Carga el estado guardado previamente (bytes) en el documento nuevo
      const diagram = await this.prisma.diagram.findUnique({
        where: { id: diagramId },
        select: { yjsDocument: true },
      });

      if (diagram && diagram.yjsDocument.length > 0) {
        Y.applyUpdate(doc, diagram.yjsDocument);
      }

      this.docs.set(diagramId, doc);
    }

    return doc;
  }

  /**
   * Aplica un update CRDT de Yjs al documento del diagrama y lo persiste
   * en NeonDB. El update llega desde un cliente que edito el lienzo.
   * @param diagramId - Id del diagrama
   * @param update - Bytes del update CRDT producido por el cliente
   */
  async applyUpdate(diagramId: string, update: Uint8Array): Promise<void> {
    const doc = await this.getDoc(diagramId);
    // Aplica el update al estado compartido en memoria
    Y.applyUpdate(doc, update);

    // Persiste el estado completo en NeonDB y refresca la ultima modificacion
    await this.prisma.diagram.update({
      where: { id: diagramId },
      data: {
        yjsDocument: Buffer.from(Y.encodeStateAsUpdate(doc)),
        lastModified: new Date(),
      },
    });
  }

  /**
   * Devuelve el estado inicial (snapshot) del diagrama para que el cliente
   * que se une construya su lienzo con el estado actualizado.
   * @param diagramId - Id del diagrama
   * @returns Los bytes del update que contienen el estado completo
   */
  async getSnapshot(diagramId: string): Promise<Uint8Array> {
    const doc = await this.getDoc(diagramId);
    return Y.encodeStateAsUpdate(doc);
  }

  /**
   * Libera el Y.Doc de memoria cuando la sala queda vacia.
   * @param diagramId - Id del diagrama
   */
  releaseDoc(diagramId: string): void {
    this.docs.delete(diagramId);
  }
}
