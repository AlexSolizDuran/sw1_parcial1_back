import {
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Cuerpo de POST /spring-boot/modules.
 * El frontend envia el snapshot del lienzo (reactFlowState) para que el
 * backend proyecte el diagrama al DSL canonico sin leer el store.
 */
export class GenerateModulesDto {
  /** Id del diagrama (se verifica acceso OWNER/EDITOR/VIEWER). */
  @IsUUID()
  diagramId: string;

  /** Estado observable del lienzo al momento del envio. */
  @IsObject()
  snapshot: Record<string, unknown>;

  /**
   * Paquete base Java (ej. com.ejemplo.tienda).
   * Cada tabla genera su carpeta: <packageBase>.<tabla>.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z]+(\.[a-z][a-z0-9]*)+$/, {
    message:
      'packageBase debe ser un paquete Java valido (ej. com.ejemplo.tienda)',
  })
  packageBase?: string = 'com.ejemplo.tienda';
}
