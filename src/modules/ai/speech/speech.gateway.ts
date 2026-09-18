/**
 * Gateway hacia el motor voz->texto (Space AlexSolizDuran/ia-voztotext).
 *
 * Llama al Space de Hugging Face con multipart (campo "file" con el audio y
 * "temperature" opcional) y devuelve el texto transcrito. El Space (Whisper
 * small, CPU) transcribe forzado a espanol y acepta audio en cualquier formato
 * que FFmpeg pueda decodificar (webm/opus, mp4/m4a, wav, ogg...).
 */
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Archivo de audio ya recibido por Express (forma de Multer en memoria). */
export interface ArchivoAudio {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

/** Error interno de comunicacion con el motor de voz->texto. */
export class SpeechGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpeechGatewayError';
  }
}

/** Respuesta esperada del Space (POST /api/transcribe). */
export interface TranscribeResultado {
  text: string;
}

/**
 * Servicio de acceso al motor voz->texto. Desacopla al controlador de la
 * eleccion de Space (url configurable con STT_URL).
 */
@Injectable()
export class SpeechGateway {
  private readonly base: string;
  private readonly timeoutMs: number;
  /** Token de lectura del Space (requerido solo si es privado). */
  private readonly hfToken: string;

  constructor(private readonly config: ConfigService) {
    this.base = (config.get<string>('STT_URL') ?? '').replace(/\/+$/, '');
    this.timeoutMs = Number(
      config.get<string>('AI_HTTP_TIMEOUT_MS') ?? '120000',
    );
    this.hfToken = config.get<string>('HF_TOKEN') ?? '';
  }

  /**
   * Envia el audio al motor y devuelve el texto transcrito.
   * @param file - Archivo de audio recibido por multer
   * @param temperature - Temperatura de muestreo de Whisper (por defecto 0.2)
   * @returns El texto transcrito (respuesta { text } del Space)
   * @throws ServiceUnavailableException si no se configuro STT_URL
   * @throws SpeechGatewayError si el Space no respondio correctamente
   */
  async transcribir(
    file: ArchivoAudio,
    temperature = 0.2,
  ): Promise<TranscribeResultado> {
    if (!this.base) {
      throw new ServiceUnavailableException(
        'El motor de voz a texto no esta configurado. Revisa STT_URL en el .env.',
      );
    }

    const formulario = new FormData();
    formulario.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], {
        type: file.mimetype.startsWith('audio/') ? file.mimetype : 'audio/webm',
      }),
      file.originalname || 'audio.webm',
    );
    formulario.append('temperature', String(temperature));

    const encabezados: Record<string, string> = {};
    if (this.hfToken) {
      encabezados['Authorization'] = `Bearer ${this.hfToken}`;
    }

    const respuesta = await fetch(`${this.base}/api/transcribe`, {
      method: 'POST',
      headers: encabezados,
      body: formulario,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!respuesta.ok) {
      throw new SpeechGatewayError(
        `El motor de voz a texto no acepto la peticion (${respuesta.status}). Verifica el espacio y el HF_TOKEN.`,
      );
    }
    const cuerpo = (await respuesta.json()) as Record<string, unknown>;
    // El Space devuelve { status_code, error } ante un fallo interno
    if (
      typeof cuerpo.status_code === 'number' &&
      typeof cuerpo.error === 'string'
    ) {
      throw new SpeechGatewayError(
        `El motor de voz a texto fallo: ${cuerpo.error}`,
      );
    }
    if (typeof cuerpo.text !== 'string') {
      throw new SpeechGatewayError(
        'El motor de voz a texto no devolvio un texto valido.',
      );
    }
    return { text: cuerpo.text };
  }
}
