import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

/**
 * Configura y arranca la aplicacion NestJS.
 * Establece el prefijo global /api/v1, validacion de DTOs y CORS para el frontend.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Adapter Socket.IO: permite que los gateways usen la misma app HTTP
  app.useWebSocketAdapter(new IoAdapter(app));

  // Todas las rutas quedan bajo /api (sin versionado)
  app.setGlobalPrefix('api');

  // Habilita la lectura de cookies en las Request (JWT en HttpOnly)
  app.use(cookieParser());

  // Valida todos los DTOs y descarta campos no declarados
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Permite peticiones desde el frontend. En desarrollo se usan los orígenes
  // locales por defecto; en producción se configura CORS_ORIGIN con la(s)
  // URL(s) exacta(s) del frontend (separadas por coma). Nunca wildcard.
  const corsDefault = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : corsDefault;
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}
void bootstrap();
