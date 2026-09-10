import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

/**
 * Modulo de colaboracion en tiempo real.
 * Expone el gateway Socket.IO que hace de relay de Yjs y el servicio
 * que gestiona los documentos compartidos y su persistencia en NeonDB.
 */
@Module({
  imports: [
    // Configura JwtModule con el mismo secreto que AuthModule para poder
    // verificar el token de los sockets conectados.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
