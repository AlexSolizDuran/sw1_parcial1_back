/**
 * Registro de modelos disponibles para el agente COPILOT.
 * Hoy se deploya Qwen2.5-Coder-7B-Instruct como Space ZeroGPU de Hugging Face,
 * pero el registro es extensible: al agregar un Space nuevo basta un nuevo item.
 */
export type Proveedor = 'gradio-space' | 'fastapi';

/** Configuracion publica/segura de un modelo disponible. */
export interface ModeloConfig {
  /** Identificador para /modelo <id> en el chat. */
  id: string;
  /** Nombre visible en el selector del chat. */
  nombre: string;
  /** Proveedor o tipo de deployment. */
  proveedor: Proveedor;
  /** URL del Space Gradio (sin /gradio_api). Se resuelve desde el .env. */
  espacio: string;
  /**
   * Variable de entorno con la URL del Space de ESTE modelo.
   * Si no esta definida, se usa AI_DEFAULT_SPACE como respaldo.
   */
  envVar: string;
  /** Maximo de tokens de contexto del modelo (solo informativo). */
  contextoMax: number;
  /** Parametros por defecto de generacion. */
  temperaturaDef: number;
  topPDef: number;
  maxTokensDef: number;
  /** True si el modelo puede crear diagramas desde cero. */
  soportaDesdeCero: boolean;
}

/**
 * Parametros de generacion que acepta el chat (/params temperatura=0.3 ...).
 */
export interface ParametrosGeneracion {
  temperatura: number;
  topP: number;
  maxTokens: number;
}

/**
 * Modelos oficiales. El primero es el default.
 * La URL del Space se lee de forma perezosa dentro de obtenerModelo para
 * evitar el orden de carga de NestJS: ConfigModule.forRoot() puebla `process.env`
 * despues de que este modulo se evalua; una constante top-level quedaria vacia.
 */
/**
 * Lee la URL del Space de un modelo desde el .env.
 * Orden: variable propia del modelo -> AI_DEFAULT_SPACE (respaldo) -> ''.
 * @param envVar - Nombre de la variable propia del modelo (ej: AI_SPACE_QWEN)
 * @returns URL base del Space o '' si no hay ninguna configurada
 */
export function leerEspacio(envVar?: string): string {
  if (envVar) {
    const propia = process.env[envVar]?.trim();
    if (propia) return propia;
  }
  return process.env.AI_DEFAULT_SPACE?.trim() ?? '';
}

export const MODELOS_REGISTRO: ModeloConfig[] = [
  {
    id: 'qwen2.5-coder-7b-instruct',
    nombre: 'Qwen2.5-Coder-7B-Instruct',
    proveedor: 'fastapi',
    espacio: '',
    // Para darle URL propia a futuro: AI_SPACE_QWEN25_CODER_7B=<url del space>
    envVar: 'AI_SPACE_QWEN25_CODER_7B',
    contextoMax: 32768,
    temperaturaDef: 0.2,
    topPDef: 0.9,
    maxTokensDef: 512,
    soportaDesdeCero: true,
  },
  // Para agregar un modelo nuevo a futuro basta un item asi:
  // {
  //   id: 'llama-3-8b-instruct',
  //   nombre: 'Llama-3-8B-Instruct',
  //   proveedor: 'fastapi',
  //   espacio: '',
  //   envVar: 'AI_SPACE_LLAMA_3_8B',
  //   contextoMax: 8192,
  //   temperaturaDef: 0.2,
  //   topPDef: 0.9,
  //   maxTokensDef: 512,
  //   soportaDesdeCero: true,
  // },
];

/**
 * Devuelve la configuracion de un modelo por su id.
 * @param id - Id del modelo (default si no se indica)
 * @returns La configuracion del modelo
 */
export function obtenerModelo(id: string | undefined): ModeloConfig {
  const pedido = id?.trim().toLowerCase();
  const base =
    MODELOS_REGISTRO.find((m) => m.id === pedido) ?? MODELOS_REGISTRO[0];
  if (!base) {
    return {
      id: 'sin-modelo',
      nombre: 'Sin modelo',
      proveedor: 'fastapi',
      espacio: '',
      envVar: '',
      contextoMax: 0,
      temperaturaDef: 0.2,
      topPDef: 0.9,
      maxTokensDef: 512,
      soportaDesdeCero: true,
    };
  }
  // La URL del Space siempre viene del .env (variable propia del modelo o
  // AI_DEFAULT_SPACE como respaldo), nunca del registro estatico.
  return { ...base, espacio: leerEspacio(base.envVar) };
}

