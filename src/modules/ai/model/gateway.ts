/**
 * Gateway hacia los modelos de IA.
 *
 * Expone un unico metodo `generar` que recibe el historial de mensajes
 * (system + few-shot + caso real) y devuelve el texto crudo del modelo.
 * El modo se configura con AI_MODE:
 *   - "fastapi": llama al Space ZeroGPU de Hugging Face (gradio.Server/FastAPI,
 *     ruta POST /generate). Modo principal en produccion.
 *   - "gradio-space": variante que usa el protocolo Gradio del mismo Space.
 *   - "mock": proveedor deterministico de desarrollo (sin GPU) para probar
 *     el circuito completo chat -> diff -> aplicar.
 *   - "off": la IA esta deshabilitada (error claro).
 */
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extractJson } from '../dsl/repair';
import type {
  CanonicalDiagram,
  CanonicalEntity,
  CanonicalRelation,
  ModelOutput,
} from '../dsl/canonical';
import type { ModeloConfig, ParametrosGeneracion } from './models.config';
import { buscarEntradas, formatearEntrada } from '../support/support-manual';

/** Mensaje en el formato estándar de chat que entienden los modelos. */
export interface MensajeModelo {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

type Modo = 'mock' | 'gradio-space' | 'fastapi' | 'off';

/** Error interno de comunicacion con el modelo. */
export class AiGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiGatewayError';
  }
}

/**
 * Servicio de acceso a los modelos. Desacopla al servicio de IA de la
 * eleccion de proveedor (Space Gradio o mock local).
 */
@Injectable()
export class ModelGateway {
  private readonly modo: Modo;
  private readonly timeoutMs: number;
  /** Token de lectura del Space (requerido si es privado). */
  private readonly hfToken: string;

  constructor(private readonly config: ConfigService) {
    const modo = config.get<string>('AI_MODE') ?? 'mock';
    this.modo = ['mock', 'gradio-space', 'fastapi', 'off'].includes(modo)
      ? (modo as Modo)
      : 'mock';
    this.timeoutMs = Number(
      config.get<string>('AI_HTTP_TIMEOUT_MS') ?? '120000',
    );
    this.hfToken = config.get<string>('HF_TOKEN') ?? '';
  }

  /**
   * Devuelve el texto generado por el modelo para el historial dado.
   * @param mensajes - Historial: system + ejemplos + caso real
   * @param modelo - Configuracion del modelo elegido
   * @param params - Parametros de generacion
   * @returns Texto crudo de la respuesta
   * @throws ServiceUnavailableException si la IA esta deshabilitada
   * @throws AiGatewayError si el Space no respondio
   */
  async generar(
    mensajes: MensajeModelo[],
    modelo: ModeloConfig,
    params: ParametrosGeneracion,
  ): Promise<string> {
    if (this.modo === 'fastapi') {
      if (!modelo.espacio) {
        throw new ServiceUnavailableException(
          'El Space de Hugging Face no esta configurado. Revisa AI_DEFAULT_SPACE en el .env.',
        );
      }
      return this.generarFastapi(mensajes, modelo, params);
    }
    if (this.modo === 'gradio-space') {
      if (!modelo.espacio) {
        throw new ServiceUnavailableException(
          'El Space de Hugging Face no esta configurado. Revisa AI_DEFAULT_SPACE en el .env.',
        );
      }
      return this.generarGradio(mensajes, modelo, params);
    }
    if (this.modo === 'mock') {
      return generarMock(mensajes);
    }
    throw new ServiceUnavailableException(
      'La IA esta deshabilitada. Configura AI_MODE=mock, AI_MODE=gradio-space o AI_MODE=fastapi.',
    );
  }

  /**
   * Llama al Space via nuestra ruta FastAPI (`POST <espacio>/generate`).
   * El Space esta construido con gradio.Server y devuelve `{ texto }`.
   */
  private async generarFastapi(
    mensajes: MensajeModelo[],
    modelo: ModeloConfig,
    params: ParametrosGeneracion,
  ): Promise<string> {
    const base = modelo.espacio.replace(/\/+$/, '');
    const authHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.hfToken) authHeaders['Authorization'] = `Bearer ${this.hfToken}`;

