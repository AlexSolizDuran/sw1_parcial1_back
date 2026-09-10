import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ModelGateway } from './model/gateway';

/**
 * Modulo del agente COPILOT (IA).
 * EXPONE el chat con modelo Qwen2.5-Coder (Space ZeroGPU de Hugging Face)
 * y la proyeccion/validacion/diff del DSL canonico del diagrama.
 */
@Module({
  controllers: [AiController],
  providers: [AiService, ModelGateway],
})
export class AiModule {}
