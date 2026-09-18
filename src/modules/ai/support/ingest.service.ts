/**
 * Servicio de ingesta del RAG: vectoriza el MANUAL y lo guarda en
 * help_chunks. Idempotente por hash: si el manual no cambio, no re-escribe.
 * Se ejecuta con `npm run ingest:help` (script manual tras editar el manual).
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EMBEDDING_DIMS, EmbeddingsService } from './embeddings.service';
import { MANUAL, manualHash } from './support-manual';

/** Resumen de una corrida de ingesta. */
export interface ResumenIngesta {
  /** True si el manual cambio y se re-vectorizo. */
  actualizado: boolean;
  /** Chunks escritos (0 si no hubo cambios). */
  chunks: number;
  /** Hash del manual ingestado. */
  hash: string;
}

/** Clave del hash guardado en help_meta. */
const CLAVE_HASH = 'manual_hash';

/**
 * Servicio de ingesta del manual a pgvector.
 */
@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  /**
   * Vectoriza el MANUAL y lo persiste (solo si cambio).
   * @returns Resumen con actualizado/chunks/hash
   */
  async ingestar(): Promise<ResumenIngesta> {
    const hash = manualHash();
    const previo = await this.leerHash();
    if (previo === hash) {
      this.logger.log('Manual sin cambios, ingesta omitida.');
      return { actualizado: false, chunks: 0, hash };
    }

    const textos = MANUAL.map((e) => `${e.titulo}: ${e.pasos}`);
    const vectores = await this.embeddings.embed(textos);

    for (let i = 0; i < MANUAL.length; i++) {
      const entrada = MANUAL[i];
      const vector = vectores[i] ?? [];
      if (!entrada || vector.length !== EMBEDDING_DIMS) continue;
      const literal = `[${vector.join(',')}]`;
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO help_chunks (id, titulo, texto, embedding)
         VALUES ($1, $2, $3, $4::vector)
         ON CONFLICT (id) DO UPDATE SET titulo = $2, texto = $3, embedding = $4::vector`,
        entrada.id,
        entrada.titulo,
        `${entrada.titulo}: ${entrada.pasos}`,
        literal,
      );
    }
    await this.guardarHash(hash);
    this.logger.log(`Ingesta completa: ${MANUAL.length} chunks.`);
    return { actualizado: true, chunks: MANUAL.length, hash };
  }

  /** Lee el hash guardado de la ultima ingesta (null si nunca se corrio). */
  private async leerHash(): Promise<string | null> {
    try {
      const filas = await this.prisma.$queryRawUnsafe<Array<{ valor: string }>>(
        `SELECT valor FROM help_meta WHERE clave = $1`,
        CLAVE_HASH,
      );
      return filas[0]?.valor ?? null;
    } catch {
      // Tabla inexistente (migracion pendiente): se ingesta igual
      return null;
    }
  }

  /** Guarda el hash de la ingesta actual. */
  private async guardarHash(hash: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO help_meta (clave, valor) VALUES ($1, $2)
       ON CONFLICT (clave) DO UPDATE SET valor = $2`,
      CLAVE_HASH,
      hash,
    );
  }
}
