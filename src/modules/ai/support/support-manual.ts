/**
 * Manual estructurado de la plataforma (unica fuente de verdad del
 * conocimiento del agente SUPPORT).
 * Cada entrada es UN chunk del RAG: la ingesta la vectoriza tal cual y el
 * mock la usa para el mini-retrieval. Agregar una funcionalidad nueva es
 * agregar UNA entrada aqui (titulo + pasos + keywords).
 */
import { createHash } from 'node:crypto';

/** Una seccion del manual = un chunk del RAG. */
export interface ManualEntry {
  /** Id estable (PK de help_chunks y clave del set dorado). */
  id: string;
  /** Titulo de la seccion (va al prompt y al mock). */
  titulo: string;
  /** Pasos de uso en español (el conocimiento propiamente dicho). */
  pasos: string;
  /** Patrones para el mini-retrieval del mock (no afectan a pgvector). */
  keywords: RegExp[];
}

/** Manual completo de la plataforma (10 secciones). */
export const MANUAL: ManualEntry[] = [
  {
    id: 'workspaces-diagramas',
    titulo: 'Workspaces y diagramas',
    pasos:
      'Cada usuario tiene sus espacios de trabajo (workspaces) privados. ' +
      'Crear workspace: boton "Nuevo workspace" en el dashboard; renombrar y eliminar ' +
      'se hacen desde la tarjeta del workspace. ' +
      'Crear diagrama: dashboard > workspace > "Nuevo diagrama". ' +
      'Renombrar diagrama: boton lapiz junto al nombre (clic en el nombre abre el diagrama). ' +
      'Eliminar diagrama: boton eliminar (pide confirmacion). ' +
      'Los diagramas se ordenan y agrupan dentro del workspace. ' +
      'Los diagramas que otros comparten contigo aparecen en "Compartidos contigo" del dashboard.',
    keywords: [
      /workspace|espacio de trabajo/i,
      /crear.*diagram|nuevo diagram/i,
      /renombrar|eliminar.*diagram|ordenar|agrupar/i,
    ],
  },
  {
    id: 'editor',
    titulo: 'Editor de clases',
    pasos:
      'Boton "+ Agregar" > Clase, Interfaz, Clase abstracta o Enumeracion. ' +
      'Click en una clase para editar nombre, atributos (visibilidad, nombre, tipo) y metodos en el panel de propiedades lateral. ' +
      'Arrastra desde los bordes de un nodo para crear relaciones; el tipo (herencia, realizacion, asociacion, agregacion, composicion, dependencia) ' +
      'y la multiplicidad (1, 0..1, *, 0..*, 1..*) se editan en propiedades. ' +
      'Atajos: todavia no hay deshacer ni borrado con teclado. ' +
      'Arriba a la derecha estan los controles de zoom, encuadre (fit to view) y minimapa.',
    keywords: [
      /clase|nodo|atributo|metodo/i,
      /relacion|herencia|composicion|multiplicidad/i,
      /agregar|editar.*clase|panel.*propiedades/i,
      /deshacer|atajo|minimapa|zoom/i,
    ],
  },
  {
    id: 'colaboracion',
    titulo: 'Colaboracion e invitaciones',
    pasos:
      'Boton "Colaboradores" > invitar con "usuario o email" y rol EDITOR (puede editar) o VIEWER (solo lectura); ' +
      'el dueño del diagrama es OWNER automaticamente. ' +
      'En la barra superior se ven los avatares de los usuarios conectados (presencia). ' +
      'Al seleccionar un elemento se bloquea para los demas (locks); click en el lienzo vacio libera tus bloqueos.',
    keywords: [
      /invit|colaborador|compartir|miembro/i,
      /rol|viewer|editor|owner|permiso/i,
      /presencia|bloqueo|lock|avatar/i,
    ],
  },
  {
    id: 'versiones',
    titulo: 'Versiones',
    pasos:
      'El boton "Versiones" abra el historial: cada cambio del diagrama genera una ' +
      'version automaticamente y se guarda en tu navegador. Restaura cualquiera con ' +
      '"Restaurar" (solo OWNER/EDITOR).',
    keywords: [/version|restaur|recuper|historial/i],
  },
  {
    id: 'xmi',
    titulo: 'Exportar, importar y descargar imagen',
    pasos:
      'Boton "Exportar" en la barra del editor. Exportar XMI: Umbrello (XMI 1.2, UML 1.4) o Enterprise Architect (XMI 2.5.1, UML 2.5 estandar); descarga un .xmi. ' +
      'Importar XMI: carga un .xmi de Umbrello o Enterprise y reemplaza el lienzo (solo OWNER/EDITOR). ' +
      'Exportar PNG o SVG: descarga una imagen del diagrama actual.',
    keywords: [
      /xmi|export|import|umbrello|enterprise/i,
      /png|svg|imagen|descargar.*diagram/i,
    ],
  },
  {
    id: 'imagen',
    titulo: 'Importar diagrama desde imagen',
    pasos:
      'Boton "Importar imagen" en la barra del editor. Sube una foto o screenshot de un diagrama de clases UML. ' +
      'La IA detecta las clases, interfaces, atributos, metodos y relaciones, y las coloca en el lienzo. ' +
      'Sobreescribe el diagrama actual (solo OWNER/EDITOR). Formatos: JPG, PNG, etc. Maximo 8 MB.',
    keywords: [
      /importar.*imagen|imagen.*diagram|foto.*diagram|subir.*foto|screenshot|clases.*imagen/i,
      /detectar.*clases|ocr.*uml|vision/i,
    ],
  },
  {
    id: 'copilot',
    titulo: 'Chat COPILOT (editar con IA)',
    pasos:
      'El panel de chat edita el diagrama: describe el cambio ("crea la clase Cliente con nombre y email"). ' +
      'En modo Build los cambios se aplican directamente; en modo Plan puedes ver la ' +
      'vista previa y cancelar con Descartar. Los VIEWER solo pueden planificar (Build bloqueado). ' +
      'Modo agregar: edita sobre lo actual. Modo reemplazar: construye desde cero. ' +
      'Alcance "seleccion": solo toca el elemento seleccionado.',
    keywords: [
      /copilot|chat.*edit|aplicar|descartar/i,
      /vista previa|modo.*agregar|modo.*reemplazar|seleccion/i,
    ],
  },
  {
    id: 'spring-boot',
    titulo: 'Generar Spring Boot',
    pasos:
      'Boton "Spring Boot" > escribe el paquete base (ej. com.ejemplo.tienda) > Generar. ' +
      'Veras una carpeta por tabla con Entity, Repository, Service, Controller y DTOs, mas pom.xml y configuracion. Descarga todo en .zip. ' +
      'Para correrlo (ejecutar el proyecto con maven): 1) crea la base local: psql -h localhost -p 5433 -U postgres -c "CREATE DATABASE mi_proyecto;" 2) descomprime, 3) mvn spring-boot:run. Las tablas las crea Hibernate solo (spring.datasource.url apunta a jdbc:postgresql://localhost:5433/mi_proyecto).',
    keywords: [
      /spring|boot|backend|genera|zip|maven|mvn|corr|ejecut|proyecto/i,
    ],
  },
  {
    id: 'cuenta',
    titulo: 'Cuenta',
    pasos:
      'Registro con email y contraseña; el inicio de sesion es con usuario y contraseña. ' +
      'Cambia nombre, usuario y contraseña desde el menu de cuenta (perfil).',
    keywords: [/cuenta|login|registro|contraseña|perfil|sesion|iniciar/i],
  },
  {
    id: 'ayuda',
    titulo: 'Ayuda y soporte',
    pasos:
      'El boton "?" abre este chat de ayuda en cualquier pagina tras el login. ' +
      'La conversacion se guarda en tu navegador (por usuario) y puedes borrarla con "Limpiar". ' +
      'Respondo solo sobre el uso de la plataforma.',
    keywords: [/ayuda|soporte|limpiar|boton.*\?/i, /hola|buenas|gracias/i],
  },
  {
    id: 'conceptos-uml',
    titulo: 'Conceptos UML: qué es un diagrama de clases',
    pasos:
      'Un diagrama de clases UML modela la estructura de un sistema: cada clase tiene ' +
      'nombre, atributos y metodos, y las clases se conectan con relaciones como asociacion, ' +
      'herencia, realizacion, composicion, agregacion y dependencia, con su multiplicidad ' +
      '(asociacion, agregacion y composicion). ' +
      'Sirve para disenar y comunicar la arquitectura antes de programarla.',
    keywords: [
      /qu[eé] es.*diagram|definic.*diagram/i,
      /diagrama.*clase|uml|concepto/i,
    ],
  },
];

