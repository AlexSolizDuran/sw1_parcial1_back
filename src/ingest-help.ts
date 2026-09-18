/**
 * CLI de ingesta del RAG: `npm run ingest:help`.
 * Levanta el contexto Nest (Config + Prisma), vectoriza el MANUAL con
 * HF Inference API y lo guarda en help_chunks. Idempotente por hash.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IngestService } from './modules/ai/support/ingest.service';

/** Ejecuta la ingesta y cierra el contexto. */
async function main(): Promise<void> {
  const ctx = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const ingest = ctx.get(IngestService);
    const resumen = await ingest.ingestar();
    if (resumen.actualizado) {
      console.log(
        `Ingesta OK: ${resumen.chunks} chunks (hash ${resumen.hash.slice(0, 8)}).`,
      );
    } else {
      console.log('Sin cambios: ingesta omitida.');
    }
  } finally {
    await ctx.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    'Ingesta fallida:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
