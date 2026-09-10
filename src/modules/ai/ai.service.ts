/**
 * Servicio del agente COPILOT.
 *
 * Orquesta el circuito completo de una peticion de chat:
 *   1. Verifica acceso al diagrama y resuelve la sesion (AiSession COPILOT).
 *   2. Proyecta el snapshot del frontend al DSL canonico (ids y extremos
 *      canonizados n1/e1...).
 *   3. Modo foco si hay entidad seleccionada: prompt reducido (solo esa
 *      entidad) y presupuesto de tokens chico; si no, prompt completo con
 *      presupuesto dinamico segun el tamano del diagrama.
 *   4. Extrae/valida el JSON (con reintento si viene corrupto).
 *   5. En foco reconstruye el diagrama completo (resto intacto), calcula el
 *      diff y resuelve las acciones (ids reales + alcance de seleccion).
 *   6. Persiste el historial (AiMessage USER/ASSISTANT/TOOL) y devuelve el
 *      resultado para que el frontend muestre la vista previa.
 */
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { AgentType, type AiSession } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CanonicalDiagram,
  DiagramAction,
  ModelOutput,
  Projection,
} from './dsl/canonical';
import { diffDiagrams } from './dsl/diff';
import { contextoFoco, reconstruirConFoco } from './dsl/foco';
import { projectState } from './dsl/project';
import { extractJson } from './dsl/repair';
import { resolveActions, type Seleccion } from './dsl/resolve';
import {
  AiValidationError,
  toHttpError,
  validateModelOutput,
} from './dsl/validate';
import { FEW_SHOT_EXAMPLES, FEW_SHOT_FOCO_EXAMPLES } from './prompts/few-shot';
import { systemPrompt } from './prompts/system-prompt';
import {
  fusionarParametros,
  listarModelos,
  maxTokensParaDiagrama,
  maxTokensParaFoco,
  maxTokensReemplazar,
  obtenerModelo,
  type ParametrosGeneracion,
} from './model/models.config';
import { ModelGateway, type MensajeModelo } from './model/gateway';

/** Rol efectivo del usuario dentro del diagrama. */
export type Rol = 'OWNER' | 'EDITOR' | 'VIEWER' | null;

/** Respuesta completa de una peticion de chat (contrato con el frontend). */
export interface ChatResponse {
  /** Id de la sesion usada/creada. */
  sessionId: string;
  /** Id del mensaje ASSISTANT persistido (para poder responderle despues). */
  mensajeId: string | null;
  /** Explicacion del asistente en espanol. */
  texto: string;
  /** Acciones aplicables (ids reales ya resueltos). */
  acciones: DiagramAction[];
  /** Avisos de acciones descartadas (fuera del alcance de seleccion). */
  advertencias: string[];
  /** Rol del usuario para que el frontend habilite/deshabilite "Aplicar". */
  rol: Rol;
  /** True si el usuario tiene permiso para aplicar los cambios. */
  puedeAplicar: boolean;
  /** True si la respuesta salio de la cache local. */
  cache: boolean;
  /** Id del modelo que respondio. */
  modelo: string;
}

/** Versión parcial de las conversaciones persistidas. */
export interface RespuestaSesion {
  id: string;
  agentType: AgentType;
  startedAt: Date;
  mensajes: number;
}

const ROLES_VALIDADOS = ['OWNER', 'EDITOR', 'VIEWER'] as const;

/**
 * Servicio de IA: agente COPILOT para editar el diagrama por chat.
 */
