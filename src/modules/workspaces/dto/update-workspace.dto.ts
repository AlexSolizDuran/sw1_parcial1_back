import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Cuerpo de la peticion PATCH /workspaces/:id.
 * Permite renombrar un workspace.
 */
export class UpdateWorkspaceDto {
  /** Nuevo nombre visible del workspace. */
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(255, { message: 'El nombre no puede superar 255 caracteres' })
  name?: string;
}
