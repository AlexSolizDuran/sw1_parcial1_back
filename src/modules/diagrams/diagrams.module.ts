import { Module } from '@nestjs/common';
import { DiagramsController } from './diagrams.controller';
import { DiagramsService } from './diagrams.service';

/**
 * Modulo de diagramas.
 * Contiene el controlador y el servicio de gestion de diagramas UML.
 * Cubre UC-1.5 (crear) y UC-1.6 (organizar).
 */
@Module({
  controllers: [DiagramsController],
  providers: [DiagramsService],
  exports: [DiagramsService],
})
export class DiagramsModule {}
