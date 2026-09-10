import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Cuerpo de la peticion POST /workspaces.
 * Contiene el nombre con el que se crea el workspace.
 */
export class CreateWorkspaceDto {
  /** Nombre visible del workspace. */
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(255, { message: 'El nombre no puede superar 255 caracteres' })
  name: string;
}
