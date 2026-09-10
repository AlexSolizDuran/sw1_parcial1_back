import { Module } from '@nestjs/common';
import { EndpointsController } from './endpoints.controller';
import { EndpointsService } from './endpoints.service';

/**
 * Modulo de utilidades de desarrollo.
 * Expone el listado dinamico de endpoints del backend.
 */
@Module({
  controllers: [EndpointsController],
  providers: [EndpointsService],
})
export class EndpointsModule {}
