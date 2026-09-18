-- El Space de embeddings usa BAAI/bge-m3 (1024 dims, no 384).
-- help_chunks esta vacia (la ingesta nunca corrio), el ALTER es seguro.

DROP INDEX IF EXISTS "help_chunks_embedding_idx";
ALTER TABLE "help_chunks" ALTER COLUMN "embedding" TYPE vector(1024);
CREATE INDEX "help_chunks_embedding_idx"
  ON "help_chunks" USING hnsw ("embedding" vector_cosine_ops);
