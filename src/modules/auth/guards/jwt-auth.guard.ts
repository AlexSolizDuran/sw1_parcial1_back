import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard de autenticacion: protege rutas que requieren sesion JWT valida.
 * Extiende el AuthGuard de Passport con mensajes de error en espanol.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Personaliza el error 401 segun el motivo del fallo.
   * @returns el resultado de la autenticacion
   * @throws UnauthorizedException con mensajes claros
   */
  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw err instanceof Error
        ? err
        : new UnauthorizedException(
            'No autorizado o token invalido o expirado',
          );
    }
    return user;
  }
}
