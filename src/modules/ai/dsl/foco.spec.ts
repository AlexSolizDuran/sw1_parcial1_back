/**
 * Tests de la reconstruccion en modo foco.
 *
 * Guarda la regla de seguridad: la entidad seleccionada SOLO se elimina con
 * "entidades": [] (señal explicita del prompt). Si el modelo la devuelve con
 * otro id (drift) se remapea; si la omite sin señal de borrado se conserva.
 */
import type { CanonicalDiagram, CanonicalEntity } from './canonical';
import { reconstruirConFoco } from './foco';

const campo = (nombre: string, tipo: string) => ({
  visibilidad: 'private' as const,
  nombre,
  tipo,
});

/** Diagrama actual: Usuario (n1) --> Madera (n2), Usuario (n1) --> Pedido (n3). */
const ACTUAL: CanonicalDiagram = {
  entidades: [
    {
      id: 'n1',
      tipo: 'class',
      nombre: 'Usuario',
      atributos: [campo('usuario', 'string')],
      metodos: [],
    },
    { id: 'n2', tipo: 'class', nombre: 'Madera', atributos: [], metodos: [] },
    { id: 'n3', tipo: 'class', nombre: 'Pedido', atributos: [], metodos: [] },
  ],
  relaciones: [
    { id: 'e1', tipo: 'association', origen: 'n1', destino: 'n2' },
    { id: 'e2', tipo: 'association', origen: 'n1', destino: 'n3' },
  ],
};

const seleccionadaActual = (): CanonicalEntity => ACTUAL.entidades[1];

