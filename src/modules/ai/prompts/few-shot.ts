/**
 * Ejemplos few-shot para el agente COPILOT.
 * Cada ejemplo es un par { instruccion, diagramaActual, diagramaEsperado }.
 * Se inyectan como mensajes user/assistant antes del caso real para que el
 * modelo imite el formato exacto del DSL canonico.
 */
import type { CanonicalDiagram, ModelOutput } from '../dsl/canonical';

interface Ejemplo {
  /** Instruccion simulada del usuario. */
  instruccion: string;
  /** Diagrama actual que recibe el modelo. */
  diagramaActual: CanonicalDiagram;
  /** JSON que el modelo deberia devolver. */
  salida: ModelOutput;
}

/** Ejemplos estaticos de alta calidad (pocos tokens). */
export const FEW_SHOT_EXAMPLES: Ejemplo[] = [
  {
    instruccion:
      'Agregá una clase "Autenticacion" con el atributo privado usuario:string y el metodo publico validar() que retorna boolean. Modo: agregar.',
    diagramaActual: {
      entidades: [
        {
          id: 'n1',
          tipo: 'class',
          nombre: 'Usuario',
          atributos: [{ visibilidad: 'private', nombre: 'id', tipo: 'string' }],
          metodos: [
            {
              visibilidad: 'public',
              nombre: 'login',
              params: [{ nombre: 'user', tipo: 'string' }],
              ret: 'boolean',
            },
          ],
        },
      ],
      relaciones: [],
    },
    salida: {
      mensaje: 'Agregué la clase Autenticacion con su atributo y metodo.',
      entidades: [
        {
          id: 'n1',
          tipo: 'class',
          nombre: 'Usuario',
          atributos: [{ visibilidad: 'private', nombre: 'id', tipo: 'string' }],
          metodos: [
            {
              visibilidad: 'public',
              nombre: 'login',
              params: [{ nombre: 'user', tipo: 'string' }],
              ret: 'boolean',
            },
          ],
        },
        {
          id: 'n2',
          tipo: 'class',
          nombre: 'Autenticacion',
          atributos: [
            { visibilidad: 'private', nombre: 'usuario', tipo: 'string' },
          ],
          metodos: [
            {
              visibilidad: 'public',
              nombre: 'validar',
              params: [],
              ret: 'boolean',
            },
          ],
        },
      ],
      relaciones: [],
    },
  },
  {
    instruccion:
      'Renombrá la clase "Usuario" a "Cuenta" y agregale el atributo protegido saldo:double.',
    diagramaActual: {
      entidades: [
        {
          id: 'n1',
          tipo: 'class',
          nombre: 'Usuario',
          atributos: [{ visibilidad: 'private', nombre: 'id', tipo: 'string' }],
          metodos: [],
        },
      ],
      relaciones: [],
    },
    salida: {
      mensaje: 'Renombré Usuario a Cuenta y le agregué saldo.',
      entidades: [
        {
          id: 'n1',
          tipo: 'class',
          nombre: 'Cuenta',
          atributos: [
            { visibilidad: 'private', nombre: 'id', tipo: 'string' },
            { visibilidad: 'protected', nombre: 'saldo', tipo: 'double' },
          ],
          metodos: [],
        },
      ],
      relaciones: [],
    },
  },
  {
    instruccion:
      'crea la clase madera y agrega el atributo nombre. Modo: agregar.',
    diagramaActual: {
      entidades: [],
      relaciones: [],
    },
    salida: {
      mensaje: 'Creé la clase Madera con el atributo nombre.',
      entidades: [
        {
          id: 'n1',
          tipo: 'class',
          nombre: 'Madera',
          atributos: [
            { visibilidad: 'private', nombre: 'nombre', tipo: 'string' },
          ],
          metodos: [],
        },
      ],
      relaciones: [],
    },
  },
  {
    instruccion:
      'Hacé que la clase "Producto" implemente la interfaz "IRepositorio". Modo: agregar.',
    diagramaActual: {
      entidades: [
        {
          id: 'n1',
          tipo: 'class',
          nombre: 'Producto',
          atributos: [
            { visibilidad: 'private', nombre: 'sku', tipo: 'string' },
          ],
          metodos: [],
        },
        {
          id: 'n2',
          tipo: 'interface',
          nombre: 'IRepositorio',
          atributos: [],
          metodos: [
            {
              visibilidad: 'public',
              nombre: 'guardar',
              params: [{ nombre: 'item', tipo: 'Producto' }],
              ret: 'void',
            },
          ],
        },
      ],
      relaciones: [],
    },
    salida: {
      mensaje: 'Hice que Producto implemente la interfaz IRepositorio.',
      entidades: [
        {
          id: 'n1',
          tipo: 'class',
          nombre: 'Producto',
          atributos: [
            { visibilidad: 'private', nombre: 'sku', tipo: 'string' },
          ],
          metodos: [],
        },
        {
          id: 'n2',
          tipo: 'interface',
          nombre: 'IRepositorio',
          atributos: [],
          metodos: [
            {
              visibilidad: 'public',
              nombre: 'guardar',
              params: [{ nombre: 'item', tipo: 'Producto' }],
              ret: 'void',
            },
          ],
        },
      ],
      relaciones: [
        { id: 'e1', tipo: 'implementation', origen: 'n1', destino: 'n2' },
      ],
    },
  },
  {
    instruccion:
      'Elimina la clase "Sesion" del diagrama. Modo: agregar.',
    diagramaActual: {
      entidades: [
        {
          id: 'n1',
          tipo: 'class',
          nombre: 'Usuario',
          atributos: [{ visibilidad: 'private', nombre: 'id', tipo: 'string' }],
          metodos: [],
        },
        {
          id: 'n2',
          tipo: 'class',
          nombre: 'Sesion',
          atributos: [{ visibilidad: 'private', nombre: 'token', tipo: 'string' }],
          metodos: [],
        },
        {
          id: 'n3',
          tipo: 'class',
          nombre: 'Pedido',
          atributos: [{ visibilidad: 'private', nombre: 'total', tipo: 'double' }],
          metodos: [],
        },
      ],
      relaciones: [
        { id: 'e1', tipo: 'association', origen: 'n1', destino: 'n2' },
      ],
    },
    salida: {
      mensaje: 'Eliminé la clase Sesion y su relación con Usuario.',
      entidades: [
        {
          id: 'n1',
          tipo: 'class',
          nombre: 'Usuario',
          atributos: [{ visibilidad: 'private', nombre: 'id', tipo: 'string' }],
          metodos: [],
        },
        {
          id: 'n3',
          tipo: 'class',
          nombre: 'Pedido',
          atributos: [{ visibilidad: 'private', nombre: 'total', tipo: 'double' }],
          metodos: [],
        },
      ],
      relaciones: [],
    },
  },
  {
    instruccion:
      'Agregale el atributo email:string a la clase "Usuario". Modo: agregar.',
    diagramaActual: {
      entidades: [
        {
          id: 'n1',
          tipo: 'class',
          nombre: 'Usuario',
          atributos: [{ visibilidad: 'private', nombre: 'id', tipo: 'string' }],
          metodos: [],
        },
        {
          id: 'n2',
          tipo: 'class',
          nombre: 'Pedido',
          atributos: [{ visibilidad: 'private', nombre: 'total', tipo: 'double' }],
          metodos: [],
        },
      ],
      relaciones: [
        { id: 'e1', tipo: 'association', origen: 'n1', destino: 'n2' },
      ],
    },
    salida: {
      mensaje: 'Agregué el atributo email a la clase Usuario.',
      entidades: [
        {
          id: 'n1',
          tipo: 'class',
          nombre: 'Usuario',
          atributos: [
            { visibilidad: 'private', nombre: 'id', tipo: 'string' },
            { visibilidad: 'private', nombre: 'email', tipo: 'string' },
          ],
          metodos: [],
        },
        {
          id: 'n2',
          tipo: 'class',
          nombre: 'Pedido',
          atributos: [{ visibilidad: 'private', nombre: 'total', tipo: 'double' }],
          metodos: [],
        },
      ],
      relaciones: [
        { id: 'e1', tipo: 'association', origen: 'n1', destino: 'n2' },
      ],
    },
  },
];

