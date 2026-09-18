import { Module } from '@nestjs/common';
import { SpringBootController } from './spring-boot.controller';
import { SpringBootService } from './spring-boot.service';

/**
 * Modulo de generacion Spring Boot (determinista, sin IA).
 * Genera 1 carpeta por tabla del diagrama con Entity + Repository +
 * Service + Controller + Request/Response + Mapper.
 */
@Module({
  controllers: [SpringBootController],
  providers: [SpringBootService],
  exports: [SpringBootService],
})
export class SpringBootModule {}
