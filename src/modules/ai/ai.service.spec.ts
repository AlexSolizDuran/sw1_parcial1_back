/**
 * Tests del formato del mensaje de usuario que recibe el modelo.
 *
 * Verifican que la clase seleccionada se mencione correctamente en el prompt:
 * con alcance restrictivo (checkbox "Solo") o como referencia sin limitar.
 */
import type { CanonicalDiagram } from './dsl/canonical';
import { formatearInstruccion } from './prompts/formatear-instruccion';

const DIAGRAMA: CanonicalDiagram = {
  entidades: [
    { id: 'n1', tipo: 'class', nombre: 'Usuario', atributos: [], metodos: [] },
    { id: 'n2', tipo: 'class', nombre: 'Madera', atributos: [], metodos: [] },
  ],
  relaciones: [],
};

describe('formatearInstruccion', () => {
  it('menciona la clase seleccionada como referencia (sin modo restrictivo)', () => {
    const texto = formatearInstruccion(
      'Agregá un campo a la clase seleccionada',
      DIAGRAMA,
      'agregar',
      false,
      'n2',
    );

    expect(texto).toContain('Elemento seleccionado en el lienzo');
    expect(texto).toContain('"Madera"');
    expect(texto).toContain('NO lo limites a él');
  });

  it('aplica el alcance restrictivo cuando el usuario lo pidió', () => {
    const texto = formatearInstruccion(
      'Eliminá esta tabla',
      DIAGRAMA,
      'agregar',
      true,
      'n2',
    );

    expect(texto).toContain('actuá SOLO sobre el elemento seleccionado');
  });

  it('no menciona selección cuando no hay ninguna', () => {
    const texto = formatearInstruccion(
      'Crea una clase nueva',
      DIAGRAMA,
      'agregar',
      false,
      null,
    );

    expect(texto).not.toContain('Elemento seleccionado');
  });

  it('indica el modo reemplazar cuando corresponde', () => {
    const texto = formatearInstruccion(
      'Generá el diagrama desde cero',
      DIAGRAMA,
      'reemplazar',
      false,
      null,
    );

    expect(texto).toContain('construí el diagrama COMPLETO desde cero');
  });

  it('menciona el id canonico si la selección no esta en el diagrama', () => {
    const texto = formatearInstruccion(
      'Editá la selección',
      DIAGRAMA,
      'agregar',
      false,
      'e1',
    );

    expect(texto).toContain('e1');
  });
});