/**
 * Hash del contenido del manual (control de ingesta: solo re-vectoriza
 * cuando el manual cambia de verdad).
 * @returns sha256 de id+titulo+pasos de todas las entradas
 */
export function manualHash(): string {
  const material = MANUAL.map((e) => `${e.id}|${e.titulo}|${e.pasos}`).join(
    '\n',
  );
  return createHash('sha256').update(material).digest('hex');
}

/**
 * Mini-retrieval en memoria para el mock (sin red ni pgvector).
 * Puntua entradas por coincidencias de keywords sobre la pregunta.
 * @param pregunta - Pregunta del usuario
 * @param top - Cuantas entradas devolver
 * @returns Entradas ordenadas por puntaje (solo puntaje > 0)
 */
export function buscarEntradas(pregunta: string, top = 3): ManualEntry[] {
  const puntuadas = MANUAL.map((e) => ({
    entrada: e,
    puntos: e.keywords.reduce(
      (acc, re) => acc + (re.test(pregunta) ? 1 : 0),
      0,
    ),
  }))
    .filter((p) => p.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, top);
  return puntuadas.map((p) => p.entrada);
}

/**
 * Formatea una entrada para mostrarla como respuesta de ayuda.
 * @param entrada - Entrada del manual
 * @returns Texto "Titulo: pasos"
 */
export function formatearEntrada(entrada: ManualEntry): string {
  return `${entrada.titulo}: ${entrada.pasos}`;
}
