import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

/**
 * Interface del payload incluido en el JWT.
 */
export interface JwtPayload {
  /** Id del usuario autenticado. */
  sub: string;
  /** Email del usuario autenticado. */
  email: string;
  /** Nombre visible del usuario. */
  name: string;
}

/**
 * Estrategia JWT: valida el Bearer token de las rutas protegidas.
 * El payload verificado queda disponible en req.user para los controllers.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      // El token se lee de la cookie HttpOnly access_token; si no existe,
      // se permite el header Authorization: Bearer como alternativa (curl, scripts)
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) =>
          (req?.cookies?.access_token as string | undefined) ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  /**
   * Devuelve el payload ya verificado para adjuntarlo a la Request.
   * @param payload - Payload del token validado
   * @returns El payload en la forma en que se inyectara en req.user
   */
  validate(payload: JwtPayload): JwtPayload {
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
    };
  }
}
