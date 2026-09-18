-- Re-agrega la agrupacion de diagramas (CU-1.3: organizar por grupos).
-- Columna nullable: los diagramas existentes quedan "Sin grupo".

ALTER TABLE "diagrams" ADD COLUMN "group" VARCHAR(255);
