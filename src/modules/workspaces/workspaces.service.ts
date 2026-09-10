import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceEntity } from './entities/workspace.entity';

/**
 * Logica de negocio de los workspaces: CRUD completo (crear, listar, consultar, renombrar y eliminar).
 */
@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea un workspace con el usuario autenticado como Owner.
   * @param ownerId - Id del usuario autenticado
   * @param dto - Datos validados del workspace
   * @returns El workspace creado
   */
  async create(ownerId: string, dto: CreateWorkspaceDto) {
    const workspace = await this.prisma.workspace.create({
      data: {
        name: dto.name,
        ownerId,
      },
    });

    return new WorkspaceEntity({
      id: workspace.id,
      name: workspace.name,
      createdAt: workspace.createdAt,
    });
  }

  /**
   * Lista todos los workspaces del usuario autenticado.
   * @param ownerId - Id del usuario autenticado
   * @returns Lista de workspaces del usuario
   */
  async findAllByOwner(ownerId: string) {
    const workspaces = await this.prisma.workspace.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { diagrams: true } },
      },
    });

    return workspaces.map(({ _count, ...workspace }) => ({
      ...new WorkspaceEntity({
        id: workspace.id,
        name: workspace.name,
        createdAt: workspace.createdAt,
      }),
      diagramCount: _count.diagrams,
    }));
  }

  /**
   * Busca un workspace y verifica que pertenezca al usuario autenticado.
   * @param ownerId - Id del usuario autenticado
   * @param id - Id del workspace
   * @returns El workspace con sus diagramas
   * @throws NotFoundException si no existe
   * @throws ForbiddenException si no es del usuario
   */
  async findOne(ownerId: string, id: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
      include: {
        diagrams: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            lastModified: true,
            reactFlowState: true,
          },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace no encontrado');
    }

    if (workspace.ownerId !== ownerId) {
      throw new ForbiddenException('No tienes acceso a este workspace');
    }

    return {
      ...new WorkspaceEntity({
        id: workspace.id,
        name: workspace.name,
        createdAt: workspace.createdAt,
      }),
      // Diagramas del workspace, utiles para el flujo de creacion/organizacion (UC-1.5, UC-1.6)
      diagrams: workspace.diagrams.map((diagram) => ({
        id: diagram.id,
        name: diagram.name,
        lastModified: diagram.lastModified,
      })),
    };
  }

  /**
   * Renombra un workspace. Solo el owner puede hacerlo.
   * @param ownerId - Id del usuario autenticado
   * @param id - Id del workspace
   * @param dto - Nuevo nombre (opcional)
   * @returns El workspace actualizado
   * @throws NotFoundException si el workspace no existe
   * @throws ForbiddenException si el usuario no es el owner
   */
  async update(ownerId: string, id: string, dto: UpdateWorkspaceDto) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace no encontrado');
    }

    if (workspace.ownerId !== ownerId) {
      throw new ForbiddenException('Solo el owner puede modificar el workspace');
    }

    const updated = await this.prisma.workspace.update({
      where: { id },
      data: dto,
    });

    return new WorkspaceEntity({
      id: updated.id,
      name: updated.name,
      createdAt: updated.createdAt,
    });
  }

  /**
   * Elimina un workspace y, en cascada, sus diagramas y colaboradores.
   * Solo el owner puede hacerlo.
   * @param ownerId - Id del usuario autenticado
   * @param id - Id del workspace
   * @returns Un mensaje de confirmacion
   * @throws NotFoundException si el workspace no existe
   * @throws ForbiddenException si el usuario no es el owner
   */
  async remove(ownerId: string, id: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace no encontrado');
    }

    if (workspace.ownerId !== ownerId) {
      throw new ForbiddenException('Solo el owner puede eliminar el workspace');
    }

    // Prisma elimina en cascada los diagramas (y sus colaboradores) asociados
    await this.prisma.workspace.delete({ where: { id } });

    return { message: 'Workspace eliminado correctamente' };
  }
}
