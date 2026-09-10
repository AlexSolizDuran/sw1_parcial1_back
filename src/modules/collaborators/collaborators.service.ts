import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CollaboratorRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AddCollaboratorDto } from './dto/add-collaborator.dto';
import { UpdateCollaboratorRoleDto } from './dto/update-collaborator-role.dto';

/**
 * Roles que un owner puede asignar a un colaborador invitado.
 * Se excluye OWNER porque solo puede existir uno (el creador del diagrama).
 */
const INVITABLE_ROLES: CollaboratorRole[] = [
  CollaboratorRole.EDITOR,
  CollaboratorRole.VIEWER,
];

/**
 * Logica de negocio de los colaboradores de un diagrama.
 * Permite que el owner invite usuarios por email, cambie sus permisos
 * (EDITOR/VIEWER) y los elimine. Solo el owner del diagrama gestiona esto.
 */
@Injectable()
export class CollaboratorsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Invita a un usuario (por username o email) a colaborar en un diagrama.
   * El rol por defecto es VIEWER (solo lectura); puede ser EDITOR (editar).
   * @param diagramId - Id del diagrama
   * @param actorId - Id del usuario que invita (debe ser el owner)
   * @param dto - Identifier (username o email) del invitado y rol opcional
   * @returns El colaborador creado/actualizado
   */
  async add(diagramId: string, actorId: string, dto: AddCollaboratorDto) {
    // Verifica que el actor sea el owner del diagrama
    await this.assertOwner(diagramId, actorId);

    const invitable = INVITABLE_ROLES.includes(
      dto.role ?? CollaboratorRole.VIEWER,
    );
    if (!invitable) {
      throw new BadRequestException('El rol debe ser EDITOR o VIEWER');
    }

    // Busca al usuario invitado por username O email
    const invited = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: dto.identifier }, { email: dto.identifier }],
      },
    });
    if (!invited) {
      throw new NotFoundException(
        `No existe un usuario con username o email ${dto.identifier}`,
      );
    }

    // No se puede invitar a si mismo (ya es el owner del diagrama)
    if (invited.id === actorId) {
      throw new BadRequestException('No puedes agregarte a ti mismo');
    }

    // Upsert: si ya era colaborador se actualiza el rol (evita PK duplicada)
    const collaborator = await this.prisma.diagramCollaborator.upsert({
      where: {
        diagramId_userId: { diagramId, userId: invited.id },
      },
      create: {
        diagramId,
        userId: invited.id,
        // Rol por defecto VIEWER; si se indica, el rol dado
        role: dto.role ?? CollaboratorRole.VIEWER,
      },
      update: {
        role: dto.role ?? CollaboratorRole.VIEWER,
      },
      include: {
        user: { select: { id: true, name: true, email: true, username: true } },
      },
    });

    return {
      id: collaborator.user.id,
      name: collaborator.user.name,
      email: collaborator.user.email,
      username: collaborator.user.username,
      role: collaborator.role,
    };
  }

  /**
   * Lista todos los colaboradores de un diagrama (sin incluir al owner).
   * @param diagramId - Id del diagrama
   * @param actorId - Id del usuario autenticado (debe ser el owner)
   * @returns Lista de colaboradores con sus datos y rol
   */
  async findAll(diagramId: string, actorId: string) {
    // Verifica que el actor tenga acceso (sea el owner o un colaborador)
    await this.assertAccess(diagramId, actorId);

    const collaborators = await this.prisma.diagramCollaborator.findMany({
      // Excluye al OWNER: el modal solo debe listar colaboradores invitados
      where: { diagramId, role: { not: CollaboratorRole.OWNER } },
      include: {
        user: { select: { id: true, name: true, email: true, username: true } },
      },
    });

    return collaborators.map((c) => ({
      id: c.user.id,
      name: c.user.name,
      email: c.user.email,
      username: c.user.username,
      role: c.role,
      assignedAt: c.assignedAt,
    }));
  }

  /**
   * Actualiza el permiso (rol) de un colaborador.
   * @param diagramId - Id del diagrama
   * @param collaboratorUserId - Id del colaborador cuyo rol se cambia
   * @param actorId - Id del usuario que hace el cambio (debe ser el owner)
   * @param dto - Nuevo rol (EDITOR | VIEWER)
   * @returns El colaborador con su nuevo rol
   */
  async updateRole(
    diagramId: string,
    collaboratorUserId: string,
    actorId: string,
    dto: UpdateCollaboratorRoleDto,
  ) {
    // Verifica que el actor sea el owner del diagrama
    await this.assertOwner(diagramId, actorId);

    if (!INVITABLE_ROLES.includes(dto.role)) {
      throw new BadRequestException('El rol debe ser EDITOR o VIEWER');
    }

    // El owner no puede cambiar su propio rol ni el de otros owners
    const collaborator = await this.prisma.diagramCollaborator.findUnique({
      where: { diagramId_userId: { diagramId, userId: collaboratorUserId } },
    });
    if (!collaborator) {
      throw new NotFoundException('El colaborador no existe en este diagrama');
    }
    if (collaborator.role === CollaboratorRole.OWNER) {
      throw new BadRequestException('No puedes cambiar el rol del owner');
    }

    const updated = await this.prisma.diagramCollaborator.update({
      where: { diagramId_userId: { diagramId, userId: collaboratorUserId } },
      data: { role: dto.role },
      include: {
        user: { select: { id: true, name: true, email: true, username: true } },
      },
    });

    return {
      id: updated.user.id,
      name: updated.user.name,
      email: updated.user.email,
      username: updated.user.username,
      role: updated.role,
    };
  }

  /**
   * Elimina a un colaborador de un diagrama.
   * @param diagramId - Id del diagrama
   * @param collaboratorUserId - Id del colaborador a eliminar
   * @param actorId - Id del usuario que elimina (debe ser el owner)
   * @returns Un mensaje de confirmacion
   */
  async remove(diagramId: string, collaboratorUserId: string, actorId: string) {
    // Verifica que el actor sea el owner del diagrama
    await this.assertOwner(diagramId, actorId);

    const collaborator = await this.prisma.diagramCollaborator.findUnique({
      where: { diagramId_userId: { diagramId, userId: collaboratorUserId } },
    });
    if (!collaborator) {
      throw new NotFoundException('El colaborador no existe en este diagrama');
    }
    if (collaborator.role === CollaboratorRole.OWNER) {
      throw new BadRequestException('No puedes eliminar al owner');
    }

    await this.prisma.diagramCollaborator.delete({
      where: { diagramId_userId: { diagramId, userId: collaboratorUserId } },
    });

    return { message: 'Colaborador eliminado correctamente' };
  }

  /**
   * Verifica que el usuario autenticado sea el owner del diagrama.
   * El owner es quien creo el diagrama (creado como OWNER al crearlo).
   * @param diagramId - Id del diagrama
   * @param actorId - Id del usuario autenticado
   */
  private async assertOwner(diagramId: string, actorId: string): Promise<void> {
    const collaborator = await this.prisma.diagramCollaborator.findUnique({
      where: { diagramId_userId: { diagramId, userId: actorId } },
    });

    if (!collaborator || collaborator.role !== CollaboratorRole.OWNER) {
      throw new ForbiddenException(
        'Solo el owner del diagrama puede gestionar colaboradores',
      );
    }
  }

  /**
   * Verifica que el usuario tenga acceso al diagrama (owner o colaborador).
   * Menos estricto que assertOwner: permite listar a cualquier participante.
   * @param diagramId - Id del diagrama
   * @param actorId - Id del usuario autenticado
   */
  private async assertAccess(
    diagramId: string,
    actorId: string,
  ): Promise<void> {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id: diagramId },
      include: { workspace: { select: { ownerId: true } } },
    });
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    if (diagram.workspace.ownerId === actorId) {
      return;
    }

    const collaborator = await this.prisma.diagramCollaborator.findUnique({
      where: { diagramId_userId: { diagramId, userId: actorId } },
    });
    if (!collaborator) {
      throw new ForbiddenException('No tienes acceso a este diagrama');
    }
  }
}