/**
 * Fusiona los parametros recibidos con los default del modelo.
 * Asegura rangos validos (temperatura 0-1, topP 0-1, tokens 32-4096).
 * @param modelo - Configuracion base
 * @param parametros - Parametros parciales del usuario
 * @returns Parametros completos validados
 */
export function fusionarParametros(
  modelo: ModeloConfig,
  parametros: Partial<ParametrosGeneracion> | undefined,
): ParametrosGeneracion {
  const temperatura = clamp(
    parametros?.temperatura ?? modelo.temperaturaDef,
    0.01,
    1.0,
  );
  const topP = clamp(parametros?.topP ?? modelo.topPDef, 0.01, 1.0);
  const maxTokens = Math.round(
    clamp(parametros?.maxTokens ?? modelo.maxTokensDef, 32, 4096),
  );
  return { temperatura, topP, maxTokens };
}

/** Limita un numero a un rango [min, max]. */
function clamp(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

/**
 * Presupuesto de tokens para el modo 'reemplazar' (diagramas desde cero).
 * El benchmark mostro truncamiento del JSON con 512 tokens (los diagramas
 * completos suelen superar ese presupuesto) y exito con 1536.
 * @returns Tokens maximos clampados a [32, 4096]
 */
export function maxTokensReemplazar(): number {
  return Math.round(
    clamp(Number(process.env.AI_MAX_TOKENS_REEMPLAZAR ?? '1536'), 32, 4096),
  );
}

/**
 * Presupuesto de tokens para el modo 'agregar' segun el tamano del diagrama.
 * El modelo debe devolver el diagrama COMPLETO, asi que la salida necesita
 * al menos tantos tokens como ocupa el diagrama actual mas un margen para
 * los cambios y el mensaje. Con el default fijo de 512, diagramas de 10+
 * entidades se truncaban y el diff generaba eliminaciones fantasma.
 * @param diagramaJson - Diagrama canonico actual serializado
 * @returns Tokens maximos clampados a [512, 4096]
 */
export function maxTokensParaDiagrama(diagramaJson: string): number {
  // ~3.5 caracteres por token en JSON espanol compacto; margen x1.6 + 300
  // para el mensaje y los cambios pedidos.
  const estimado = Math.ceil(diagramaJson.length / 3.5) * 1.6 + 300;
  return Math.round(clamp(estimado, 512, 4096));
}

/**
 * Presupuesto de tokens para el modo foco (entidad seleccionada).
 * El modelo devuelve la entidad (posiblemente editada y MAS grande que la de
 * entrada) + sus relaciones tocantes + el mensaje. Calcularlo solo sobre la
 * entidad de entrada hacia truncar el output y el diff podia eliminar la
 * entidad/relaciones por error. Se estima sobre el contexto completo (entidad
 * + relaciones) con margen de crecimiento para los cambios pedidos.
 * @param contextoJson - Contexto de foco serializado (entidad + relaciones)
 * @returns Tokens maximos clampados a [512, 4096]
 */
export function maxTokensParaFoco(contextoJson: string): number {
  // ~3.5 caracteres por token en JSON espanol compacto; margen x2.2 + 400
  // para el mensaje y el crecimiento del output por las ediciones.
  const estimado = Math.ceil(contextoJson.length / 3.5) * 2.2 + 400;
  return Math.round(clamp(estimado, 512, 4096));
}

/**
 * Presupuesto de tokens para el agente SUPPORT (ayuda de uso).
 * Respuestas cortas en texto plano (~150 palabras).
 * @returns Tokens maximos clampados a [32, 1024]
 */
export function maxTokensSupport(): number {
  return Math.round(
    clamp(Number(process.env.AI_SUPPORT_MAX_TOKENS ?? '512'), 32, 1024),
  );
}

/** Lista publica modelada para el endpoint /ai/models. */
export function listarModelos(): Array<{
  id: string;
  nombre: string;
  contextoMax: number;
  soportaDesdeCero: boolean;
  /** False si el modelo no tiene URL configurada (ni propia ni por defecto). */
  disponible: boolean;
}> {
  return MODELOS_REGISTRO.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    contextoMax: m.contextoMax,
    soportaDesdeCero: m.soportaDesdeCero,
    disponible: leerEspacio(m.envVar) !== '',
  }));
}
