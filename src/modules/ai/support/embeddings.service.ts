/**
 * Servicio de embeddings para el RAG (Space propio, sin GPU ajena).
 * Llama al endpoint /api/vectorize del Space tienda-vector-engine
 * (BAAI/bge-m3, 1024 dims). Solo lo usan la ingesta y el retrieval,
 * nunca el front.
 */
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

/** Dimension de bge-m3 (columna vector(1024)). */
export const EMBEDDING_DIMS = 1024;

/**
 * Servicio de vectorizacion de textos (1 llamada por texto, en paralelo).
 */
@Injectable()
export class EmbeddingsService {
  /** Cache en memoria por hash de texto (la ingesta repite textos). */
  private readonly cache = new Map<string, number[]>();

  constructor(private readonly config: ConfigService) {}

  /**
   * Vectoriza una lista de textos en orden.
   * @param textos - Textos a vectorizar (no vacios)
   * @returns Un vector de 1024 dims por texto, en el mismo orden
   * @throws ServiceUnavailableException si falta la URL o falla el Space
   */
  async embed(textos: string[]): Promise<number[][]> {
    const base = (this.config.get<string>('EMBEDDINGS_API_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    if (!base) {
      throw new ServiceUnavailableException(
        'Falta EMBEDDINGS_API_URL: URL del Space de embeddings en el .env.',
      );
    }
    const token = this.config.get<string>('HF_TOKEN')?.trim() ?? '';

    const resultados: number[][] = Array.from(
      { length: textos.length },
      () => [],
    );
    const pendientes: Array<{ indice: number; texto: string }> = [];
    for (let i = 0; i < textos.length; i++) {
      const texto = textos[i] ?? '';
      const clave = createHash('sha256').update(texto).digest('hex');
      const hit = this.cache.get(clave);
      if (hit) {
        resultados[i] = hit;
      } else {
        pendientes.push({ indice: i, texto });
      }
    }
    if (pendientes.length === 0) return resultados;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // El Space vectoriza de a 1 texto: se paraleliza la tanda
    const vectores = await Promise.all(
      pendientes.map(async (p) => {
        const respuesta = await fetch(`${base}/api/vectorize`, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(120000),
          body: JSON.stringify({ text: p.texto }),
        });
        if (!respuesta.ok) {
          throw new ServiceUnavailableException(
            `Embeddings no disponibles (HTTP ${respuesta.status}). Verifica que el Space este corriendo.`,
          );
        }
        const cuerpo = (await respuesta.json()) as {
          embedding?: unknown;
        };
        if (!Array.isArray(cuerpo.embedding)) {
          throw new ServiceUnavailableException(
            'El Space no devolvio un embedding valido.',
          );
        }
        return cuerpo.embedding as number[];
      }),
    );

    for (let k = 0; k < pendientes.length; k++) {
      const vec = vectores[k] ?? [];
      if (vec.length !== EMBEDDING_DIMS) {
        throw new ServiceUnavailableException(
          `El Space devolvio ${vec.length} dims, se esperaban ${EMBEDDING_DIMS}.`,
        );
      }
      const p = pendientes[k];
      if (!p) continue;
      resultados[p.indice] = vec;
      const clave = createHash('sha256').update(p.texto).digest('hex');
      this.cache.set(clave, vec);
    }
    return resultados;
  }
}
