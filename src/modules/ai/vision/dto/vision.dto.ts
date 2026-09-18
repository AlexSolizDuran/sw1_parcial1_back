import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Cuerpo de POST /ai/diagram-from-image.
 *
 * El request viaja como multipart/form-data: la imagen en el campo "file" y el
 * resto como campos de formulario. Como los navegadores serializan a string,
 * `snapshot` es un JSON en texto que el servicio parsea de forma segura.
 */
export class ImportarImagenDto {
  /** Id del diagrama sobre el que se reemplaza el lienzo. */
  @IsUUID()
  diagramId: string;

  /**
   * Modo de aplicacion: por ahora solo "reemplazar" (el DSL de la imagen pasa
   * a ser el diagrama completo, estilo import XMI).
   */
  @IsOptional()
  @IsIn(['reemplazar'])
  modo = 'reemplazar';

  /** Estado observable del lienzo (reactFlowState) como JSON en texto. */
  @IsOptional()
  @IsString()
  @MaxLength(200000)
  snapshot?: string;

  /** JSON Schema opcional que se reenvia al microservicio de vision. */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  esquema?: string;
}
