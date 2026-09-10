import { IsEnum } from 'class-validator';
import { CollaboratorRole } from '@prisma/client';

/**
 * Cuerpo de la peticion PATCH /diagrams/:id/collaborators/:userId.
 * Actualiza el permiso de un colaborador (EDITOR para editar, VIEWER para solo leer).
 */
export class UpdateCollaboratorRoleDto {
  /** Nuevo rol a asignar. */
  @IsEnum(CollaboratorRole, {
    message: 'El rol debe ser EDITOR o VIEWER',
  })
  role: CollaboratorRole;
}
