import {
  IsArray,
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
 * Opcionalmente puede enviar `screens` (config CRUD por pantalla) para que
 * el proyecto Spring generado incluya un modulo por pantalla ademas del UML.
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

  /**
   * Config CRUD por pantalla (JSON de screens). Cada screen genera un modulo
   * en el proyecto Spring con sus rutas exactas. Formato libre: se valida
   * estructuralmente en el parser (screens/screens.parser.ts).
   */
  @IsOptional()
  @IsArray()
  screens?: unknown[];
}
