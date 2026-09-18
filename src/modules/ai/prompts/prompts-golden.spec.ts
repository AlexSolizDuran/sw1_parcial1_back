/**
 * Set dorado de los prompts del agente COPILOT.
 *
 * Guarda del soporte de nombre y multiplicidad en las relaciones: si alguien
 * simplifica el system prompt o los few-shot y se pierden los campos
 * "label"/"multiplicidad*", estos tests lo detectan. Sin red, sin DB.
 */
import { FEW_SHOT_EXAMPLES, FEW_SHOT_FOCO_EXAMPLES } from './few-shot';
import { systemPrompt } from './system-prompt';

describe('systemPrompt (contrato de relaciones)', () => {
  const prompt = systemPrompt();

  it('menciona las claves exactas de multiplicidad y label', () => {
    expect(prompt).toContain('"multiplicidadOrigen"');
    expect(prompt).toContain('"multiplicidadDestino"');
    expect(prompt).toContain('"label"');
  });

  it('musetra un ejemplo JSON de relacion con nombre y multiplicidades', () => {
    expect(prompt).toContain('"multiplicidadOrigen": "1"');
    expect(prompt).toContain('"multiplicidadDestino": "0..*"');
    expect(prompt).toContain('"label": "crea"');
  });
});

describe('FEW_SHOT_EXAMPLES (enseñanza de nombre y multiplicidad)', () => {
  it('tiene al menos un ejemplo con label y multiplicidades en la salida', () => {
    const conCampos = FEW_SHOT_EXAMPLES.filter((e) =>
      e.salida.relaciones?.some(
        (r) =>
          r.label !== undefined ||
          r.multiplicidadOrigen !== undefined ||
          r.multiplicidadDestino !== undefined,
      ),
    );
    expect(conCampos.length).toBeGreaterThan(0);
  });

  it('el ejemplo didáctico "tiene" sigue enseñando nombre + multiplicidades', () => {
    const ejemplo = FEW_SHOT_EXAMPLES.find((e) =>
      e.instruccion.includes('"tiene"'),
    );
    expect(ejemplo).toBeDefined();
    const relacion = ejemplo?.salida.relaciones?.[0];
    expect(relacion?.label).toBe('tiene');
    expect(relacion?.multiplicidadOrigen).toBe('0..*');
    expect(relacion?.multiplicidadDestino).toBe('1..*');
  });

  it('los campos de una relación no tocada se respetan en la salida', () => {
    const ejemplo = FEW_SHOT_EXAMPLES.find((e) =>
      e.instruccion.includes('email:string'),
    );
    expect(ejemplo).toBeDefined();
    const entrante = ejemplo?.diagramaActual.relaciones[0];
    const saliente = ejemplo?.salida.relaciones?.[0];
    expect(entrante?.label).toBe('crea');
    expect(entrante?.multiplicidadOrigen).toBe('1');
    expect(saliente?.label).toBe('crea');
    expect(saliente?.multiplicidadOrigen).toBe('1');
    expect(saliente?.multiplicidadDestino).toBe('0..*');
  });
});

describe('FEW_SHOT_FOCO_EXAMPLES (relaciones tocantes)', () => {
  it('las relaciones tocantes del foco pueden cargar label y multiplicidades', () => {
    const conCampos = FEW_SHOT_FOCO_EXAMPLES.filter((e) =>
      e.diagramaActual.relaciones.some(
        (r) =>
          r.label !== undefined ||
          r.multiplicidadOrigen !== undefined ||
          r.multiplicidadDestino !== undefined,
      ),
    );
    expect(conCampos.length).toBeGreaterThan(0);
  });

  it('tiene al menos un ejemplo que enseña la señal explícita "eliminar": true', () => {
    const conEliminar = FEW_SHOT_FOCO_EXAMPLES.filter((e) =>
      e.salida.relaciones?.some((r) => r.eliminar === true),
    );
    expect(conEliminar.length).toBeGreaterThan(0);
  });

  it('tiene un ejemplo donde la relación se preserva intacta al editar atributos', () => {
    // Busca un ejemplo con instruccion tipo "Agregale" + entrada con
    // relaciones y salida con las MISMAS relaciones (preservadas).
    const preservar = FEW_SHOT_FOCO_EXAMPLES.filter((e) => {
      const tieneEntrada = e.diagramaActual.relaciones.length > 0;
      const mismaSalida =
        e.salida.relaciones?.some(
          (r) =>
            r.eliminar !== true &&
            e.diagramaActual.relaciones.some(
              (act) =>
                act.id === r.id &&
                act.origen === r.origen &&
                act.destino === r.destino,
            ),
        ) ?? false;
      return tieneEntrada && mismaSalida;
    });
    expect(preservar.length).toBeGreaterThan(0);
  });
});
