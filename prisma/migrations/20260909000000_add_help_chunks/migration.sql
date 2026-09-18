-- Tablas del RAG de ayuda (SUPPORT): chunks vectorizados del manual.
-- La columna embedding usa pgvector (384 dims = MiniLM multilingüe).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "help_chunks" (
  "id" TEXT PRIMARY KEY,
  "titulo" TEXT NOT NULL,
  "texto" TEXT NOT NULL,
  "embedding" vector(384) NOT NULL
);

-- Indice HNSW para búsqueda por similitud coseno (<=>)
CREATE INDEX IF NOT EXISTS "help_chunks_embedding_idx"
  ON "help_chunks" USING hnsw ("embedding" vector_cosine_ops);

-- Meta de ingesta (hash del manual para corridas idempotentes)
CREATE TABLE IF NOT EXISTS "help_meta" (
  "clave" TEXT PRIMARY KEY,
  "valor" TEXT NOT NULL
);
