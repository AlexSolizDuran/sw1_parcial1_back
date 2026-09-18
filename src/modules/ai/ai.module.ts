import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ModelGateway } from './model/gateway';
import { SupportController } from './support/support.controller';
import { SupportService } from './support/support.service';
import { EmbeddingsService } from './support/embeddings.service';
import { IngestService } from './support/ingest.service';
import { RetrievalService } from './support/retrieval.service';
import { VisionController } from './vision/vision.controller';
import { VisionService } from './vision/vision.service';
import { VisionGateway } from './vision/vision.gateway';
import { SpeechController } from './speech/speech.controller';
import { SpeechGateway } from './speech/speech.gateway';

/**
 * Modulo de agentes de IA.
 *  - COPILOT: edita el diagrama por chat (AiController/AiService).
 *  - SUPPORT: ayuda de uso en texto plano, stateless (SupportController/Service).
 *  - VISION: importa un diagrama de clases desde una imagen (VisionController).
 *  - SPEECH: transcribe voz a texto para el microfono del chat (SpeechController).
 * Todos comparten el ModelGateway (mock / Space de Hugging Face).
 */
@Module({
  controllers: [
    AiController,
    SupportController,
    VisionController,
    SpeechController,
  ],
  providers: [
    AiService,
    SupportService,
    ModelGateway,
    EmbeddingsService,
    RetrievalService,
    IngestService,
    VisionService,
    VisionGateway,
    SpeechGateway,
  ],
})
export class AiModule {}
