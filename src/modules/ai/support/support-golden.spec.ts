/**
 * Set dorado del RAG: guardian del MANUAL y del mini-retrieval.
 * Si se edita el manual y una pregunta deja de mapear a su seccion,
 * estos tests lo detectan. Sin red, sin DB, sin gateway (ESM).
 */
import { MANUAL, buscarEntradas, manualHash } from './support-manual';

/** Pregunta -> id de la seccion esperada como top-1. */
const CASOS: Array<[string, string]> = [
  ['¿Cómo invito colaboradores a un diagrama?', 'colaboracion'],
  ['¿Qué puede hacer un VIEWER?', 'colaboracion'],
  ['¿Cómo genero el backend Spring Boot?', 'spring-boot'],
  ['¿Cómo corro el proyecto generado?', 'spring-boot'],
  ['¿Cómo exporto a XMI?', 'xmi'],
  ['¿Diferencia entre Umbrello y Enterprise Architect?', 'xmi'],
  ['¿Cómo creo una clase con atributos?', 'editor'],
  ['¿Cómo pongo la multiplicidad de una relación?', 'editor'],
  ['¿Cómo restauro una versión anterior?', 'versiones'],
  ['¿Cómo cambio mi contraseña?', 'cuenta'],
  ['¿Qué es un diagrama de clases?', 'conceptos-uml'],
];

describe('MANUAL (fuente del RAG)', () => {
  it('toda entrada tiene id unico, titulo, pasos y keywords', () => {
    const ids = MANUAL.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of MANUAL) {
      expect(e.titulo.trim().length).toBeGreaterThan(0);
      expect(e.pasos.trim().length).toBeGreaterThan(20);
      expect(e.keywords.length).toBeGreaterThan(0);
    }
  });

  it('el hash es estable para el mismo contenido', () => {
    expect(manualHash()).toBe(manualHash());
    expect(manualHash()).toHaveLength(64);
  });
});

describe('Mini-retrieval (mock del RAG)', () => {
  it.each(CASOS)('"%s" -> seccion %s', (pregunta: string, id: string) => {
    const [mejor] = buscarEntradas(pregunta, 1);
    expect(mejor?.id).toBe(id);
  });

  it('pregunta sin cobertura no matchea nada', () => {
    expect(buscarEntradas('¿Qué es la fotosíntesis?', 1)).toEqual([]);
  });
});
