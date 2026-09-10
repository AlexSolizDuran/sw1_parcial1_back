import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CollaboratorRole } from '@prisma/client';

/**
 * Cuerpo de la peticion POST /diagrams/:id/collaborators.
 * Invita a un usuario (por username o email) a colaborar en un diagrama.
 * El rol por defecto es VIEWER (solo lectura) si no se especifica.
 */
export class AddCollaboratorDto {
  /** Username o email del usuario a invitar. */
  @IsString({ message: 'El usuario no es valido' })
  identifier: string;

  /** Rol a asignar (EDITOR | VIEWER). Por defecto VIEWER. */
  @IsOptional()
  @IsEnum(CollaboratorRole, {
    message: 'El rol debe ser EDITOR o VIEWER',
  })
  role?: CollaboratorRole;
}