@Injectable()
export class AiService {
  /** Cache LRU de respuestas: clave = hash(material de la peticion). */
  private readonly cache = new Map<string, ModelOutput>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ModelGateway,
    private readonly config: ConfigService,
  ) {}

  /**
   * Procesa una instruccion de chat y devuelve las acciones a aplicar.
   * @param diagramId - Id del diagrama
   * @param userId - Id del usuario autenticado
   * @param dto - Cuerpo validado por el pipe global
   * @returns La respuesta tipada para la vista previa del frontend
   */
  async chat(
    diagramId: string,
    userId: string,
    dto: {
      sessionId?: string;
      instruccion: string;
      modo?: 'agregar' | 'reemplazar';
      modelo?: string;
      params?: Partial<ParametrosGeneracion>;
      snapshot: Record<string, unknown>;
      seleccionId?: string;
      seleccionKind?: 'entidad' | 'relacion';
    },
  ): Promise<ChatResponse> {
    const { rol } = await this.resolverAcceso(diagramId, userId);
    const puedeAplicar = rol !== 'VIEWER';

    // 1. Sesion y persistencia de la instruccion
    const session = await this.resolverSesion(diagramId, userId, dto.sessionId);
    await this.persistirMensaje(session.id, 'USER', dto.instruccion);

    // 2. Configuracion del modelo y proyeccion del estado
    const modelo = obtenerModelo(dto.modelo);
    const modo = dto.modo ?? 'agregar';
    let proyeccion: Projection;
    if (modo === 'reemplazar') {
      // Desde cero: el modelo ve un lienzo vacio y lo construye entero
      proyeccion = {
        resultado: { entidades: [], relaciones: [] },
        idMap: new Map(),
        stateHash: 'reemplazo',
      };
    } else {
      proyeccion = projectState(dto.snapshot);
    }

    const seleccion =
      dto.seleccionId && dto.seleccionKind
        ? { id: dto.seleccionId, kind: dto.seleccionKind }
        : null;

    // Modo foco: hay una entidad seleccionada y estamos en agregar.
    // El modelo solo edita esa entidad (contexto reducido); el backend
    // reconstruye el resto intacto para que el diff no genere ruido.
    // Si la seleccion no existe en el snapshot, se usa el modo normal.
    const idCanonicoFoco =
      modo === 'agregar' && seleccion?.kind === 'entidad'
        ? idCanonicoDe(seleccion.id, proyeccion.idMap)
        : null;
    const foco = idCanonicoFoco !== null;

    let params = fusionarParametros(modelo, dto.params);
    // Presupuesto de salida segun el tamano del diagrama: el modelo debe
    // devolver el diagrama COMPLETO y con maxTokens fijo (512) los diagramas
    // de 10+ entidades se truncaban, generando eliminaciones fantasma en el
    // diff. Solo aplica si el usuario no pidio explicitamente otro valor.
    if (dto.params?.maxTokens === undefined) {
      if (modo === 'reemplazar') {
        // Modo reemplazar construye el diagrama completo desde cero
        params = { ...params, maxTokens: maxTokensReemplazar() };
      } else if (foco) {
        // Modo foco: solo se devuelve UNA entidad y sus relaciones
        const ctx = contextoFoco(proyeccion.resultado, idCanonicoFoco);
        params = {
          ...params,
          maxTokens: maxTokensParaFoco(JSON.stringify(ctx.seleccionada ?? {})),
        };
      } else {
        // Modo agregar reproduce el diagrama actual + cambios
        params = {
          ...params,
          maxTokens: maxTokensParaDiagrama(
            JSON.stringify(proyeccion.resultado),
          ),
        };
      }
    }

    // 3. Cache: misma instruccion + mismo estado + mismos params = misma salida
    const clave = this.claveCache(
      dto.instruccion,
      proyeccion.stateHash,
      params,
      modelo.id,
      seleccion,
      modo,
    );
    let salida = this.leerCache(clave);
    let usoCache = false;
    if (salida) {
      usoCache = true;
    } else {
      salida = await this.generarSalida(
        dto.instruccion,
        proyeccion.resultado,
        modo,
        seleccion,
        params,
        modelo.id,
        idCanonicoFoco,
      );
      this.guardarCache(clave, salida);
    }

    // 4. Diff y resolucion de acciones (ids reales + alcance)
    // En modo foco la salida es reducida (solo lo seleccionado): se
    // reconstruye el diagrama completo antes del diff para que el resto
    // quede intacto y no aparezcan eliminaciones fantasma.
    const deseado =
      foco && idCanonicoFoco
        ? reconstruirConFoco(
            proyeccion.resultado,
            { entidades: salida.entidades, relaciones: salida.relaciones },
            idCanonicoFoco,
          )
        : { entidades: salida.entidades, relaciones: salida.relaciones };
    const acciones = diffDiagrams(proyeccion.resultado, deseado);
    const { acciones: aplicables, advertencias } = resolveActions(
      acciones,
      proyeccion,
      seleccion,
    );

    // 5. Persistencia del historial
    const respuesta = await this.persistirMensaje(
      session.id,
      'ASSISTANT',
      salida.mensaje,
    );
    if (aplicables.length > 0 || advertencias.length > 0) {
      await this.persistirMensaje(
        session.id,
        'TOOL',
        JSON.stringify({ acciones: aplicables, advertencias }),
        'apply_actions',
      );
    }

    return {
      sessionId: session.id,
      mensajeId: respuesta.id,
      texto: salida.mensaje,
      acciones: aplicables,
      advertencias,
      rol,
      puedeAplicar,
      cache: usoCache,
      modelo: modelo.id,
    };
  }

  /** Lista publica de modelos disponibles para el selector del chat. */
  listarModelosPublico() {
    return listarModelos();
  }

  /**
   * Crea una sesion COPILOT nueva para un diagrama.
   * @param diagramId - Id del diagrama
   * @param userId - Id del usuario autenticado
   * @returns La sesion creada
   */
  async crearSesion(diagramId: string, userId: string) {
    await this.resolverAcceso(diagramId, userId);
    return this.prisma.aiSession.create({
      data: { diagramId, userId, agentType: AgentType.COPILOT },
    });
  }

  /**
   * Lista las sesiones COPILOT del usuario en un diagrama.
   * @param diagramId - Id del diagrama
   * @param userId - Id del usuario autenticado
   * @returns Sesiones con su cantidad de mensajes
   */
  async misSesiones(
    diagramId: string,
    userId: string,
  ): Promise<RespuestaSesion[]> {
    await this.resolverAcceso(diagramId, userId);
    const sesiones = await this.prisma.aiSession.findMany({
      where: { diagramId, userId, agentType: AgentType.COPILOT },
      orderBy: { startedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
    return sesiones.map((s) => ({
      id: s.id,
      agentType: s.agentType,
      startedAt: s.startedAt,
      mensajes: s._count.messages,
    }));
  }

  /**
   * Devuelve el historial de una sesion de chat.
   * @param sessionId - Id de la sesion
   * @param userId - Id del usuario autenticado
   * @returns Mensajes ordenados ascendentemente
   */
  async obtenerMensajes(sessionId: string, userId: string) {
    const session = await this.prisma.aiSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) {
      throw new NotFoundException('Sesion de IA no encontrada');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('No tienes acceso a esta sesion');
    }
    return session.messages.map((m) => ({
      id: m.id,
      rol: m.role,
      toolName: m.toolName,
      contenido: m.content,
      createdAt: m.createdAt,
    }));
  }

  // ─────────────────────────── Helpers privados ───────────────────────────

  /** Verifica acceso al diagrama y devuelve el rol efectivo del usuario. */
  private async resolverAcceso(
    diagramId: string,
    userId: string,
  ): Promise<{ rol: Rol }> {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id: diagramId },
      include: {
        workspace: { select: { ownerId: true } },
        collaborators: { where: { userId }, select: { role: true } },
      },
    });
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    const esOwnerWorkspace = diagram.workspace.ownerId === userId;
    const colaborador = diagram.collaborators[0];
    if (!esOwnerWorkspace && !colaborador) {
      throw new ForbiddenException('No tienes acceso a este diagrama');
    }

    let rol: Rol = null;
    if (esOwnerWorkspace) {
      rol = 'OWNER';
    } else if (colaborador && ROLES_VALIDADOS.includes(colaborador.role)) {
      rol = colaborador.role;
    }
    return { rol };
  }

  /** Resuelve la sesion: la indicada, la ultima COPILOT del usuario o una nueva. */
  private async resolverSesion(
    diagramId: string,
    userId: string,
    sessionId: string | undefined,
  ): Promise<AiSession> {
    if (sessionId) {
      const session = await this.prisma.aiSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) {
        throw new NotFoundException('Sesion de IA no encontrada');
      }
      if (session.diagramId !== diagramId || session.userId !== userId) {
        throw new ForbiddenException('No tienes acceso a esta sesion');
      }
      return session;
    }

    const ultima = await this.prisma.aiSession.findFirst({
      where: { diagramId, userId, agentType: AgentType.COPILOT },
      orderBy: { startedAt: 'desc' },
    });
    if (ultima) return ultima;

    return this.prisma.aiSession.create({
      data: { diagramId, userId, agentType: AgentType.COPILOT },
    });
  }

  /** Persiste un mensaje dentro de la sesion. */
  private persistirMensaje(
    sessionId: string,
    role: 'USER' | 'ASSISTANT' | 'TOOL',
    content: string,
    toolName?: string,
  ) {
    return this.prisma.aiMessage.create({
      data: {
        sessionId,
        role,
        content,
        ...(toolName !== undefined && { toolName }),
      },
    });
  }

  /** Ejecuta el modelo (con reintento) y devuelve la salida validada. */
  private async generarSalida(
    instruccion: string,
    diagrama: CanonicalDiagram,
    modo: 'agregar' | 'reemplazar',
    seleccion: Seleccion | null,
    params: ParametrosGeneracion,
    modeloId: string,
    idCanonicoFoco: string | null,
  ): Promise<ModelOutput> {
    const mensajes = this.construirMensajes(
      instruccion,
      diagrama,
      modo,
      seleccion,
      idCanonicoFoco,
    );
    const modelo = obtenerModelo(modeloId);

    // Primer intento con la temperatura configurada
    const texto1 = await this.gateway.generar(mensajes, modelo, params);
    try {
      const salida = validateModelOutput(extractJson(texto1));
      return { ...salida, mensaje: salida.mensaje.slice(0, 1000) };
    } catch (error) {
      const pista =
        error instanceof AiValidationError
          ? error.message
          : 'No se pudo extraer un JSON valido.';
      // Reintento con temperatura baja mostrandole el error exacto
      const correccion: MensajeModelo = {
        role: 'user',
        content: `Tu respuesta no fue valida. Error: ${pista}. Devolvé SOLO el objeto JSON completo corregido, sin texto adicional.`,
      };
      const texto2 = await this.gateway.generar(
        [...mensajes, { role: 'assistant', content: texto1 }, correccion],
        modelo,
        { ...params, temperatura: 0.1 },
      );
      try {
        const salida = validateModelOutput(extractJson(texto2));
        return { ...salida, mensaje: salida.mensaje.slice(0, 1000) };
      } catch (error2) {
        toHttpError(error2, 2);
      }
    }
    throw new Error('La IA no produjo una respuesta valida.'); // inalcanzable
  }

  /** Construye el historial system + few-shot + caso real. */
  private construirMensajes(
    instruccion: string,
    diagrama: CanonicalDiagram,
    modo: 'agregar' | 'reemplazar',
    seleccion: Seleccion | null,
    idCanonicoFoco: string | null,
  ): MensajeModelo[] {
    const mensajes: MensajeModelo[] = [
      { role: 'system', content: systemPrompt() },
    ];

    // Modo foco: contexto reducido (solo la entidad seleccionada) con sus
    // propios ejemplos; el backend reconstruye el resto intacto.
    if (idCanonicoFoco) {
      for (const ejemplo of FEW_SHOT_FOCO_EXAMPLES) {
        // En los ejemplos de foco, diagramaActual trae SOLO la entidad
        // seleccionada (primera posicion) y sus relaciones tocantes.
        const idEjemplo = ejemplo.diagramaActual.entidades[0]?.id ?? '';
        mensajes.push({
          role: 'user',
          content: formatearInstruccionFoco(
            ejemplo.instruccion,
            contextoFoco(ejemplo.diagramaActual, idEjemplo),
          ),
        });
        mensajes.push({
          role: 'assistant',
          content: JSON.stringify(ejemplo.salida),
        });
      }
      mensajes.push({
        role: 'user',
        content: formatearInstruccionFoco(
          instruccion,
          contextoFoco(diagrama, idCanonicoFoco),
        ),
      });
      return mensajes;
    }

    for (const ejemplo of FEW_SHOT_EXAMPLES) {
      mensajes.push({
        role: 'user',
        content: formatearInstruccion(
          ejemplo.instruccion,
          ejemplo.diagramaActual,
          'agregar',
          null,
        ),
      });
      mensajes.push({
        role: 'assistant',
        content: JSON.stringify(ejemplo.salida),
      });
    }

    mensajes.push({
      role: 'user',
      content: formatearInstruccion(instruccion, diagrama, modo, seleccion),
    });
    return mensajes;
  }

  /** Clave de cache unica para una combinacion de inputs. */
  private claveCache(
    instruccion: string,
    stateHash: string,
    params: ParametrosGeneracion,
    modelo: string,
    seleccion: Seleccion | null,
    modo: string,
  ): string {
    const material = [
      instruccion,
      stateHash,
      params.temperatura,
      params.topP,
      params.maxTokens,
      modelo,
      seleccion ? `${seleccion.kind}:${seleccion.id}` : 'todo',
      modo,
    ].join('|');
    return createHash('sha256').update(material).digest('hex');
  }

  /** Lee de la cache LRU (respetando AI_CACHE_SIZE, 0 desactiva). */
  private leerCache(clave: string): ModelOutput | undefined {
    if (this.maxCache() === 0) return undefined;
    const valor = this.cache.get(clave);
    if (!valor) return undefined;
    // Re-insertar al final para mantener el orden LRU
    this.cache.delete(clave);
    this.cache.set(clave, valor);
    return valor;
  }

  /** Escribe en la cache LRU y evita el tamano maximo. */
  private guardarCache(clave: string, salida: ModelOutput): void {
    const max = this.maxCache();
    if (max === 0) return;
    this.cache.set(clave, salida);
    while (this.cache.size > max) {
      let primera: string | undefined;
      for (const claveEstricta of this.cache.keys()) {
        primera = claveEstricta;
        break;
      }
      if (primera === undefined) break;
      this.cache.delete(primera);
    }
  }

  /** Tamano maximo de la cache leido desde las variables de entorno. */
  private maxCache(): number {
    return Number(this.config.get<string>('AI_CACHE_SIZE') ?? '50');
  }
}

