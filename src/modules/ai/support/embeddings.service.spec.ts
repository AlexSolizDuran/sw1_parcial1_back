/**
 * Tests del cliente del Space de embeddings (/api/vectorize).
 * fetch y @nestjs/config mockeados: se verifica payload, mapeo,
 * cache y errores. Sin red.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from './embeddings.service';

// @nestjs/config es ESM y jest corre en CommonJS: se mockea el modulo.
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigServiceMock {},
}));

/** Vector fake de 1024 dims. */
function fakeVector(valor: number): number[] {
  return Array.from({ length: 1024 }, () => valor);
}

describe('EmbeddingsService (Space /api/vectorize)', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Monta el servicio con la config dada y fetch mockeado. */
  async function montar(
    env: Record<string, string>,
    respuestas: number[][] | Error,
  ): Promise<EmbeddingsService> {
    (global.fetch as jest.Mock).mockImplementation(() => {
      if (respuestas instanceof Error) {
        return Promise.reject(respuestas);
      }
      const vec = respuestas.shift() ?? fakeVector(0);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ dimensions: 1024, embedding: vec }),
      });
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingsService,
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
      ],
    }).compile();
    return module.get<EmbeddingsService>(EmbeddingsService);
  }

  it('manda { text } por texto y devuelve vectores en orden', async () => {
    const service = await montar(
      { EMBEDDINGS_API_URL: 'https://x.hf.space/' },
      [fakeVector(0.1), fakeVector(0.2)],
    );
    const res = await service.embed(['uno', 'dos']);
    expect(res).toHaveLength(2);
    expect(res[0]?.length).toBe(1024);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const llamada = (global.fetch as jest.Mock).mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(llamada[0]).toBe('https://x.hf.space/api/vectorize');
    expect(JSON.parse(llamada[1].body) as { text: string }).toEqual({
      text: 'uno',
    });
  });

  it('usa la cache en la segunda llamada', async () => {
    const service = await montar({ EMBEDDINGS_API_URL: 'https://x.hf.space' }, [
      fakeVector(0.5),
    ]);
    await service.embed(['hola']);
    await service.embed(['hola']);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falla claro sin EMBEDDINGS_API_URL', async () => {
    const service = await montar({}, []);
    await expect(service.embed(['hola'])).rejects.toThrow(
      'Falta EMBEDDINGS_API_URL',
    );
  });
});
