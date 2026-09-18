import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { DiagramsModule } from './modules/diagrams/diagrams.module';
import { EndpointsModule } from './modules/endpoints/endpoints.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { CollaboratorsModule } from './modules/collaborators/collaborators.module';
import { AiModule } from './modules/ai/ai.module';
import { SpringBootModule } from './modules/spring-boot/spring-boot.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    WorkspacesModule,
    DiagramsModule,
    EndpointsModule,
    RealtimeModule,
    CollaboratorsModule,
    AiModule,
    SpringBootModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
