import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorador de parametro que extrae el usuario autenticado de la Request.
 * Lo dejan ahi la estrategia local (login) o la estrategia jwt (rutas protegidas).
 * Uso: @CurrentUser() user: { sub: string }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: unknown }>();
    // Solo accede a request.user despues de pasar por un guard de autenticacion
    return (request?.user as { sub: string }) ?? null;
  },
);
