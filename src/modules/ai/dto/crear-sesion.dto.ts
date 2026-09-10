import { IsUUID } from 'class-validator';

/**
 * Cuerpo de POST /ai/sessions.
 * Crea una sesion COPILOT nueva para el diagrama dado.
 */
export class CrearSesionDto {
  @IsUUID()
  diagramId: string;
}
