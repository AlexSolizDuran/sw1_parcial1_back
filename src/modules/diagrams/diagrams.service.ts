import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CollaboratorRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDiagramDto } from './dto/create-diagram.dto';
import { UpdateDiagramDto } from './dto/update-diagram.dto';
import { UpdateDiagramStateDto } from './dto/update-diagram-state.dto';
import { ReorderDiagramsDto } from './dto/reorder-diagrams.dto';
import { DiagramEntity } from './entities/diagram.entity';

/**
 * Logica de negocio de los diagramas de clases UML.
 * Cubre UC-1.5 (crear diagrama y agregar al creador como OWNER) y
 * UC-1.6 (organizar diagramas: reordenar y renombrar).
 */
@Injectable()
export class DiagramsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea un diagrama dentro de un workspace (UC-1.5).
   * Asocia el usuario autenticado como OWNER en diagram_collaborators
   * e inicializa el Y.Doc vacio en yjsDocument.
   * @param workspaceId - Id del workspace donde se crea el diagrama
   * @param userId - Id del usuario autenticado (creador)
   * @param dto - Datos validados (nombre)
   * @returns El diagrama creado con el rol OWNER
   * @throws NotFoundException si el workspace no existe
   * @throws ForbiddenException si el usuario no es el owner del workspace
   */
  async create(workspaceId: string, userId: string, dto: CreateDiagramDto) {
    // Verifica que el workspace exista y pertenezca al usuario autenticado
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace no encontrado');
    }

    if (workspace.ownerId !== userId) {
      throw new ForbiddenException('No tienes acceso a este workspace');
    }

    // La posicion nueva va al final de la lista de diagramas del workspace
    const lastPosition = await this.prisma.diagram.aggregate({
      where: { workspaceId },
      _max: { position: true },
    });

    const nextPosition = (lastPosition._max.position ?? -1) + 1;

    // Crea el diagrama, el lienzo vacio y agrega al creador como OWNER
    const diagram = await this.prisma.$transaction(async (tx) => {
      const created = await tx.diagram.create({
        data: {
          name: dto.name,
          workspaceId,
          createdById: userId,
          position: nextPosition,
          // Yjs Document sin estado: el frontend lo inicializa al abrir el lienzo
          yjsDocument: Buffer.from([]),
        },
      });

      await tx.diagramCollaborator.create({
        data: {
          diagramId: created.id,
          userId,
          role: CollaboratorRole.OWNER,
        },
      });

      return created;
    });

    return new DiagramEntity({
      id: diagram.id,
      name: diagram.name,
      position: diagram.position,
      lastModified: diagram.lastModified,
      createdAt: diagram.createdAt,
      createdById: diagram.createdById,
      role: CollaboratorRole.OWNER,
    });
  }

  /**
   * Lista los diagramas de un workspace ordenados y agrupados (UC-1.6).
   * @param workspaceId - Id del workspace
   * @param userId - Id del usuario autenticado
   * @returns Lista de diagramas con su rol para el usuario
   * @throws NotFoundException si el workspace no existe
   * @throws ForbiddenException si el usuario no tiene acceso al workspace
   */
  async findAll(workspaceId: string, userId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace no encontrado');
    }

    if (workspace.ownerId !== userId) {
      throw new ForbiddenException('No tienes acceso a este workspace');
    }

    const diagrams = await this.prisma.diagram.findMany({
      where: { workspaceId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        collaborators: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    return diagrams.map(({ collaborators, ...diagram }) => ({
      ...new DiagramEntity({
        id: diagram.id,
        name: diagram.name,
        position: diagram.position,
        lastModified: diagram.lastModified,
        createdAt: diagram.createdAt,
        createdById: diagram.createdById,
      }),
      role: collaborators[0]?.role ?? null,
    }));
  }

  /**
   * Obtiene un diagrama junto con su estado observable del lienzo para
   * reconstruirlo al abrir el editor (edicion local).
   * @param id - Id del diagrama
   * @param userId - Id del usuario autenticado
   * @returns El diagrama con su reactFlowState y el rol del usuario
   * @throws NotFoundException si el diagrama no existe
   * @throws ForbiddenException si el usuario no es el owner del workspace
   */
  async findOne(id: string, userId: string) {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id },
      include: {
        workspace: { select: { ownerId: true } },
        collaborators: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    // Acceso: el owner del workspace o cualquier colaborador (EDITOR/VIEWER)
    // puede ver (y cargar) el diagrama.
    if (
      diagram.workspace.ownerId !== userId &&
      diagram.collaborators.length === 0
    ) {
      throw new ForbiddenException('No tienes acceso a este diagrama');
    }

    return {
      ...new DiagramEntity({
        id: diagram.id,
        name: diagram.name,
        position: diagram.position,
        lastModified: diagram.lastModified,
        createdAt: diagram.createdAt,
        createdById: diagram.createdById,
      }),
      role: diagram.collaborators[0]?.role ?? null,
      reactFlowState: diagram.reactFlowState,
    };
  }

  /**
   * Persiste el estado observable del lienzo (nodos y aristas) y refresca
   * la fecha de ultima modificacion (edicion local).
   * @param id - Id del diagrama
   * @param userId - Id del usuario autenticado
   * @param dto - Estado reactFlowState a guardar
   * @returns El diagrama actualizado
   * @throws NotFoundException si el diagrama no existe
   * @throws ForbiddenException si el usuario no es el owner del workspace
   */
  async updateState(id: string, userId: string, dto: UpdateDiagramStateDto) {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id },
      include: {
        workspace: { select: { ownerId: true } },
        collaborators: { where: { userId }, select: { role: true } },
      },
    });

    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    // El owner del workspace o un colaborador EDITOR pueden persistir el lienzo.
    const isWorkspaceOwner = diagram.workspace.ownerId === userId;
    const collaborator = diagram.collaborators[0];
    const isEditor = collaborator?.role === CollaboratorRole.EDITOR;

    if (!isWorkspaceOwner && !isEditor) {
      throw new ForbiddenException(
        'No tienes permisos para editar este diagrama',
      );
    }

    const updated = await this.prisma.diagram.update({
      where: { id },
      data: {
        // Se castea el JSON al tipo que espera Prisma (InputJsonValue)
        reactFlowState: dto.reactFlowState as unknown as Prisma.InputJsonValue,
        lastModified: new Date(),
      },
    });

    return new DiagramEntity({
      id: updated.id,
      name: updated.name,
      position: updated.position,
      lastModified: updated.lastModified,
      createdAt: updated.createdAt,
      createdById: updated.createdById,
    });
  }

  /**
   * Lista los diagramas en los que el usuario es colaborador (no owner).
   * Busca en diagram_collaborators los registros del usuario con rol
   * EDITOR o VIEWER y devuelve cada diagrama junto con su workspace.
   * @param userId - Id del usuario autenticado
   * @returns Lista de diagramas compartidos con su rol y workspace
   */
  async findShared(userId: string) {
    const collaborations = await this.prisma.diagramCollaborator.findMany({
      where: {
        userId,
        // Excluye OWNER: solo interesan los diagramas a los que fue invitado
        role: { not: CollaboratorRole.OWNER },
      },
      include: {
        diagram: {
          include: {
            workspace: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    return collaborations.map(({ role, diagram }) => ({
      ...new DiagramEntity({
        id: diagram.id,
        name: diagram.name,
        position: diagram.position,
        lastModified: diagram.lastModified,
        createdAt: diagram.createdAt,
        createdById: diagram.createdById,
        workspaceName: diagram.workspace.name,
        workspaceId: diagram.workspace.id,
      }),
      role,
    }));
  }

  /**
   * Reordena los diagramas de un workspace persistiendo la nueva posicion (UC-1.6).
   * @param workspaceId - Id del workspace
   * @param userId - Id del usuario autenticado
   * @param dto - Lista de diagramas con su nueva posicion
   * @returns La lista de diagramas ya reordenada
   * @throws NotFoundException si el workspace no existe
   * @throws ForbiddenException si el usuario no es el owner del workspace
   */
  async reorder(workspaceId: string, userId: string, dto: ReorderDiagramsDto) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace no encontrado');
    }

    if (workspace.ownerId !== userId) {
      throw new ForbiddenException('Solo el owner puede ordenar los diagramas');
    }

    // Aplica cada posicion en una transaccion para que el orden quede consistente
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.diagram.update({
          where: { id: item.id },
          data: { position: item.position },
        }),
      ),
    );

    return this.findAll(workspaceId, userId);
  }

  /**
   * Renombra un diagrama (UC-1.6).
   * @param id - Id del diagrama
   * @param userId - Id del usuario autenticado
   * @param dto - Campos opcionales a actualizar
   * @returns El diagrama actualizado
   * @throws NotFoundException si el diagrama no existe
   * @throws ForbiddenException si el usuario no participa en el diagrama
   */
  async update(id: string, userId: string, dto: UpdateDiagramDto) {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id },
      include: {
        workspace: true,
        collaborators: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    // Solo el owner del workspace (o collaborador con rol) puede organizar
    if (
      diagram.workspace.ownerId !== userId &&
      diagram.collaborators.length === 0
    ) {
      throw new ForbiddenException('No tienes acceso a este diagrama');
    }

    const updated = await this.prisma.diagram.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
      },
    });

    return new DiagramEntity({
      id: updated.id,
      name: updated.name,
      position: updated.position,
      lastModified: updated.lastModified,
      createdAt: updated.createdAt,
      createdById: updated.createdById,
      role: diagram.collaborators[0]?.role ?? null,
    });
  }

  /**
   * Elimina un diagrama junto con sus colaboradores y sesiones de IA.
   * Solo el owner del workspace, o un colaborador con rol EDITOR/OWNER, pueden hacerlo.
   * @param id - Id del diagrama
   * @param userId - Id del usuario autenticado
   * @returns Un mensaje de confirmacion
   * @throws NotFoundException si el diagrama no existe
   * @throws ForbiddenException si el usuario no tiene permisos para eliminar
   */
  async remove(id: string, userId: string) {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id },
      include: {
        workspace: { select: { ownerId: true } },
        collaborators: { where: { userId }, select: { role: true } },
      },
    });

    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    // Permisos: el owner del workspace o un colaborador (EDITOR/OWNER) pueden eliminar
    const isWorkspaceOwner = diagram.workspace.ownerId === userId;
    const collaborator = diagram.collaborators[0];
    const canDelete =
      isWorkspaceOwner ||
      collaborator?.role === CollaboratorRole.EDITOR ||
      collaborator?.role === CollaboratorRole.OWNER;

    if (!canDelete) {
      throw new ForbiddenException(
        'No tienes permisos para eliminar este diagrama',
      );
    }

    // Prisma elimina en cascada los colaboradores y sesiones de IA asociadas
    await this.prisma.diagram.delete({ where: { id } });

    return { message: 'Diagrama eliminado correctamente' };
  }
}
