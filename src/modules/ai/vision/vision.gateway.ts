/**
 * Gateway hacia el microservicio vision->DSL (deploy/ia-diagram-json).
 *
 * Llama al Space de Hugging Face con multipart (campo "file" y "esquema"
 * opcional) y devuelve el DSL canonico { entidades, relaciones } tal como lo
 * emite el Space. La validacion de ese JSON no vive aqui sino en el servicio
 * (dsl/validate.ts), siguiendo el desacople del ModelGateway.
 */
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Archivo de imagen ya recibido por Express (forma de Multer en memoria). */
export interface ArchivoImagen {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

/** Error interno de comunicacion con el microservicio de vision. */
export class VisionGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VisionGatewayError';
  }
}

/**
 * Servicio de acceso al microservicio vision->DSL. Desacopla al servicio de
 * la eleccion de Space (url configurable con DIAGRAMA_VISION_URL).
 */
@Injectable()
export class VisionGateway {
  private readonly base: string;
  private readonly timeoutMs: number;
  /** Token de lectura del Space (requerido solo si es privado). */
  private readonly hfToken: string;

  constructor(private readonly config: ConfigService) {
    this.base = (config.get<string>('DIAGRAMA_VISION_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    this.timeoutMs = Number(
      config.get<string>('AI_HTTP_TIMEOUT_MS') ?? '120000',
    );
    this.hfToken = config.get<string>('HF_TOKEN') ?? '';
  }

  /**
   * Envia la imagen al microservicio y devuelve el DSL canónico crudo.
   * @param file - Archivo de imagen recibido por multer
   * @param esquema - JSON Schema opcional que limita la salida del modelo
   * @returns El cuerpo JSON parseado ({ entidades, relaciones })
   * @throws ServiceUnavailableException si no se configuro DIAGRAMA_VISION_URL
   * @throws VisionGatewayError si el Space no respondio correctamente
   */
  async extraerDiagrama(
    file: ArchivoImagen,
    esquema?: string,
  ): Promise<unknown> {
    if (!this.base) {
      throw new ServiceUnavailableException(
        'El microservicio de vision no esta configurado. Revisa DIAGRAMA_VISION_URL en el .env.',
      );
    }

    const formulario = new FormData();
    formulario.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], {
        type: file.mimetype.startsWith('image/') ? file.mimetype : 'image/png',
      }),
      file.originalname || 'diagrama.png',
    );
    if (esquema !== undefined && esquema !== '') {
      formulario.append('esquema', esquema);
    }

    const encabezados: Record<string, string> = {};
    if (this.hfToken) {
      encabezados['Authorization'] = `Bearer ${this.hfToken}`;
    }

    const respuesta = await fetch(`${this.base}/api/diagram-to-json`, {
      method: 'POST',
      headers: encabezados,
      body: formulario,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!respuesta.ok) {
      throw new VisionGatewayError(
        `El microservicio de vision no acepto la peticion (${respuesta.status}). Verifica el espacio y el HF_TOKEN.`,
      );
    }
    const cuerpo = (await respuesta.json()) as Record<string, unknown>;
    // El Space devuelve { status_code, error } ante un fallo interno
    if (
      typeof cuerpo.status_code === 'number' &&
      typeof cuerpo.error === 'string'
    ) {
      throw new VisionGatewayError(
        `El microservicio de vision fallo: ${cuerpo.error}`,
      );
    }
    return cuerpo;
  }
}