/**
 * Busca el id canonico (n1, e2...) a partir del id real del store.
 * @param idReal - Id real del elemento seleccionado en el lienzo
 * @param idMap - Mapeo canonico -> real de la proyeccion
 * @returns El id canonico o null si la seleccion no esta en el snapshot
 */
function idCanonicoDe(
  idReal: string,
  idMap: Map<string, string>,
): string | null {
  for (const [canonico, real] of idMap) {
    if (real === idReal) return canonico;
  }
  return null;
}

/**
 * Da formato al mensaje del usuario en modo foco: solo la entidad
 * seleccionada y sus relaciones, sin el resto del diagrama.
 * @param instruccion - Instruccion original del usuario
 * @param contexto - Contexto reducido de contextoFoco()
 * @returns Texto del mensaje user para el modelo
 */
function formatearInstruccionFoco(
  instruccion: string,
  contexto: ReturnType<typeof contextoFoco>,
): string {
  const otras =
    contexto.otrasEntidades.length > 0
      ? `\nOtras entidades del diagrama (solo referencia para nuevas relaciones, NO las devuelvas): ${contexto.otrasEntidades.join(', ')}.`
      : '';
  return [
    `Instrucción: ${instruccion}`,
    '',
    'Modo foco: estás editando SOLO la entidad seleccionada de abajo.',
    'Devolvé un JSON con "mensaje", "entidades" y "relaciones" donde:',
    '- "entidades" trae UNICAMENTE la entidad seleccionada ya editada. Para ELIMINARLA, devolvé "entidades": [] (array vacío).',
    '- "relaciones" trae UNICAMENTE las relaciones de esta entidad en su estado FINAL (las que falten se eliminan).',
    '- NUNCA incluyas otras entidades del diagrama.',
    '',
    '## Entidad seleccionada (JSON)',
    JSON.stringify(contexto.seleccionada),
    '',
    '## Relaciones de esta entidad (JSON)',
    JSON.stringify(contexto.relacionesTocantes),
    otras,
  ].join('\n');
}

/** Da formato al mensaje del usuario con la instruccion y el diagrama. */
function formatearInstruccion(
  instruccion: string,
  diagrama: CanonicalDiagram,
  modo: 'agregar' | 'reemplazar',
  seleccion: Seleccion | null,
): string {
  const modoTexto =
    modo === 'reemplazar'
      ? 'El diagrama actual está vacío: construí el diagrama COMPLETO desde cero siguiendo la instrucción.'
      : 'Modo agregar: editá el diagrama actual aplicando solo los cambios pedidos.';
  const alcance = seleccion
    ? `\nAlcance: actuá SOLO sobre el elemento seleccionado (${seleccion.kind === 'relacion' ? 'relacion' : 'entidad'}). No modifiques ni elimines otras entidades del diagrama.\n`
    : '';

  return `Instrucción: ${instruccion}\n\n${modoTexto}${alcance}\n## Diagrama actual (JSON)\n${JSON.stringify(diagrama)}`;
}
