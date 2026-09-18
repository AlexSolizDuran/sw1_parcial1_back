/**
 * Servicio de retrieval del RAG (pgvector en NeonDB).
 * Dada una pregunta, devuelve los chunks mas parecidos del manual.
 * Los fallos de infra (Space caido, tabla ausente) se PROPAGAN para que el
 * SupportService caiga al manual completo; solo la falta de cobertura
 * (todo bajo el umbral) devuelve [] y redirecciona.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';

/** Chunk recuperado con su similitud coseno (1 = identico). */
export interface ChunkRecuperado {
  id: string;
  titulo: string;
  texto: string;
  similitud: number;
}

/** Fila cruda de help_chunks (via $queryRaw, tipada por generico). */
interface ChunkRow {
  id: string;
  titulo: string;
  texto: string;
  similitud: number;
}

/** Cuantos chunks inyectar al prompt. */
export const TOP_K = 3;

/** Similitud minima: debajo se responde redireccion (no alucinacion).
 * Calibrado con bge-m3 real: match claro ~0.6, match parcial ~0.45,
 * ruido ~0.3. */
export const UMBRAL_SIMILITUD = 0.4;

/**
 * Servicio de recuperacion por similitud coseno (<=> de pgvector).
 */
@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  /**
   * Recupera los chunks mas parecidos a la pregunta.
   * @param pregunta - Pregunta del usuario
   * @returns Hasta TOP_K chunks con similitud >= UMBRAL, ordenados
   * @throws Si el Space o pgvector fallan (el servicio usa el fallback)
   */
  async recuperar(pregunta: string): Promise<ChunkRecuperado[]> {
    const [vector] = await this.embeddings.embed([pregunta]);
    if (!vector) return [];

    const literal = `[${vector.join(',')}]`;
    const filas = await this.prisma.$queryRawUnsafe<ChunkRow[]>(
      `SELECT id, titulo, texto, 1 - (embedding <=> $1::vector) AS similitud
       FROM help_chunks ORDER BY embedding <=> $1::vector LIMIT ${TOP_K}`,
      literal,
    );
    return filas
      .filter((f) => f.similitud >= UMBRAL_SIMILITUD)
      .map((f) => ({
        id: f.id,
        titulo: f.titulo,
        texto: f.texto,
        similitud: Number(f.similitud),
      }));
  }
}
