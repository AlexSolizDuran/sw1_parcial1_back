import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Un par id + nueva posicion dentro del orden del workspace (UC-1.6).
 */
export class DiagramOrderItem {
  /** Id del diagrama a reordenar. */
  @IsUUID('all', { message: 'El id del diagrama no es valido' })
  id: string;

  /** Nueva posicion en la lista de diagramas. */
  @IsInt({ message: 'La posicion debe ser un entero' })
  @Min(0, { message: 'La posicion no puede ser negativa' })
  position: number;
}

/**
 * Cuerpo de la peticion PUT /workspaces/:workspaceId/diagrams/order.
 * Recibe la lista completa de diagramas del workspace con su nueva posicion.
 * Asi se persiste el orden que el usuario eligio al reorganizar (UC-1.6).
 */
export class ReorderDiagramsDto {
  /** Lista de diagramas con la nueva posicion de cada uno. */
  @IsArray({ message: 'El orden debe ser una lista' })
  @ArrayNotEmpty({ message: 'El orden no puede estar vacio' })
  @ValidateNested({ each: true })
  @Type(() => DiagramOrderItem)
  items: DiagramOrderItem[];
}
