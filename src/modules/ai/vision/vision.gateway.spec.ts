/**
 * Tests del VisionGateway: contrato HTTP con el microservicio vision->DSL.
 * Cubren configuracion faltante, éxito, estado HTTP no OK y el fallback de
 * error interno del propio Space ({ status_code, error }).
 *
 * @nestjs/config es ESM y jest corre en CommonJS: se mockea el modulo (misma
 * estrategia que embeddings.service.spec.ts).
 */
import { ServiceUnavailableException } from '@nestjs/common';

jest.mock('@nestjs/config', () => ({
  ConfigService: class {
    private readonly env: Record<string, string | undefined>;
    constructor(env: Record<string, string | undefined>) {
      this.env = env;
    }
    get(clave: string): string | undefined {
      return this.env[clave];
    }
  },
}));

import { ConfigService } from '@nestjs/config';
import {
  ArchivoImagen,
  VisionGateway,
  VisionGatewayError,
} from './vision.gateway';

const IMAGEN: ArchivoImagen = {
  originalname: 'diagrama.png',
  mimetype: 'image/png',
  buffer: Buffer.from('foto-falsa'),
  size: 11,
};

describe('VisionGateway', () => {
  const crearGateway = (env: Record<string, string | undefined>) =>
    new VisionGateway(new ConfigService(env));

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as { fetch?: unknown }).fetch;
  });

  it('lanza ServiceUnavailable si no esta configurado DIAGRAMA_VISION_URL', async () => {
    const gateway = crearGateway({ DIAGRAMA_VISION_URL: undefined });
    await expect(gateway.extraerDiagrama(IMAGEN)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('llama POST /api/diagram-to-json con multipart y devuelve el DSL', async () => {
    const gateway = crearGateway({
      DIAGRAMA_VISION_URL: 'https://usuario-ia-diagram-json.hf.space/',
      HF_TOKEN: 'hf_secreto',
    });
    const cuerpoEsperado = {
      entidades: [
        {
          id: 'n1',
          tipo: 'class',
          nombre: 'Cliente',
          atributos: [],
          metodos: [],
        },
      ],
      relaciones: [],
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(cuerpoEsperado),
    });

    const resultado = await gateway.extraerDiagrama(IMAGEN);

    expect(fetch).toHaveBeenCalledWith(
      'https://usuario-ia-diagram-json.hf.space/api/diagram-to-json',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer hf_secreto' },
      }),
    );
    expect(resultado).toEqual(cuerpoEsperado);
  });

  it('envia el esquema opcional dentro del formulario', async () => {
    const gateway = crearGateway({
      DIAGRAMA_VISION_URL: 'https://vision.hf.space',
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ entidades: [], relaciones: [] }),
    });

    await gateway.extraerDiagrama(IMAGEN, '{"type":"object"}');

    const llamadas = (global.fetch as jest.Mock).mock.calls as unknown as Array<
      Array<{ body?: FormData }>
    >;
    const cuerpo = llamadas[0][1];
    expect(cuerpo.body?.get('esquema')).toBe('{"type":"object"}');
    expect(cuerpo.body?.get('file')).toBeDefined();
  });

  it('lanza VisionGatewayError si el Status no es OK', async () => {
    const gateway = crearGateway({
      DIAGRAMA_VISION_URL: 'https://vision.hf.space',
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    });

    await expect(gateway.extraerDiagrama(IMAGEN)).rejects.toThrow(
      VisionGatewayError,
    );
  });

  it('lanza VisionGatewayError si el Space devuelve { status_code, error }', async () => {
    const gateway = crearGateway({
      DIAGRAMA_VISION_URL: 'https://vision.hf.space',
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ status_code: 500, error: 'OOM en el Space' }),
    });

    await expect(gateway.extraerDiagrama(IMAGEN)).rejects.toThrow(
      'El microservicio de vision fallo: OOM en el Space',
    );
  });
});