/**
 * Ejemplos para el modo foco (entidad seleccionada).
 * A diferencia de los normales, `diagramaActual` trae SOLO la entidad
 * seleccionada (primera posicion) y sus relaciones tocantes: es el
 * contexto reducido que el backend reconstruye despues.
 */
export const FEW_SHOT_FOCO_EXAMPLES: Ejemplo[] = [
  {
    instruccion: 'Agregale el atributo nombre a esta clase.',
    diagramaActual: {
      entidades: [
        {
          id: 'n2',
          tipo: 'class',
          nombre: 'Madera',
          atributos: [],
          metodos: [],
        },
      ],
      relaciones: [],
    },
    salida: {
      mensaje: 'Agregué el atributo nombre a la clase Madera.',
      entidades: [
        {
          id: 'n2',
          tipo: 'class',
          nombre: 'Madera',
          atributos: [
            { visibilidad: 'private', nombre: 'nombre', tipo: 'string' },
          ],
          metodos: [],
        },
      ],
      relaciones: [],
    },
  },
  {
    instruccion: 'Elimina esta tabla seleccionada.',
    diagramaActual: {
      entidades: [
        {
          id: 'n2',
          tipo: 'class',
          nombre: 'Sesion',
          atributos: [
            { visibilidad: 'private', nombre: 'token', tipo: 'string' },
          ],
          metodos: [],
        },
      ],
      relaciones: [
        { id: 'e1', tipo: 'association', origen: 'n1', destino: 'n2' },
      ],
    },
    salida: {
      mensaje: 'Eliminé la clase Sesion y su relación.',
      entidades: [],
      relaciones: [],
    },
  },
];
