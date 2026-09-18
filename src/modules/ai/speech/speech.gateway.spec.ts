/**
 * Tests del SpeechGateway: contrato HTTP con el motor voz->texto.
 * Cubren configuracion faltante, exito, estado HTTP no OK y el fallback de
 * error interno del propio Space ({ status_code, error }).
 *
 * @nestjs/config es ESM y jest corre en CommonJS: se mockea el modulo (misma
 * estrategia que vision.gateway.spec.ts y embeddings.service.spec.ts).
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
  ArchivoAudio,
  SpeechGateway,
  SpeechGatewayError,
} from './speech.gateway';

const AUDIO: ArchivoAudio = {
  originalname: 'nota.webm',
  mimetype: 'audio/webm',
  buffer: Buffer.from('audio-falso'),
  size: 11,
};

describe('SpeechGateway', () => {
  const crearGateway = (env: Record<string, string | undefined>) =>
    new SpeechGateway(new ConfigService(env));

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as { fetch?: unknown }).fetch;
  });

  it('lanza ServiceUnavailable si no esta configurado STT_URL', async () => {
    const gateway = crearGateway({ STT_URL: undefined });
    await expect(gateway.transcribir(AUDIO)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('llama POST /api/transcribe con multipart y devuelve el texto', async () => {
    const gateway = crearGateway({
      STT_URL: 'https://alexsolizduran-ia-voztotext.hf.space',
      HF_TOKEN: 'hf_secreto',
    });
    const cuerpoEsperado = { text: 'Hola, crea una clase usuario' };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(cuerpoEsperado),
    });

    const resultado = await gateway.transcribir(AUDIO);

    expect(fetch).toHaveBeenCalledWith(
      'https://alexsolizduran-ia-voztotext.hf.space/api/transcribe',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer hf_secreto' },
      }),
    );
    expect(resultado).toEqual(cuerpoEsperado);
  });

  it('envia file y temperature (por defecto 0.2) en el formulario', async () => {
    const gateway = crearGateway({
      STT_URL: 'https://alexsolizduran-ia-voztotext.hf.space',
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ text: 'ok' }),
    });

    await gateway.transcribir(AUDIO, 0.2);

    const llamadas = (global.fetch as jest.Mock).mock.calls as unknown as Array<
      Array<{ body?: FormData }>
    >;
    const cuerpo = llamadas[0][1];
    expect(cuerpo.body?.get('temperature')).toBe('0.2');
    expect(cuerpo.body?.get('file')).toBeDefined();
  });

  it('lanza SpeechGatewayError si el Status no es OK', async () => {
    const gateway = crearGateway({
      STT_URL: 'https://alexsolizduran-ia-voztotext.hf.space',
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve({}),
    });

    await expect(gateway.transcribir(AUDIO)).rejects.toThrow(
      SpeechGatewayError,
    );
  });

  it('lanza SpeechGatewayError si el Space devuelve { status_code, error }', async () => {
    const gateway = crearGateway({
      STT_URL: 'https://alexsolizduran-ia-voztotext.hf.space',
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ status_code: 500, error: 'OOM en el Space' }),
    });

    await expect(gateway.transcribir(AUDIO)).rejects.toThrow(
      'El motor de voz a texto fallo: OOM en el Space',
    );
  });

  it('lanza SpeechGatewayError si el texto no es un string', async () => {
    const gateway = crearGateway({
      STT_URL: 'https://alexsolizduran-ia-voztotext.hf.space',
    });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ text: 42 }),
    });

    await expect(gateway.transcribir(AUDIO)).rejects.toThrow(
      SpeechGatewayError,
    );
  });
});
