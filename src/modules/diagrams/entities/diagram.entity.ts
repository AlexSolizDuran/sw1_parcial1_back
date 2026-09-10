/**
 * Representacion publica de un diagrama de clases UML.
 * Se usa en las respuestas del modulo de diagramas.
 */
export class DiagramEntity {
  /** Identificador unico del diagrama. */
  id: string;

  /** Nombre visible del diagrama. */
  name: string;

  /** Posicion en el orden de diagramas del workspace (UC-1.6). */
  position: number;

  /** Fecha de la ultima modificacion del diagrama. */
  lastModified: Date;

  /** Fecha de creacion del diagrama. */
  createdAt: Date;

  /** Id del usuario que lo creo. */
  createdById: string;

  /** Rol del usuario autenticado dentro de este diagrama. */
  role?: string;

  /** Nombre del workspace al que pertenece el diagrama. */
  workspaceName?: string;

  /** Id del workspace al que pertenece el diagrama (usado para navegar). */
  workspaceId?: string;

  constructor(partial: Partial<DiagramEntity>) {
    Object.assign(this, partial);
  }
}
