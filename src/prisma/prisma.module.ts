import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Modulo global de Prisma.
 * Al marcarlo como @Global, cualquier otro modulo puede importar
 * PrismaService sin necesidad de declararlo en cada import.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
