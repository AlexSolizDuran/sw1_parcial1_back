import { Type } from 'class-transformer';
import {
  isBoolean,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Parametros de generacion opcionales (/params temperatura=0.3 max_tokens=256).
 * Se fusionan con los defaults del modelo en ModelService.
 */
export class ParametrosModeloDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1)
  temperatura?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1)
  topP?: number;

  @IsOptional()
  @IsInt()
  @Min(32)
  @Max(4096)
  maxTokens?: number;
}

/**
 * Cuerpo de POST /ai/chat.
 * El frontend siempre adjunta el snapshot (reactFlowState) para que el backend
 * proyecte el diagrama al DSL sin confiar en datos del store.
 */
export class ChatRequestDto {
  /** Id del diagrama sobre el que se trabaja. */
  @IsUUID()
  diagramId: string;

  /** Sesion existente; si no se manda, se reutiliza/crea la ultima COPILOT. */
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  /** Instruccion del usuario en espanol. */
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  instruccion: string;

  /** "agregar": edita sobre lo actual; "reemplazar": construye desde cero. */
  @IsOptional()
  @IsIn(['agregar', 'reemplazar'])
  modo: 'agregar' | 'reemplazar' = 'agregar';

  /** Id del modelo a usar (default en AI_DEFAULT_MODEL). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  modelo?: string;

  /** Parametros de generacion opcionales. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ParametrosModeloDto)
  params?: ParametrosModeloDto;

  /** Estado observable del lienzo (reactFlowState) en el momento del envio. */
  @IsObject()
  snapshot: Record<string, unknown>;

  /** Id real del elemento seleccionado (alcance restrictivo). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  seleccionId?: string;

  /** Tipo del elemento seleccionado. */
  @IsOptional()
  @IsIn(['entidad', 'relacion'])
  seleccionKind?: 'entidad' | 'relacion';

  /** Si es true, incluye los últimos 3 mensajes USER + 3 ASSISTANT como contexto. */
  @IsOptional()
  @IsBoolean()
  conContexto?: boolean = true;

  @IsOptional()
  @IsBoolean()
  seleccionRestrictiva?: boolean = false;
}
