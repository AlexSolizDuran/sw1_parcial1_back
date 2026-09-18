/**
 * Tests del retrieval RAG (pgvector).
 * Prisma y embeddings mockeados: se verifica orden, umbral 0.6 y
 * degradacion a [] si la DB falla. Sin red ni base de datos.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import { RetrievalService } from './retrieval.service';

// embeddings.service importa @nestjs/config (ESM): se mockea el modulo.
jest.mock('./embeddings.service', () => ({
  EmbeddingsService: class EmbeddingsServiceMock {},
}));

/** Monta el servicio con Prisma y embeddings mockeados. */
async function montar(
  filas:
    | Array<{ id: string; titulo: string; texto: string; similitud: number }>
    | Error,
  vector: number[] = [0.1, 0.2, 0.3],
): Promise<RetrievalService> {
  const prismaMock = {
    $queryRawUnsafe:
      filas instanceof Error
        ? jest.fn().mockRejectedValue(filas)
        : jest.fn().mockResolvedValue(filas),
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      RetrievalService,
      { provide: PrismaService, useValue: prismaMock },
      {
        provide: EmbeddingsService,
        useValue: { embed: jest.fn().mockResolvedValue([vector]) },
      },
    ],
  }).compile();
  return module.get<RetrievalService>(RetrievalService);
}

describe('RetrievalService', () => {
  it('devuelve top-3 ordenados sobre el umbral', async () => {
    const service = await montar([
      { id: 'a', titulo: 'A', texto: 'ta', similitud: 0.9 },
      { id: 'b', titulo: 'B', texto: 'tb', similitud: 0.45 },
      { id: 'c', titulo: 'C', texto: 'tc', similitud: 0.39 },
    ]);
    const res = await service.recuperar('pregunta');
    expect(res.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('filtra todo bajo el umbral 0.4', async () => {
    const service = await montar([
      { id: 'a', titulo: 'A', texto: 'ta', similitud: 0.35 },
    ]);
    expect(await service.recuperar('fotosintesis')).toEqual([]);
  });

  it('lanza si pgvector falla (el servicio usa el fallback manual)', async () => {
    const service = await montar(
      new Error('relation "help_chunks" does not exist'),
    );
    await expect(service.recuperar('pregunta')).rejects.toThrow(
      'relation "help_chunks" does not exist',
    );
  });
});
