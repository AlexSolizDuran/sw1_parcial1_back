/**
 * Representacion publica del usuario autenticado.
 * Se usa en las respuestas del auth para no exponer passwordHash ni campos internos.
 */
export class AuthUserEntity {
  /** Identificador unico del usuario. */
  id: string;

  /** Username unico del usuario. */
  username: string;

  /** Email unico del usuario. */
  email: string;

  /** Nombre visible del usuario. */
  name: string;

  constructor(partial: Partial<AuthUserEntity>) {
    Object.assign(this, partial);
  }
}
