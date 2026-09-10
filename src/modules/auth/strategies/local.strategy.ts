import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Estrategia local: valida credenciales (username + password) en el login.
 * Si son correctas, adjunta el usuario verificado a la Request.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({ usernameField: 'username' });
  }

  /**
   * Valida las credenciales del usuario contra la base de datos.
   * @param username - Username enviado en el login
   * @param password - Password en texto plano enviado en el login
   * @returns El usuario autenticado (sin passwordHash)
   * @throws UnauthorizedException si el usuario no existe o la password es incorrecta
   */
  async validate(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });

    if (!user) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
    };
  }
}
