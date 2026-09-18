/**
 * Servicio del agente SUPPORT (ayuda de uso, puramente informativo).
 * RAG: recupera los top-3 chunks del manual (pgvector) y los inyecta como
 * INFO al prompt. Stateless: sin sesiones en BD (el front guarda la
 * conversacion en su localStorage) y sin tocar diagramas.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ModelGateway, type MensajeModelo } from '../model/gateway';
import { maxTokensSupport, obtenerModelo } from '../model/models.config';
import { RetrievalService } from './retrieval.service';
import { SupportChatDto } from './dto/support-chat.dto';
import {
  REDIRECCION_FUERA_DE_TEMA,
  formatearInfo,
  supportSystemPrompt,
} from './support-prompts';

/** Respuesta de POST /ai/support/chat (contrato con el frontend). */
export interface SupportResponse {
  /** Texto de ayuda en español (maximo 2000 caracteres). */
  texto: string;
  /** Id del modelo que respondio. */
  modelo: string;
  /** De donde salio el conocimiento (debug/observabilidad). */
  fuente: 'rag' | 'manual' | 'sin-cobertura';
}

/** Tope de caracteres de la respuesta (el front muestra texto corto). */
const MAX_TEXTO = 2000;

/**
 * Servicio de ayuda: responde preguntas de uso de la plataforma.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly gateway: ModelGateway,
    private readonly retrieval: RetrievalService,
  ) {}

  /**
   * Responde una pregunta de uso con RAG + historial como contexto.
   * @param dto - Pregunta + ultimos 12 mensajes (del localStorage del front)
   * @returns Texto de ayuda, modelo y fuente del conocimiento
   */
  async preguntar(dto: SupportChatDto): Promise<SupportResponse> {
    const modelo = obtenerModelo(undefined);

    // RAG: top-3 chunks; [] = sin cobertura (redireccion) o fallo (fallback manual)
    let chunks: Array<{ titulo: string; texto: string }> = [];
    let falloRetrieval = false;
    try {
      chunks = await this.retrieval.recuperar(dto.pregunta);
    } catch (error) {
      falloRetrieval = true;
      this.logger.warn(`Retrieval fallo, fallback a manual: ${String(error)}`);
    }

    const fuente: SupportResponse['fuente'] = falloRetrieval
      ? 'manual'
      : chunks.length > 0
        ? 'rag'
        : 'sin-cobertura';

    // Sin cobertura no se llama al modelo: respuesta fija determinista
    // (el modelo real ignora a veces la orden de redireccion y alucina).
    if (!falloRetrieval && chunks.length === 0) {
      return {
        texto: REDIRECCION_FUERA_DE_TEMA,
        modelo: 'local',
        fuente,
      };
    }

    // Fallo de infra -> manual completo (nunca se rompe).
    const system = falloRetrieval
      ? supportSystemPrompt(null)
      : supportSystemPrompt(
          formatearInfo(chunks.map((c) => `${c.titulo}: ${c.texto}`)),
        );

    const mensajes: MensajeModelo[] = [
      { role: 'system', content: system },
      ...this.mapearHistorial(dto),
      { role: 'user', content: dto.pregunta },
    ];
    const texto = await this.gateway.generar(mensajes, modelo, {
      temperatura: 0.3,
      topP: 0.9,
      maxTokens: maxTokensSupport(),
    });
    return { texto: texto.slice(0, MAX_TEXTO), modelo: modelo.id, fuente };
  }

  /**
   * Convierte el historial del DTO al formato del modelo, en orden.
   * @param dto - DTO validado por el pipe global
   * @returns Mensajes user/assistant cronologicos
   */
  private mapearHistorial(dto: SupportChatDto): MensajeModelo[] {
    return (dto.historial ?? []).map((m) => ({
      role: m.rol === 'USER' ? ('user' as const) : ('assistant' as const),
      content: m.contenido,
    }));
  }
}
