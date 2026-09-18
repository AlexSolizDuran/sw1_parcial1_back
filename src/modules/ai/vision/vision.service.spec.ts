/**
 * Tests del VisionService: acceso al diagrama, validacion del DSL del
 * microservicio y calculo de acciones del modo reemplazar.
 *
 * vision.gateway.ts importa @nestjs/config (ESM) y jest corre en CommonJS:
 * se mockea el modulo (misma estrategia que embeddings.service.spec.ts).
 */
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

jest.mock('@nestjs/config', () => ({
  ConfigService: class {
    private readonly env: Record<string, string | undefined>;
    constructor(env: Record<string, string | undefined>) {
      this.env = env;
    }
    get(clave: string): string | undefined {
      return this.env[clave];
    }
  },
}));

import { PrismaService } from '../../../prisma/prisma.service';
import type { ArchivoImagen } from './vision.gateway';
import { VisionGateway, VisionGatewayError } from './vision.gateway';
import { VisionService } from './vision.service';

const IMAGEN: ArchivoImagen = {
  originalname: 'diagrama.png',
  mimetype: 'image/png',
  buffer: Buffer.from('foto-falsa'),
  size: 11,
};

const DSL_NUEVO = {
  entidades: [
    {
      id: 'n1',
      tipo: 'class',
      nombre: 'Cliente',
      atributos: [{ visibilidad: 'private', nombre: 'id', tipo: 'string' }],
      metodos: [],
    },
    {
      id: 'n2',
      tipo: 'enumeration',
      nombre: 'Estado',
      atributos: [],
      metodos: [],
      literales: ['ACTIVO', 'INACTIVO'],
    },
  ],
  relaciones: [],
};

describe('VisionService', () => {
  const crearServicio = (prisma: unknown, gateway: unknown) =>
    new VisionService(prisma as PrismaService, gateway as VisionGateway);

  const diagramRoot = {
    workspace: { ownerId: 'owner-1' },
    collaborators: [],
  };

  describe('acceso al diagrama', () => {
    it('rechaza a un colaborador VIEWER (solo lectura)', async () => {
      const prisma = {
        diagram: {
          findUnique: jest.fn().mockResolvedValue({
            ...diagramRoot,
            collaborators: [{ role: 'VIEWER' }],
          }),
        },
      } as unknown as PrismaService;
      const gateway = {} as unknown as VisionGateway;
      const servicio = crearServicio(prisma, gateway);

      await expect(
        servicio.importarImagen('d1', 'user-1', { snapshot: '{}' }, IMAGEN),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rechaza a un usuario sin acceso', async () => {
      const prisma = {
        diagram: {
          findUnique: jest.fn().mockResolvedValue(diagramRoot),
        },
      } as unknown as PrismaService;
      const gateway = {} as unknown as VisionGateway;
      const servicio = crearServicio(prisma, gateway);

      await expect(
        servicio.importarImagen('d1', 'user-1', { snapshot: '{}' }, IMAGEN),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lanza 404 si el diagrama no existe', async () => {
      const prisma = {
        diagram: { findUnique: jest.fn().mockResolvedValue(null) },
      } as unknown as PrismaService;
      const gateway = {} as unknown as VisionGateway;
      const servicio = crearServicio(prisma, gateway);

      await expect(
        servicio.importarImagen('d1', 'user-1', { snapshot: '{}' }, IMAGEN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('cuerpo del microservicio', () => {
    const prisma = {
      diagram: {
        findUnique: jest.fn().mockResolvedValue({
          ...diagramRoot,
          collaborators: [],
        }),
      },
    } as unknown as PrismaService;

    it('rechaza con 400 si no se detectan entidades', async () => {
      const gateway = {
        extraerDiagrama: jest.fn().mockResolvedValue({
          entidades: [],
          relaciones: [],
        }),
      } as unknown as VisionGateway;
      const servicio = crearServicio(prisma, gateway);

      await expect(
        servicio.importarImagen('d1', 'owner-1', { snapshot: '{}' }, IMAGEN),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza con 502 si el DSL no cumple el contrato', async () => {
      const gateway = {
        extraerDiagrama: jest.fn().mockResolvedValue({
          entidades: [{ id: 'n1', tipo: 'misterio', nombre: 'X' }],
          relaciones: [],
        }),
      } as unknown as VisionGateway;
      const servicio = crearServicio(prisma, gateway);

      await expect(
        servicio.importarImagen('d1', 'owner-1', { snapshot: '{}' }, IMAGEN),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('rechaza con 502 si el Space devuelve un error interno', async () => {
      const gateway = {
        extraerDiagrama: jest
          .fn()
          .mockRejectedValue(
            new VisionGatewayError('El microservicio de vision fallo: OOM'),
          ),
      } as unknown as VisionGateway;
      const servicio = crearServicio(prisma, gateway);

      await expect(
        servicio.importarImagen('d1', 'owner-1', { snapshot: '{}' }, IMAGEN),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('modo reemplazar', () => {
    const prisma = {
      diagram: {
        findUnique: jest.fn().mockResolvedValue({
          ...diagramRoot,
          collaborators: [],
        }),
      },
    } as unknown as PrismaService;

    it('desde un lienzo vacio devuelve solo acciones de creacion', async () => {
      const gateway = {
        extraerDiagrama: jest.fn().mockResolvedValue(DSL_NUEVO),
      } as unknown as VisionGateway;
      const servicio = crearServicio(prisma, gateway);

      const respuesta = await servicio.importarImagen(
        'd1',
        'owner-1',
        { snapshot: '{}' },
        IMAGEN,
      );

      const creaciones = respuesta.acciones.filter(
        (a) => a.tipo === 'createEntidad',
      );
      expect(creaciones).toHaveLength(2);
      expect(respuesta.advertencias).toEqual([]);
    });

    it('elimina lo que ya no existe en la imagen (reemplazo total)', async () => {
      const gateway = {
        extraerDiagrama: jest.fn().mockResolvedValue({
          entidades: [
            {
              id: 'vis-n1',
              tipo: 'class',
              nombre: 'Nueva',
              atributos: [],
              metodos: [],
            },
          ],
          relaciones: [],
        }),
      } as unknown as VisionGateway;
      const servicio = crearServicio(prisma, gateway);
      const snapshot = JSON.stringify({
        nodes: [
          {
            id: 'rf-1',
            type: 'class',
            position: { x: 0, y: 0 },
            data: { name: 'Vieja' },
          },
        ],
        edges: [],
      });

      const respuesta = await servicio.importarImagen(
        'd1',
        'owner-1',
        { snapshot },
        IMAGEN,
      );

      const eliminaciones = respuesta.acciones.filter(
        (a) => a.tipo === 'deleteEntidad',
      );
      const creaciones = respuesta.acciones.filter(
        (a) => a.tipo === 'createEntidad',
      );
      expect(eliminaciones).toHaveLength(1);
      expect(eliminaciones[0]?.id).toBe('rf-1');
      expect(creaciones).toHaveLength(1);
    });

    it('rechaza un snapshot corrupto con 400', async () => {
      const gateway = {
        extraerDiagrama: jest.fn().mockResolvedValue(DSL_NUEVO),
      } as unknown as VisionGateway;
      const servicio = crearServicio(prisma, gateway);

      await expect(
        servicio.importarImagen('d1', 'owner-1', { snapshot: '{roto' }, IMAGEN),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
