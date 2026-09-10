import { Module } from '@nestjs/common';
import { CollaboratorsController } from './collaborators.controller';
import { CollaboratorsService } from './collaborators.service';

/**
 * Modulo de colaboradores de un diagrama.
 * Permite que el owner invite usuarios por email, cambie sus permisos
 * (VIEWER para leer, EDITOR para editar) y los elimine.
 */
@Module({
  controllers: [CollaboratorsController],
  providers: [CollaboratorsService],
})
export class CollaboratorsModule {}
