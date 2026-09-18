import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Cuerpo de la peticion PATCH /diagrams/:id.
 * Permite renombrar un diagrama y/o cambiar su grupo (CU-1.3).
 * Para quitar el grupo se envia group: null explicito.
 */
export class UpdateDiagramDto {
  /** Nuevo nombre visible del diagrama. */
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(255, { message: 'El nombre no puede superar 255 caracteres' })
  name?: string;

  /** Nuevo grupo de organizacion (null para quitarlo). */
  @IsOptional()
  @IsString({ message: 'El grupo debe ser texto' })
  @MaxLength(255, { message: 'El grupo no puede superar 255 caracteres' })
  group?: string | null;
}
