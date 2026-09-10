import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { ChatRequestDto } from './dto/chat.dto';
import { CrearSesionDto } from './dto/crear-sesion.dto';

/**
 * Controlador del agente COPILOT.
 * Rutas bajo /ai, todas protegidas con JWT.
 *  - POST /ai/chat           respuesta completa (JSON)
 *  - POST /ai/chat/stream    respuesta en streaming (SSE) para el chat
 *  - GET  /ai/models         modelos disponibles
 *  - GET/POST /ai/sessions   sesiones del usuario
 *  - GET  /ai/sessions/:id/messages
 */
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * Procesa una instruccion y devuelve el resultado aplicable.
   * @param user - Usuario autenticado desde el JWT
   * @param dto - Instruccion, snapshot y seleccion
   * @returns Texto explicativo + acciones a aplicar (vista previa)
   */
  @Post('chat')
  chat(@CurrentUser() user: { sub: string }, @Body() dto: ChatRequestDto) {
    return this.aiService.chat(dto.diagramId, user.sub, dto);
  }

  /**
   * Igual que /chat pero en streaming Server-Sent Events.
   * Emite eventos { tipo: 'inicio' | 'token' | 'fin' | 'error' } como data: JSON.
   * @param res - Respuesta HTTP de Express para escribir el flujo SSE
   * @param user - Usuario autenticado desde el JWT
   * @param dto - Mismo cuerpo que /chat
   */
  @Post('chat/stream')
  async chatStream(
    @Res() res: Response,
    @CurrentUser() user: { sub: string },
    @Body() dto: ChatRequestDto,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const enviar = (evento: unknown) => {
      res.write(`data: ${JSON.stringify(evento)}\n\n`);
    };

    try {
      const resultado = await this.aiService.chat(dto.diagramId, user.sub, dto);

      enviar({
        tipo: 'inicio',
        sessionId: resultado.sessionId,
        rol: resultado.rol,
        puedeAplicar: resultado.puedeAplicar,
        cache: resultado.cache,
        modelo: resultado.modelo,
      });

      // Emite el texto por fragmentos para simular escritura del asistente
      for (const fragmento of partirTexto(resultado.texto, 96)) {
        enviar({ tipo: 'token', texto: fragmento });
      }

      enviar({
        tipo: 'fin',
        texto: resultado.texto,
        acciones: resultado.acciones,
        advertencias: resultado.advertencias,
        mensajeId: resultado.mensajeId,
      });
    } catch (error) {
      enviar({ tipo: 'error', mensaje: mensajeDeError(error) });
    } finally {
      res.end();
    }
  }

  /**
   * Lista los modelos disponibles para el chat.
   * @returns Arreglo con id/nombre de cada modelo
   */
  @Get('models')
  modelos() {
    return this.aiService.listarModelosPublico();
  }

  /**
   * Lista las sesiones COPILOT del usuario en un diagrama.
   * @param diagramId - Id del diagrama
   * @param user - Usuario autenticado desde el JWT
   * @returns Sesiones con cantidad de mensajes
   */
  @Get('sessions')
  sesiones(
    @Query('diagramId', new ParseUUIDPipe()) diagramId: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.aiService.misSesiones(diagramId, user.sub);
  }

  /**
   * Crea una sesion COPILOT nueva para un diagrama.
   * @param user - Usuario autenticado desde el JWT
   * @param dto - Id del diagrama
   * @returns La sesion creada
   */
  @Post('sessions')
  crearSesion(
    @CurrentUser() user: { sub: string },
    @Body() dto: CrearSesionDto,
  ) {
    return this.aiService.crearSesion(dto.diagramId, user.sub);
  }

  /**
   * Devuelve el historial de mensajes de una sesion.
   * @param id - Id de la sesion
   * @param user - Usuario autenticado desde el JWT
   * @returns Mensajes ordenados ascendentemente
   */
  @Get('sessions/:id/messages')
  mensajes(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.aiService.obtenerMensajes(id, user.sub);
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
  return error instanceof Error ? error.message : 'Error desconocido de la IA';
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
