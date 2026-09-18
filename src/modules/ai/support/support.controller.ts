import {
  Body,
  Controller,
  HttpException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SupportChatDto } from './dto/support-chat.dto';
import { SupportService } from './support.service';

/**
 * Controlador del agente SUPPORT (ayuda de uso).
 * Rutas bajo /ai/support, protegidas con JWT (cualquier rol, incluido
 * VIEWER: es solo lectura y no toca diagramas).
 *  - POST /ai/support/chat         respuesta completa (JSON)
 *  - POST /ai/support/chat/stream  respuesta en streaming (SSE)
 */
@Controller('ai/support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  /**
   * Responde una pregunta de uso de la plataforma.
   * @param dto - Pregunta + historial (localStorage del front)
   * @returns Texto de ayuda y modelo usado
   */
  @Post('chat')
  chat(@Body() dto: SupportChatDto) {
    return this.supportService.preguntar(dto);
  }

  /**
   * Igual que /chat pero en streaming Server-Sent Events.
   * Emite eventos { tipo: 'inicio' | 'token' | 'fin' | 'error' } como data: JSON.
   * @param res - Respuesta HTTP de Express para escribir el flujo SSE
   * @param dto - Mismo cuerpo que /chat
   */
  @Post('chat/stream')
  async chatStream(@Res() res: Response, @Body() dto: SupportChatDto) {
    // Sin @CurrentUser(): con @Res() nativo el guard JWT ya valido el token
    // (401 sin token) y el servicio no necesita el userId (stateless).
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const enviar = (evento: unknown) => {
      res.write(`data: ${JSON.stringify(evento)}\n\n`);
    };

    try {
      const resultado = await this.supportService.preguntar(dto);

      enviar({ tipo: 'inicio', modelo: resultado.modelo });

      // Emite el texto por fragmentos para simular escritura del asistente
      for (const fragmento of partirTexto(resultado.texto, 96)) {
        enviar({ tipo: 'token', texto: fragmento });
      }

      enviar({ tipo: 'fin', texto: resultado.texto });
    } catch (error) {
      enviar({ tipo: 'error', mensaje: mensajeDeError(error) });
    } finally {
      res.end();
    }
  }
}

/**
 * Extrae un mensaje legible de cualquier error.
 * Los errores de NestJS pueden ser strings u objetos { statusCode, message }.
 */
function mensajeDeError(error: unknown): string {
  if (error instanceof HttpException) {
    const cuerpo = error.getResponse();
    if (typeof cuerpo === 'string') return cuerpo;
    if (cuerpo && typeof cuerpo === 'object' && 'message' in cuerpo) {
      const mensaje = (cuerpo as { message?: unknown }).message;
      if (typeof mensaje === 'string') return mensaje;
      if (Array.isArray(mensaje)) return mensaje.map(String).join(', ');
    }
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : 'Error desconocido de la ayuda';
}

/**
 * Divide un texto en fragmentos de a lo sumo `max` caracteres
 * sin cortar palabras (para el streaming del chat).
 */
function partirTexto(texto: string, max: number): string[] {
  const palabras = texto.split(' ');
  const fragmentos: string[] = [];
  let actual = '';

  for (const palabra of palabras) {
    if (actual.length + palabra.length + 1 > max && actual !== '') {
      fragmentos.push(actual);
      actual = palabra;
    } else {
      actual = actual === '' ? palabra : `${actual} ${palabra}`;
    }
  }
  if (actual !== '') fragmentos.push(actual);
  return fragmentos.length > 0 ? fragmentos : [' '];
}