    const respuesta = await fetch(`${base}/generate`, {
      method: 'POST',
      headers: authHeaders,
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        mensajes: mensajes.map((m) => ({ role: m.role, content: m.content })),
        temperatura: params.temperatura,
        top_p: params.topP,
        max_tokens: params.maxTokens,
      }),
    });

    if (!respuesta.ok) {
      throw new AiGatewayError(
        `El Space no acepto la peticion (${respuesta.status}). Verifica el espacio y el HF_TOKEN.`,
      );
    }
    const cuerpo = (await respuesta.json()) as { texto?: unknown };
    if (typeof cuerpo.texto !== 'string' || cuerpo.texto.length === 0) {
      throw new AiGatewayError('El Space termino sin devolver texto.');
    }
    return cuerpo.texto;
  }

  /** Llama al Space via la API de Gradio (predict + get event stream). */
  private async generarGradio(
    mensajes: MensajeModelo[],
    modelo: ModeloConfig,
    params: ParametrosGeneracion,
  ): Promise<string> {
    const base = modelo.espacio.replace(/\/+$/, '');
    const authHeaders: Record<string, string> = {};
    if (this.hfToken) authHeaders['Authorization'] = `Bearer ${this.hfToken}`;

    // 1. Inicia la generacion
    const iniciar = await fetch(`${base}/gradio_api/call/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        data: [
          JSON.stringify(
            mensajes.map((m) => ({ role: m.role, content: m.content })),
          ),
          params.temperatura,
          params.topP,
          params.maxTokens,
        ],
      }),
    });

    if (!iniciar.ok) {
      throw new AiGatewayError(
        `El Space no acepto la peticion (${iniciar.status}). Verifica el espacio y el HF_TOKEN.`,
      );
    }
    const { event_id } = (await iniciar.json()) as { event_id?: string };
    if (!event_id) {
      throw new AiGatewayError('El Space no devolvio un event_id valido.');
    }

    // 2. Consume el stream de eventos hasta el fin de la generacion
    const respuesta = await fetch(
      `${base}/gradio_api/call/predict/${event_id}`,
      {
        headers: authHeaders,
        signal: AbortSignal.timeout(this.timeoutMs),
      },
    );
    if (!respuesta.ok || !respuesta.body) {
      throw new AiGatewayError(
        `No se pudo leer el stream del Space (${respuesta.status}).`,
      );
    }

    const texto = await leerStreamGradio(respuesta.body);
    if (!texto) {
      throw new AiGatewayError('El Space termino sin devolver texto.');
    }
    return texto;
  }
}

/** Lee un ReadableStream SSE de Gradio y devuelve el ultimo texto generado. */
async function leerStreamGradio(
  cuerpo: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = cuerpo.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const textos: string[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let finLinea: number;
    while ((finLinea = buffer.indexOf('\n')) !== -1) {
      const linea = buffer.slice(0, finLinea).trim();
      buffer = buffer.slice(finLinea + 1);
      if (!linea.startsWith('data:')) continue;
      const payload = linea.slice(5).trim();
      if (payload === '[DONE]' || payload === '[done]') continue;
      try {
        const evento = JSON.parse(payload) as unknown;
        // En la API de Gradio el resultado esta en la posicion [1]
        if (Array.isArray(evento) && evento.length >= 2) {
          const valor = evento[1] as unknown;
          if (typeof valor === 'string' && valor.length > 0) {
            textos.push(valor);
          }
        }
      } catch {
        // Lineas SSE no JSON (ping/ruido) se ignoran
      }
    }
  }

  return textos.length > 0 ? textos[textos.length - 1] : '';
}

// ─────────────────────────── Proveedor MOCK: SUPPORT ───────────────────────────

/**
 * Respuesta de ayuda deterministica para desarrollo (sin GPU).
 * Mini-retrieval sobre el MANUAL en memoria: puntua entradas por keywords
 * y devuelve la mejor (mismo circuito conceptual que el RAG real).
 * @param mensajes - Historial con system [SUPPORT] + contexto + pregunta
 * @returns Texto plano de ayuda en español
 */
export function generarMockSupport(mensajes: MensajeModelo[]): string {
  const pregunta =
    [...mensajes].reverse().find((m) => m.role === 'user')?.content ?? '';
  const [mejor] = buscarEntradas(pregunta, 1);
  if (mejor) return `${formatearEntrada(mejor)} (mock)`;
  return 'Solo puedo ayudarte con el uso de la plataforma (mock). Temas: invitaciones y roles, editor de diagramas, versiones, exportar XMI, generar Spring Boot y cuenta. ¿Sobre cuál preguntas?';
}

// ─────────────────────────── Proveedor MOCK: COPILOT ───────────────────────────

/** Extrae la instruccion del contenido del mensaje del usuario. */
function extraerInstruccion(content: string): string {
  const match = /Instrucción:\s*([^\n]+)/i.exec(content);
  return match?.[1]?.trim() ?? content.trim();
}

/** Normaliza un objeto parseado a CanonicalDiagram aunque venga con ruido. */
function normalizarDiagrama(valor: unknown): CanonicalDiagram {
  const obj = (valor ?? {}) as {
    entidades?: unknown;
    relaciones?: unknown;
  };
  if (!Array.isArray(obj.entidades)) {
    throw new AiGatewayError('Estado actual invalido para el modo mock.');
  }
  return {
    entidades: obj.entidades as CanonicalEntity[],
    relaciones: Array.isArray(obj.relaciones)
      ? (obj.relaciones as CanonicalRelation[])
      : [],
  };
}

/** Siguiente id libre n/e que no colisione con los existentes. */
function siguienteId(prefijo: string, existentes: string[]): string {
  let max = 0;
  const re = new RegExp(`^${prefijo}(\\d+)$`);
  for (const id of existentes) {
    const match = re.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefijo}${max + 1}`;
}

/** Capitaliza la primera letra (convencion PascalCase para clases UML). */
function capitalizar(nombre: string): string {
  if (!nombre) return nombre;
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

/** Devuelve la primer entidad cuyo nombre coincide (o que busque contener). */
function buscarPorNombre(
  entidades: CanonicalEntity[],
  nombre: string,
): CanonicalEntity | undefined {
  return entidades.find((e) => e.nombre.toLowerCase() === nombre.toLowerCase());
}

/** Detecta preguntas conversacionales para responder como chat en el mock. */
function esPreguntaConversacional(instruccion: string): boolean {
  return /^(?:hola|hello|buenas|c[oó]mo|por qu[eé]\b|qu[eé] es|cu[aá]l es|explica|ay[úu]dame?\b)/i.test(
    instruccion,
  );
}

/**
 * Proveedor de desarrollo: aplica ediciones deterministicas sobre el diagrama
 * actual segun la instruccion, usando las mismas reglas que el modelo real.
 * Soporta: crear clase, renombrar clase, eliminar clase, convertir a enumeracion.
 */
export function generarMock(mensajes: MensajeModelo[]): string {
  // Rama SUPPORT: el system empieza con el marcador [SUPPORT]; se responde
  // texto plano de ayuda (sin JSON ni DSL) segun keywords de la pregunta.
  if (
    mensajes[0]?.role === 'system' &&
    mensajes[0].content.includes('[SUPPORT]')
  ) {
    return generarMockSupport(mensajes);
  }

  const usuario = [...mensajes].reverse().find((m) => m.role === 'user');
  const content = usuario?.content ?? '';
  const instruccion = extraerInstruccion(content).toLowerCase();

  // Respuestas conversacionales: preguntas conceptuales o saludos se
  // responden como chat en lugar de editar el diagrama.
  if (esPreguntaConversacional(instruccion)) {
    const salidaChat: ModelOutput = {
      tipo: 'chat',
      mensaje:
        'Soy el asistente de diagramas UML. Puedo ayudarte a crear y modificar diagramas de clases, o explicarte conceptos de UML. ¿Qué necesitás?',
    };
    return JSON.stringify(salidaChat);
  }

  const diagrama = normalizarDiagrama(extractJson(content));

  const entidades = [...diagrama.entidades];
  let relaciones = [...diagrama.relaciones];
  let mensaje =
    'El modo mock no reconoció la instrucción. Probá con "crear clase X", "renombrar A a B" o "eliminar clase X".';

  // Extrae el nombre de la clase como UNA sola palabra: se detiene ante
  // "y", "con", "que", comas o fin de linea para no tragar el resto de la
  // instruccion (ej: "crea la clase madera y agrega el atributo nombre").
  const crear = /(?:cre[ae]|agrega|agregar).*?clase\s+"?([^\s",]+)"?/i.exec(
    instruccion,
  );
  if (crear) {
    const id = siguienteId(
      'n',
      entidades.map((e) => e.id),
    );
    const nombreClase = capitalizar(crear[1].trim());
    // Si la misma instruccion pide un atributo ("y agrega el atributo
    // nombre"), se aplica en la misma pasada con defaults private/string.
    const atributo = /atributo\s+"?([^\s",]+)"?(?:\s*:\s*([^\s",]+))?/i.exec(
      instruccion,
    );
    entidades.push({
      id,
      tipo: 'class',
      nombre: nombreClase,
      atributos: atributo
        ? [
            {
              visibilidad: 'private',
              nombre: atributo[1].trim(),
              tipo: (atributo[2] ?? 'string').trim(),
            },
          ]
        : [],
      metodos: [],
    });
    mensaje = atributo
      ? `Creé la clase "${nombreClase}" con el atributo ${atributo[1]}. (mock)`
      : `Creé la clase "${nombreClase}". (mock)`;
  }

  const renombrar = /renombr[aá].*?"?([^"\n]+)"?\s+a\s+"?([^"\n]+)"?/i.exec(
    instruccion,
  );
  if (renombrar && !crear) {
    const entidad = buscarPorNombre(entidades, renombrar[1]);
    if (entidad) {
      entidad.nombre = renombrar[2].trim();
      mensaje = `Renombré la clase "${renombrar[1]}" a "${renombrar[2]}". (mock)`;
    } else {
      mensaje = `No encontré la clase "${renombrar[1]}".`;
    }
  }

  const eliminar = /(?:elimin|borr).*?clase.*?"?([^"\n]+)"?/i.exec(instruccion);
  if (eliminar && !crear && !renombrar) {
    const entidad = buscarPorNombre(entidades, eliminar[1]);
    if (entidad) {
      const indice = entidades.findIndex((e) => e.id === entidad.id);
      entidades.splice(indice, 1);
      relaciones = relaciones.filter(
        (r) => r.origen !== entidad.id && r.destino !== entidad.id,
      );
      mensaje = `Eliminé la clase "${eliminar[1]}" y sus relaciones. (mock)`;
    } else {
      mensaje = `No encontré la clase "${eliminar[1]}".`;
    }
  }

  const enumeracion = /converti.*?"?([^"\n]+)"?\s+a?\s*enum/i.exec(instruccion);
  if (enumeracion && !crear && !renombrar && !eliminar) {
    const entidad = buscarPorNombre(entidades, enumeracion[1]);
    if (entidad) {
      entidad.tipo = 'enumeration';
      entidad.atributos = [];
      entidad.metodos = [];
      entidad.literales = ['VALOR1', 'VALOR2'];
      mensaje = `Convertí "${enumeracion[1]}" a enumeración. (mock)`;
    } else {
      mensaje = `No encontré la clase "${enumeracion[1]}".`;
    }
  }

  const salida: ModelOutput = { mensaje, entidades, relaciones };
  return JSON.stringify(salida);
}
