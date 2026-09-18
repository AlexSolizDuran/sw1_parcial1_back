/**
 * Controlador de transcripcion de voz a texto (microfono del chat).
 * Expone POST /api/ai/voice-transcribe bajo la proteccion JWT del modulo ai.
 * El audio grabado en el navegador llega como multipart y se reenvia al motor
 * STT (Space de Hugging Face); no requiere diagrama, es un servicio generico.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { ArchivoAudio } from './speech.gateway';
import { SpeechGateway } from './speech.gateway';

/** Tamano maximo del audio subido (25 MB, suficiente para una nota de voz). */
const TAMANO_MAXIMO = 25 * 1024 * 1024;

/** Temperatura por defecto de Whisper (valor con el que se probo el Space). */
const TEMPERATURA_DEFECTO = 0.2;

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class SpeechController {
  constructor(private readonly speechGateway: SpeechGateway) {}

  /**
   * Transcribe un audio grabado por el microfono del navegador.
   * Recibe multipart/form-data: campo "file" (audio) y "temperature" opcional.
   * @param file - Audio subido (obligatorio)
   * @param temperature - Temperatura de muestreo (0-1, opcional)
   * @returns El texto transcrito: { text }
   */
  @Post('voice-transcribe')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: TAMANO_MAXIMO },
      fileFilter: (_request, file, callback) => {
        // El navegador puede reportar mimetype audio/* o, si no soporta
        // MediaRecorder con mime custom, application/octet-stream.
        if (
          file.mimetype.startsWith('audio/') ||
          file.mimetype === 'application/octet-stream'
        ) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException(
              'El archivo debe ser un audio (webm, mp4, ogg, wav...).',
            ),
            false,
          );
        }
      },
    }),
  )
  transcribir(
    @UploadedFile() file: ArchivoAudio | undefined,
    @Body('temperature') temperature?: string,
  ) {
    if (!file) {
      throw new BadRequestException(
        'El archivo de audio es obligatorio (campo "file").',
      );
    }
    const temperatura = Number(temperature);
    const valor =
      Number.isNaN(temperatura) || temperatura <= 0 || temperatura > 1
        ? TEMPERATURA_DEFECTO
        : temperatura;
    return this.speechGateway.transcribir(file, valor);
  }
}
