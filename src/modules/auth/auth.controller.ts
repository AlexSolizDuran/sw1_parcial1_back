import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/** Nombre de la cookie HttpOnly que guarda el JWT. */
const ACCESS_TOKEN_COOKIE = 'access_token';

/** Duracion del JWT (7 dias), en milisegundos. */
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Controlador de autenticacion.
 * Registro (publico), login (publico), perfil (protegido) y logout (protegido).
 * El JWT se almacena en una cookie HttpOnly en lugar de devolverse en el body.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Registro publico de un nuevo usuario.
   * @param dto - Credenciales y datos del usuario
   * @param res - Respuesta express, permite fijar la cookie HttpOnly
   * @returns El perfil del usuario creado
   */
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { access_token, user } = await this.authService.register(dto);
    this.setAuthCookie(res, access_token);
    return { user };
  }

  /**
   * Login publico. La estrategia local valida las credenciales antes de emitir el token.
   * @param req - Request con el usuario autenticado en req.user
   * @param res - Respuesta express, permite fijar la cookie HttpOnly
   * @returns El perfil del usuario
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('local'))
  async login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { access_token, user } = await this.authService.login(
      req.user as never,
    );
    this.setAuthCookie(res, access_token);
    return { user };
  }

  /**
   * Actualiza el perfil del usuario autenticado.
   * El usuario puede cambiar su nombre y/o contrasena; la sesion se mantiene.
   * @param req - Request protegida por JWT
   * @param dto - Campos opcionales a actualizar
   * @returns El perfil actualizado
   */
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    const payload = req.user as { sub: string };
    return this.authService.updateProfile(payload.sub, dto);
  }

  /**
   * Cierra la sesion: invalida el token del lado del cliente.
   * Con JWT stateless basta con eliminar la cookie; el token expira por si solo.
   * @param req - Request protegida por JWT
   * @param res - Respuesta express, permite borrar la cookie
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  logout(@Res({ passthrough: true }) res: Response) {
    this.clearAuthCookie(res);
    return { message: 'Sesion cerrada correctamente' };
  }

  /**
   * Perfil del usuario autenticado.
   * @param req - Request protegida por JWT
   * @returns Datos publicos del usuario actual
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async profile(@Req() req: Request) {
    const payload = req.user as { sub: string };
    return this.authService.validateUser(payload);
  }

  /**
   * Guarda el JWT en una cookie HttpOnly, protegiendola de XSS.
   * @param res - Respuesta express
   * @param token - Token JWT firmado
   */
  private setAuthCookie(res: Response, token: string) {
    const produccion = process.env.NODE_ENV === 'production';
    res.cookie(ACCESS_TOKEN_COOKIE, token, {
      httpOnly: true,
      // En produccion el front (Vercel) y el backend (Render) son origenes
      // distintos: SameSite=None + Secure es obligatorio para que el
      // navegador envie la cookie en requests cross-site (fetch y Socket.IO).
      sameSite: produccion ? 'none' : 'lax',
      secure: produccion,
      maxAge: SESSION_MS,
      path: '/',
    });
  }

  /**
   * Elimina la cookie del JWT para cerrar la sesion.
   * @param res - Respuesta express
   */
  private clearAuthCookie(res: Response) {
    const produccion = process.env.NODE_ENV === 'production';
    res.clearCookie(ACCESS_TOKEN_COOKIE, {
      path: '/',
      sameSite: produccion ? 'none' : 'lax',
      secure: produccion,
    });
  }
}
