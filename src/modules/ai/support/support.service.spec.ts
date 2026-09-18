/**
 * Tests del agente SUPPORT con RAG (ayuda de uso, puramente informativo).
 * Gateway y retrieval mockeados: se verifica la inyeccion de INFO, las
 * fuentes (rag/manual/sin-cobertura), el tope de 2000 caracteres y las
 * validaciones del DTO. Sin red ni base de datos.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ModelGateway } from '../model/gateway';
import type { MensajeModelo } from '../model/gateway';
import type {
  ModeloConfig,
  ParametrosGeneracion,
} from '../model/models.config';
import { RetrievalService } from './retrieval.service';
import type { ChunkRecuperado } from './retrieval.service';
import { SupportChatDto } from './dto/support-chat.dto';
import { formatearInfo, supportSystemPrompt } from './support-prompts';
import { SupportService } from './support.service';

// gateway y retrieval tocan @nestjs/config (ESM) y red/DB: se mockean.
jest.mock('../model/gateway', () => ({
  ModelGateway: class ModelGatewayMock {},
}));
jest.mock('./retrieval.service', () => ({
  RetrievalService: class RetrievalServiceMock {},
}));

const PREGUNTA = '¿Cómo invito colaboradores?';

const CHUNKS: ChunkRecuperado[] = [
  {
    id: 'colaboracion',
    titulo: 'Colaboracion e invitaciones',
    texto: 'Boton "Colaboradores" > invitar por email con rol.',
    similitud: 0.85,
  },
];

/** Llamada capturada al gateway (mensajes + params). */
interface LlamadaCapturada {
  mensajes: MensajeModelo[];
  params: ParametrosGeneracion;
}

/** Monta el servicio con gateway y retrieval mockeados. */
async function montarServicio(
  textoMock: string,
  chunks: ChunkRecuperado[] | Error = CHUNKS,
): Promise<{
  service: SupportService;
  llamadas: LlamadaCapturada[];
}> {
  const llamadas: LlamadaCapturada[] = [];
  const generar = jest.fn(
    (
      mensajes: MensajeModelo[],
      _modelo: ModeloConfig,
      params: ParametrosGeneracion,
    ): Promise<string> => {
      llamadas.push({ mensajes, params });
      return Promise.resolve(textoMock);
    },
  );
  const recuperar =
    chunks instanceof Error
      ? jest.fn().mockRejectedValue(chunks)
      : jest.fn().mockResolvedValue(chunks);
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      SupportService,
      { provide: ModelGateway, useValue: { generar } },
      { provide: RetrievalService, useValue: { recuperar } },
    ],
  }).compile();
  return { service: module.get<SupportService>(SupportService), llamadas };
}

describe('SupportService (RAG)', () => {
  it('devuelve texto plano con modelo y fuente rag', async () => {
    const { service, llamadas } = await montarServicio('Pasos...');
    const res = await service.preguntar({ pregunta: PREGUNTA });
    expect(res.texto).toBe('Pasos...');
    expect(typeof res.modelo).toBe('string');
    expect(res.fuente).toBe('rag');
    expect(llamadas).toHaveLength(1);
  });

  it('inyecta la INFO recuperada en el system', async () => {
    const { service, llamadas } = await montarServicio('ok');
    await service.preguntar({ pregunta: PREGUNTA });
    const system = llamadas[0]?.mensajes[0]?.content ?? '';
    expect(system).toContain('[SUPPORT]');
    expect(system).toContain('[1] Colaboracion e invitaciones');
  });

  it('arma historial despues del system y pregunta al final', async () => {
    const { service, llamadas } = await montarServicio('ok');
    await service.preguntar({
      pregunta: PREGUNTA,
      historial: [
        { rol: 'USER', contenido: 'hola' },
        { rol: 'ASSISTANT', contenido: '¡Hola!' },
      ],
    });
    const mensajes = llamadas[0]?.mensajes ?? [];
    expect(mensajes).toHaveLength(4);
    expect(mensajes[0]?.role).toBe('system');
    expect(mensajes[1]).toEqual({ role: 'user', content: 'hola' });
    expect(mensajes[2]).toEqual({ role: 'assistant', content: '¡Hola!' });
    expect(mensajes[3]).toEqual({ role: 'user', content: PREGUNTA });
  });

  it('sin cobertura: redireccion fija sin llamar al modelo', async () => {
    const { service, llamadas } = await montarServicio('ok', []);
    const res = await service.preguntar({
      pregunta: '¿Qué es la fotosíntesis?',
    });
    expect(res.fuente).toBe('sin-cobertura');
    expect(res.texto).toContain(
      'Solo puedo ayudarte con el uso de la plataforma',
    );
    expect(llamadas).toHaveLength(0);
  });

  it('fallo de retrieval: fuente manual con el manual completo', async () => {
    const { service, llamadas } = await montarServicio('ok', new Error('down'));
    const res = await service.preguntar({ pregunta: PREGUNTA });
    expect(res.fuente).toBe('manual');
    expect(llamadas[0]?.mensajes[0]?.content ?? '').toContain(
      'Boton "Colaboradores"',
    );
  });

  it('recorta el texto a 2000 caracteres', async () => {
    const { service } = await montarServicio('x'.repeat(5000));
    const res = await service.preguntar({ pregunta: PREGUNTA });
    expect(res.texto).toHaveLength(2000);
  });

  it('usa parametros fijos de ayuda (temp 0.3, tope AI_SUPPORT_MAX_TOKENS)', async () => {
    const { service, llamadas } = await montarServicio('ok');
    await service.preguntar({ pregunta: PREGUNTA });
    const params = llamadas[0]?.params;
    expect(params?.temperatura).toBe(0.3);
    expect(params ? params.maxTokens : 0).toBeLessThanOrEqual(1024);
  });
});

describe('SupportChatDto', () => {
  it('rechaza pregunta vacia', async () => {
    const dto = plainToInstance(SupportChatDto, { pregunta: '   ' });
    const errores = await validate(dto);
    expect(errores.length).toBeGreaterThan(0);
  });

  it('rechaza mas de 12 mensajes de historial', async () => {
    const dto = plainToInstance(SupportChatDto, {
      pregunta: PREGUNTA,
      historial: Array.from({ length: 13 }, (_, i) => ({
        rol: 'USER',
        contenido: `m${i}`,
      })),
    });
    const errores = await validate(dto);
    expect(errores.length).toBeGreaterThan(0);
  });

  it('acepta pregunta con 12 mensajes', async () => {
    const dto = plainToInstance(SupportChatDto, {
      pregunta: PREGUNTA,
      historial: Array.from({ length: 12 }, (_, i) => ({
        rol: i % 2 === 0 ? 'USER' : 'ASSISTANT',
        contenido: `m${i}`,
      })),
    });
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });
});

describe('supportSystemPrompt', () => {
  it('modo RAG: instrucciones + INFO con marcador mock', () => {
    const prompt = supportSystemPrompt(formatearInfo(['Colaboracion: pasos']));
    expect(prompt).toContain('[SUPPORT]');
    expect(prompt).toContain('[1] Colaboracion: pasos');
  });

  it('fallback null: manual completo', () => {
    const prompt = supportSystemPrompt(null);
    expect(prompt).toContain('[SUPPORT]');
    expect(prompt).toContain('Spring Boot');
    expect(prompt).toContain('Colaboradores');
  });
});
