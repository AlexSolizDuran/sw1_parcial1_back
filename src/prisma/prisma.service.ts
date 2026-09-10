import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Servicio global de acceso a base de datos.
 * Expone el cliente Prisma a todos los modulos del backend y
 * gestiona el ciclo de vida de la conexion con NeonDB.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  /**
   * Establece la conexion con la base de datos al iniciar el modulo.
   */
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Cierra la conexion con la base de datos al detener la aplicacion.
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
