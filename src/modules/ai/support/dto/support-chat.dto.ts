import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Un mensaje previo de la conversacion (viene del localStorage del front).
 * El front manda como maximo los ultimos 12.
 */
export class HistorialItemDto {
  /** Quien dijo el mensaje (USER o ASSISTANT). */
  @IsIn(['USER', 'ASSISTANT'])
  rol: 'USER' | 'ASSISTANT';

  /** Contenido del mensaje. */
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  contenido: string;
}

/**
 * Cuerpo de POST /ai/support/chat (y /chat/stream).
 * Stateless: el front guarda la sesion en su localStorage y manda los
 * ultimos 12 mensajes como contexto en cada peticion.
 */
export class SupportChatDto {
  /** Pregunta del usuario sobre el uso de la plataforma (1..1000). */
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1)
  @MaxLength(1000)
  pregunta: string;

  /** Ultimos mensajes de la conversacion (maximo 12, cronologicos). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => HistorialItemDto)
  historial?: HistorialItemDto[];
}
