import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Cuerpo de la peticion POST /workspaces/:workspaceId/diagrams.
 * Contiene el nombre con el que se crea el diagrama (UC-1.5).
 */
export class CreateDiagramDto {
  /** Nombre visible del diagrama. */
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(255, { message: 'El nombre no puede superar 255 caracteres' })
  name: string;
}