describe('reconstruirConFoco', () => {
  it('conserva la entidad editada con el mismo id y deja intactas las demas', () => {
    const editada: CanonicalEntity = {
      ...seleccionadaActual(),
      atributos: [campo('nombre', 'string')],
    };
    const salida: CanonicalDiagram = {
      entidades: [editada],
      relaciones: [
        { id: 'e1', tipo: 'association', origen: 'n1', destino: 'n2' },
      ],
    };

    const { diagrama, advertencias } = reconstruirConFoco(ACTUAL, salida, 'n2');

    expect(advertencias).toHaveLength(0);
    expect(diagrama.entidades).toHaveLength(3);
    expect(diagrama.entidades.find((e) => e.id === 'n2')).toEqual(editada);
    expect(diagrama.entidades.find((e) => e.id === 'n1')).toEqual(
      ACTUAL.entidades[0],
    );
    expect(diagrama.entidades.find((e) => e.id === 'n3')).toEqual(
      ACTUAL.entidades[2],
    );
    expect(diagrama.relaciones.map((r) => r.id).sort()).toEqual(['e1', 'e2']);
  });

  it('elimina la entidad solo con la señal explicita de "entidades": []', () => {
    const salida: CanonicalDiagram = { entidades: [], relaciones: [] };

    const { diagrama, advertencias } = reconstruirConFoco(ACTUAL, salida, 'n2');

    expect(advertencias).toHaveLength(0);
    expect(diagrama.entidades.map((e) => e.id)).toEqual(['n1', 'n3']);
    // La relacion tocante e1 cae con la entidad; la ajena e2 se preserva
    expect(diagrama.relaciones.map((r) => r.id)).toEqual(['e2']);
  });

  it('remapea la entidad con id driftado (mismo nombre) a su id canonico', () => {
    const driftada: CanonicalEntity = {
      ...seleccionadaActual(),
      id: 'n90',
      atributos: [campo('nombre', 'string')],
    };
    const salida: CanonicalDiagram = {
      entidades: [driftada],
      relaciones: [
        { id: 'e1', tipo: 'association', origen: 'n1', destino: 'n2' },
      ],
    };

    const { diagrama, advertencias } = reconstruirConFoco(ACTUAL, salida, 'n2');

    expect(advertencias.length).toBeGreaterThan(0);
    expect(advertencias[0]).toContain('n90');
    const reconstruida = diagrama.entidades.find((e) => e.id === 'n2');
    expect(reconstruida?.id).toBe('n2');
    expect(reconstruida?.atributos).toHaveLength(1);
    expect(diagrama.entidades.some((e) => e.id === 'n90')).toBe(false);
  });

  it('normaliza los extremos de relaciones que referencian el id driftado', () => {
    const driftada: CanonicalEntity = {
      ...seleccionadaActual(),
      id: 'n90',
      atributos: [],
    };
    const salida: CanonicalDiagram = {
      entidades: [driftada],
      // El modelo referencio la entidad con el id driftado en la relacion
      relaciones: [
        { id: 'e1', tipo: 'association', origen: 'n1', destino: 'n90' },
      ],
    };

    const { diagrama } = reconstruirConFoco(ACTUAL, salida, 'n2');

    expect(diagrama.relaciones.find((r) => r.id === 'e1')).toEqual({
      id: 'e1',
      tipo: 'association',
      origen: 'n1',
      destino: 'n2',
    });
  });

  it('acepta una unica entidad renombrada y la conserva como la seleccionada', () => {
    const renombrada: CanonicalEntity = {
      id: 'n90',
      tipo: 'class',
      nombre: 'Tabla',
      atributos: [],
      metodos: [],
    };
    const salida: CanonicalDiagram = {
      entidades: [renombrada],
      relaciones: [],
    };

    const { diagrama, advertencias } = reconstruirConFoco(ACTUAL, salida, 'n2');

    expect(advertencias.length).toBeGreaterThan(0);
    expect(advertencias[0]).toContain('n90');
    const reconstruida = diagrama.entidades.find((e) => e.id === 'n2');
    expect(reconstruida?.nombre).toBe('Tabla');
    expect(reconstruida?.id).toBe('n2');
  });

  it('conserva la entidad actual si el modelo la omite sin señal de borrado', () => {
    // El modelo devolvio entidades que NO corresponden a la seleccionada
    // (omision ambigua): la seleccionada NO se elimina, se conserva.
    const salidaAmbiguos: CanonicalDiagram = {
      entidades: [
        {
          id: 'n99',
          tipo: 'class',
          nombre: 'Otra',
          atributos: [],
          metodos: [],
        },
        {
          id: 'n98',
          tipo: 'class',
          nombre: 'Falsa',
          atributos: [],
          metodos: [],
        },
      ],
      relaciones: [],
    };

    const { diagrama, advertencias } = reconstruirConFoco(
      ACTUAL,
      salidaAmbiguos,
      'n2',
    );

    expect(advertencias.length).toBeGreaterThan(0);
    expect(advertencias[0]).toContain('se mantuvo sin cambios');
    // La entidad seleccionada NO se elimino: queda su version actual
    expect(diagrama.entidades.find((e) => e.id === 'n2')).toEqual(
      seleccionadaActual(),
    );
  });

  it('reemplaza las relaciones tocantes por la version del modelo', () => {
    const editada: CanonicalEntity = { ...seleccionadaActual(), id: 'n2' };
    const salida: CanonicalDiagram = {
      entidades: [editada],
      relaciones: [
        // e1 cambia a composicion
        { id: 'e1', tipo: 'composition', origen: 'n2', destino: 'n1' },
      ],
    };

    const { diagrama } = reconstruirConFoco(ACTUAL, salida, 'n2');

    const e1 = diagrama.relaciones.find((r) => r.id === 'e1');
    expect(e1).toEqual({
      id: 'e1',
      tipo: 'composition',
      origen: 'n2',
      destino: 'n1',
    });
  });

  it('agrega relaciones nuevas del modelo que tocan a la seleccionada', () => {
    const editada: CanonicalEntity = { ...seleccionadaActual(), id: 'n2' };
    const salida: CanonicalDiagram = {
      entidades: [editada],
      relaciones: [
        { id: 'e1', tipo: 'association', origen: 'n1', destino: 'n2' },
        { id: 'e9', tipo: 'dependency', origen: 'n2', destino: 'n3' },
      ],
    };

    const { diagrama } = reconstruirConFoco(ACTUAL, salida, 'n2');

    expect(diagrama.relaciones.map((r) => r.id).sort()).toEqual([
      'e1',
      'e2',
      'e9',
    ]);
  });

  it('ignora entidades ajenas que el modelo devuelva en foco', () => {
    const editada: CanonicalEntity = { ...seleccionadaActual(), id: 'n2' };
    const salida: CanonicalDiagram = {
      entidades: [
        editada,
        {
          id: 'n1',
          tipo: 'class',
          nombre: 'Usuario',
          atributos: [],
          metodos: [],
        },
      ],
      relaciones: [
        { id: 'e1', tipo: 'association', origen: 'n1', destino: 'n2' },
      ],
    };

    const { diagrama } = reconstruirConFoco(ACTUAL, salida, 'n2');

    // La version de n1 del modelo se IGNORA: gana la actual (alcance del foco)
    expect(diagrama.entidades.find((e) => e.id === 'n1')).toEqual(
      ACTUAL.entidades[0],
    );
  });

  it('conserva las relaciones tocantes que el modelo omite', () => {
    const editada: CanonicalEntity = { ...seleccionadaActual(), id: 'n2' };
    const salida: CanonicalDiagram = {
      entidades: [editada],
      // Sigue la señal de borrado de la entidad); no trae relaciones: al
      // conservarse la entidad, las relaciones tocantes NO deben borrarse.
      relaciones: [],
    };

    const { diagrama, advertencias } = reconstruirConFoco(ACTUAL, salida, 'n2');

    expect(advertencias).toHaveLength(0);
    expect(diagrama.relaciones.map((r) => r.id).sort()).toEqual(['e1', 'e2']);
    // La version conservada es la actual, sin cambios
    expect(diagrama.relaciones.find((r) => r.id === 'e1')).toEqual(
      ACTUAL.relaciones[0],
    );
  });

  it('elimina una relacion solo con la señal explicita "eliminar": true', () => {
    const editada: CanonicalEntity = { ...seleccionadaActual(), id: 'n2' };
    const salida: CanonicalDiagram = {
      entidades: [editada],
      relaciones: [
        {
          id: 'e1',
          tipo: 'association',
          origen: 'n1',
          destino: 'n2',
          label: 'produce',
          eliminar: true,
        },
      ],
    };

    const { diagrama } = reconstruirConFoco(ACTUAL, salida, 'n2');

    // e1 eliminada y e2 (ajena) intacta
    expect(diagrama.relaciones.map((r) => r.id)).toEqual(['e2']);
  });

  it('no deja viajar el campo "eliminar=false" en la relacion conservada', () => {
    const editada: CanonicalEntity = { ...seleccionadaActual(), id: 'n2' };
    const conEliminarFalse: CanonicalDiagram = {
      entidades: [editada],
      relaciones: [
        {
          id: 'e1',
          tipo: 'association',
          origen: 'n1',
          destino: 'n2',
          eliminar: false,
        },
      ],
    };

    const { diagrama } = reconstruirConFoco(ACTUAL, conEliminarFalse, 'n2');

    const e1 = diagrama.relaciones.find((r) => r.id === 'e1');
    // "eliminar": false no borra y el campo no debe viajar en la salida
    expect(e1).toBeDefined();
    expect(e1!.eliminar).toBeUndefined();
  });

  it('mezcla edicion y preservacion: actualiza lo devuelto y conserva lo omitido', () => {
    // Entidad con DOS relaciones tocantes: e1 (n1-n2) y e3 (n3-n2)
    const actualConDos: CanonicalDiagram = {
      entidades: ACTUAL.entidades,
      relaciones: [
        { id: 'e1', tipo: 'association', origen: 'n1', destino: 'n2' },
        { id: 'e3', tipo: 'association', origen: 'n3', destino: 'n2' },
        { id: 'e9', tipo: 'dependency', origen: 'n1', destino: 'n3' },
      ],
    };
    const editada: CanonicalEntity = { ...seleccionadaActual(), id: 'n2' };
    const salida: CanonicalDiagram = {
      entidades: [editada],
      relaciones: [
        // Solo e1 vuelve, y CAMBIADA (composicion)
        { id: 'e1', tipo: 'composition', origen: 'n2', destino: 'n1' },
      ],
    };

    const { diagrama } = reconstruirConFoco(actualConDos, salida, 'n2');

    expect(diagrama.relaciones.map((r) => r.id).sort()).toEqual([
      'e1',
      'e3',
      'e9',
    ]);
    expect(diagrama.relaciones.find((r) => r.id === 'e1')).toEqual({
      id: 'e1',
      tipo: 'composition',
      origen: 'n2',
      destino: 'n1',
    });
    // e3 omitida por el modelo se conservo tal cual
    expect(diagrama.relaciones.find((r) => r.id === 'e3')).toEqual(
      actualConDos.relaciones[1],
    );
  });
});
