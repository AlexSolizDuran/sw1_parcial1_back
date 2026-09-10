import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthUserEntity } from './entities/auth-user.entity';

/**
 * Logica de negocio de la autenticacion: registro, login y emision de JWT.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Registra un nuevo usuario y devuelve el token de acceso.
   * @param dto - Datos validados del registro
   * @returns El usuario creado y el JWT
   * @throws ConflictException si el username o email ya están registrados
   */
  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      const user = await this.prisma.user.create({
        data: {
          username: dto.username,
          email: dto.email,
          name: dto.name,
          passwordHash,
        },
      });

      return {
        access_token: await this.signToken(
          user.id,
          user.username,
          user.email,
          user.name,
        ),
        user: new AuthUserEntity({
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
        }),
      };
    } catch (error) {
      // Codigo P2002: violacion de restriccion unica (username o email duplicado)
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('El username o email ya está registrado');
      }
      throw error;
    }
  }

  /**
   * Login: el usuario ya fue verificado por la estrategia local.
   * @param user - Usuario autenticado adjuntado a la Request
   * @returns El JWT y el perfil del usuario
   */
  async login(user: {
    id: string;
    username: string;
    email: string;
    name: string;
  }) {
    return {
      access_token: await this.signToken(
        user.id,
        user.username,
        user.email,
        user.name,
      ),
      user: new AuthUserEntity({
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
      }),
    };
  }

  /**
   * Firma un token JWT con el payload del usuario.
   * @param sub - Id del usuario
   * @param username - Username del usuario
   * @param email - Email del usuario
   * @param name - Nombre visible del usuario
   * @returns Token JWT firmado con el secreto del .env
   */
  private async signToken(
    sub: string,
    username: string,
    email: string,
    name: string,
  ): Promise<string> {
    return this.jwt.signAsync(
      { sub, username, email, name },
      { secret: this.config.get<string>('JWT_SECRET'), expiresIn: '7d' },
    );
  }

  /**
   * Valida que un payload JWT corresponda a un usuario existente.
   * @param payload - Payload extraido del token
   * @returns Los datos publicos del usuario
   * @throws UnauthorizedException si el usuario fue eliminado
   */
  async validateUser(payload: { sub: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    return new AuthUserEntity({
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
    });
  }

  /**
   * Actualiza el perfil del usuario autenticado.
   * Puede cambiar el nombre, username y/o contrasena. La sesion JWT se mantiene activa.
   * @param userId - Id del usuario autenticado (req.user.sub)
   * @param dto - Campos opcionales a actualizar
   * @returns El perfil actualizado
   * @throws UnauthorizedException si la contrasena actual es incorrecta
   * @throws BadRequestException si falta la contrasena actual al cambiarla
   * @throws ConflictException si el username nuevo ya está en uso
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    // Datos a actualizar en la tabla users
    const data: { name?: string; username?: string; passwordHash?: string } =
      {};

    if (dto.name !== undefined) {
      data.name = dto.name;
    }

    // Si se quiere cambiar el username, validar unicidad
    if (dto.username !== undefined) {
      const existingUser = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (existingUser && existingUser.id !== user.id) {
        throw new ConflictException('El username ya está en uso');
      }
      data.username = dto.username;
    }

    // Si se quiere cambiar la contrasena, se exige la actual para confirmar identidad
    if (dto.newPassword !== undefined) {
      if (dto.currentPassword === undefined) {
        throw new BadRequestException(
          'Debes ingresar tu contrasena actual para cambiarla',
        );
      }

      const passwordValid = await bcrypt.compare(
        dto.currentPassword,
        user.passwordHash,
      );
      if (!passwordValid) {
        throw new UnauthorizedException('Contrasena actual incorrecta');
      }

      // Re-hashea la nueva contrasena y la persiste
      data.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    }

    // Si no hay nada que actualizar, devuelve el perfil actual
    if (Object.keys(data).length === 0) {
      return new AuthUserEntity({
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
      });
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    return new AuthUserEntity({
      id: updated.id,
      username: updated.username,
      email: updated.email,
      name: updated.name,
    });
  }
}
