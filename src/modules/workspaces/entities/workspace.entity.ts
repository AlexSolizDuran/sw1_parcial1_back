/**
 * Representacion publica de un workspace.
 * Se usa en las respuestas del modulo de workspaces.
 */
export class WorkspaceEntity {
  /** Identificador unico del workspace. */
  id: string;

  /** Nombre visible del workspace. */
  name: string;

  /** Fecha de creacion del workspace. */
  createdAt: Date;

  constructor(partial: Partial<WorkspaceEntity>) {
    Object.assign(this, partial);
  }
}
