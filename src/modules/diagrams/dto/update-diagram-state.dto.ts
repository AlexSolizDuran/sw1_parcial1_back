import { IsObject } from 'class-validator';

/**
 * Cuerpo de la peticion PUT /diagrams/:id/state.
 * Persiste el estado observable del lienzo (nodos y aristas de React Flow).
 * Se guarda como JSON en la columna reactFlowState.
 */
export class UpdateDiagramStateDto {
  /** Estado del lienzo: { nodes, edges } serializado por el frontend. */
  @IsObject({ message: 'El reactFlowState debe ser un objeto' })
  reactFlowState: Record<string, unknown>;
}
