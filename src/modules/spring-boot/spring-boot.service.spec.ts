/**
 * Tests del generador determinista Spring Boot.
 * Verifican el mapeo UML->JPA con el ejemplo de la tienda
 * (Categoria, Producto, Venta, DetalleVenta) sin base de datos.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import type { CanonicalEntity, CanonicalRelation } from '../ai/dsl/canonical';
import { generateController } from './generator/controller.generator';
import { generateRequest, generateResponse } from './generator/dto.generator';
import { generateEntity } from './generator/entity.generator';
import { isMany, toJavaType, toPluralPath } from './generator/java-types';
import { generatePom, generateProperties } from './generator/project.generator';
import { generateService } from './generator/service.generator';
import { SpringBootService } from './spring-boot.service';

/** Construye una entidad canonica minima para los tests. */
function entidadBase(id: string, nombre: string): CanonicalEntity {
  return { id, tipo: 'class', nombre, atributos: [], metodos: [] };
}

/** Monta el servicio con Prisma mockeado (dueno del workspace). */
async function montarServicio(): Promise<SpringBootService> {
  const prismaMock = {
    diagram: {
      findUnique: jest.fn().mockResolvedValue({
        workspace: { ownerId: 'user-1' },
        collaborators: [],
      }),
    },
  };
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      SpringBootService,
      { provide: PrismaService, useValue: prismaMock },
    ],
  }).compile();
  return module.get<SpringBootService>(SpringBootService);
}

describe('SpringBoot generadores', () => {
  it('mapea tipos UML a Java', () => {
    expect(toJavaType('int', new Set())).toBe('Integer');
    expect(toJavaType('String', new Set())).toBe('String');
    expect(toJavaType('desconocido', new Set())).toBe('String');
    expect(toJavaType('estado', new Set(['Estado']))).toBe('Estado');
  });

  it('detecta multiplicidad muchos', () => {
    expect(isMany('*')).toBe(true);
    expect(isMany('0..*')).toBe(true);
    expect(isMany('1')).toBe(false);
    expect(isMany(undefined)).toBe(false);
  });

  it('pluraliza paths REST', () => {
    expect(toPluralPath('Producto')).toBe('productos');
    expect(toPluralPath('Categoria')).toBe('categorias');
    expect(toPluralPath('DetalleVenta')).toBe('detalle-ventas');
  });

  it('genera @ManyToOne en Producto hacia Categoria', () => {
    const categoria = entidadBase('n1', 'Categoria');
    const producto: CanonicalEntity = {
      ...entidadBase('n2', 'Producto'),
      atributos: [
        { visibilidad: 'private', nombre: 'nombre', tipo: 'String' },
        { visibilidad: 'private', nombre: 'precio', tipo: 'double' },
      ],
    };
    const codigo = generateEntity(
      producto,
      [
        {
          id: 'e1',
          tipo: 'association',
          origen: 'n2',
          destino: 'n1',
          multiplicidadOrigen: '*',
          multiplicidadDestino: '1',
        },
      ],
      {
        packageBase: 'com.ejemplo.tienda',
        folder: 'producto',
        byId: new Map<string, CanonicalEntity>([
          ['n1', categoria],
          ['n2', producto],
        ]),
        enums: new Set(),
      },
    );
    expect(codigo).toContain('@Entity');
    expect(codigo).toContain('@ManyToOne');
    expect(codigo).toContain('private Categoria categoria;');
  });

  it('genera accessors clasicos (sin Lombok)', () => {
    const producto: CanonicalEntity = {
      ...entidadBase('n1', 'Producto'),
      atributos: [{ visibilidad: 'private', nombre: 'nombre', tipo: 'String' }],
    };
    const codigo = generateEntity(producto, [], {
      packageBase: 'com.ejemplo.tienda',
      folder: 'producto',
      byId: new Map<string, CanonicalEntity>([['n1', producto]]),
      enums: new Set(),
    });
    expect(codigo).toContain('public Long getId()');
    expect(codigo).toContain('public String getNombre()');
    expect(codigo).toContain('public void setNombre(String nombre)');
    expect(codigo).not.toContain('lombok');
  });

  it('genera composicion Venta -> DetalleVenta con cascade', () => {
    const venta = entidadBase('n1', 'Venta');
    const detalle = entidadBase('n2', 'DetalleVenta');
    const codigo = generateEntity(
      venta,
      [{ id: 'e1', tipo: 'composition', origen: 'n1', destino: 'n2' }],
      {
        packageBase: 'com.ejemplo.tienda',
        folder: 'venta',
        byId: new Map<string, CanonicalEntity>([
          ['n1', venta],
          ['n2', detalle],
        ]),
        enums: new Set(),
      },
    );
    expect(codigo).toContain('cascade = CascadeType.ALL');
    expect(codigo).toContain('orphanRemoval = true');
  });

  it('importa las interfaces que la clase implementa', () => {
    const interfaz: CanonicalEntity = {
      ...entidadBase('n1', 'IRepositorio'),
      tipo: 'interface',
    };
    const producto: CanonicalEntity = {
      ...entidadBase('n2', 'Producto'),
      atributos: [{ visibilidad: 'private', nombre: 'nombre', tipo: 'String' }],
    };
    const codigo = generateEntity(
      producto,
      [
        {
          id: 'e1',
          tipo: 'implementation',
          origen: 'n2',
          destino: 'n1',
        },
      ],
      {
        packageBase: 'com.ejemplo.tienda',
        folder: 'producto',
        byId: new Map<string, CanonicalEntity>([
          ['n1', interfaz],
          ['n2', producto],
        ]),
        enums: new Set(),
      },
    );
    // La clase implementa la interfaz y la importa (vive en otro paquete)
    expect(codigo).toContain('implements IRepositorio');
    expect(codigo).toContain(
      'import com.ejemplo.tienda.irepositorio.IRepositorio;',
    );
  });

  it('importa la enumeracion usada como tipo de atributo', () => {
    const estado: CanonicalEntity = {
      ...entidadBase('n1', 'Estado'),
      tipo: 'enumeration',
      literales: ['ACTIVO', 'INACTIVO'],
    };
    const producto: CanonicalEntity = {
      ...entidadBase('n2', 'Producto'),
      atributos: [
        { visibilidad: 'private', nombre: 'estado', tipo: 'Estado' },
        { visibilidad: 'private', nombre: 'creado', tipo: 'LocalDateTime' },
      ],
    };
    const codigo = generateEntity(producto, [], {
      packageBase: 'com.ejemplo.tienda',
      folder: 'producto',
      byId: new Map<string, CanonicalEntity>([
        ['n1', estado],
        ['n2', producto],
      ]),
      enums: new Set(['Estado']),
    });
    expect(codigo).toContain('@Enumerated(EnumType.STRING)');
    expect(codigo).toContain('import com.ejemplo.tienda.estado.Estado;');
    expect(codigo).toContain('import java.time.LocalDateTime;');
  });

  it('DTOs importan java.time, BigDecimal y enums', () => {
    const producto: CanonicalEntity = {
      ...entidadBase('n2', 'Producto'),
      atributos: [
        { visibilidad: 'private', nombre: 'estado', tipo: 'Estado' },
        { visibilidad: 'private', nombre: 'vencimiento', tipo: 'LocalDate' },
        { visibilidad: 'private', nombre: 'total', tipo: 'BigDecimal' },
      ],
    };
    const paquete = 'com.ejemplo.tienda.producto';
    const request = generateRequest(
      producto,
      [],
      new Map([['n2', producto]]),
      new Set(['Estado']),
      paquete,
    );
    const response = generateResponse(producto, new Set(['Estado']), paquete);
    expect(request).toContain('import java.time.LocalDate;');
    expect(request).toContain('import java.math.BigDecimal;');
    expect(response).toContain('import java.math.BigDecimal;');
    expect(request).toContain('import com.ejemplo.tienda.estado.Estado;');
    expect(response).toContain('import com.ejemplo.tienda.estado.Estado;');
  });

  it('composicion: el todo no lleva FK, la parte si', () => {
    const venta = entidadBase('n1', 'Venta');
    const detalle = entidadBase('n2', 'DetalleVenta');
    const rel: CanonicalRelation = {
      id: 'e1',
      tipo: 'composition',
      origen: 'n1',
      destino: 'n2',
    };
    const byId = new Map<string, CanonicalEntity>([
      ['n1', venta],
      ['n2', detalle],
    ]);
    // El todo (Venta) no debe recibir FK a DetalleVenta
    const serviceTodo = generateService('Venta', 'com.ejemplo.tienda.venta', {
      packageBase: 'com.ejemplo.tienda',
      entidad: venta,
      relaciones: [rel],
      byId,
    });
    expect(serviceTodo).not.toContain('DetalleVentaRepository');
    expect(serviceTodo).not.toContain('setDetalleVenta');
    // La parte (DetalleVenta) si lleva FK a Venta
    const requestParte = generateRequest(
      detalle,
      [rel],
      byId,
      new Set(),
      'com.ejemplo.tienda.detalleventa',
    );
    expect(requestParte).toContain('private Long ventaId;');
  });

  it('implementa los metodos de la interfaz (stubs)', () => {
    const interfaz: CanonicalEntity = {
      ...entidadBase('n1', 'IRepositorio'),
      tipo: 'interface',
      metodos: [
        { visibilidad: 'public', nombre: 'guardar', ret: 'void', params: [] },
      ],
    };
    const producto: CanonicalEntity = {
      ...entidadBase('n2', 'Producto'),
      atributos: [],
    };
    const codigo = generateEntity(
      producto,
      [
        {
          id: 'e1',
          tipo: 'implementation',
          origen: 'n2',
          destino: 'n1',
        },
      ],
      {
        packageBase: 'com.ejemplo.tienda',
        folder: 'producto',
        byId: new Map<string, CanonicalEntity>([
          ['n1', interfaz],
          ['n2', producto],
        ]),
        enums: new Set(),
      },
    );
    expect(codigo).toContain('@Override');
    expect(codigo).toContain('public void guardar() {');
  });

  it('genera controller con 5 endpoints', () => {
    const codigo = generateController(
      'Producto',
      'com.ejemplo.tienda.producto',
    );
    expect(codigo).toContain('@RestController');
    expect(codigo).toContain('"/api/productos"');
    expect(codigo).toContain('@GetMapping');
    expect(codigo).toContain('@PostMapping');
    expect(codigo).toContain('@PutMapping("/{id}")');
    expect(codigo).toContain('@DeleteMapping("/{id}")');
  });

  it('genera pom con Postgres y properties apuntando a la BD local', () => {
    expect(generatePom('com.ejemplo.tienda')).toContain('postgresql');
    expect(generatePom('com.ejemplo.tienda')).not.toContain('lombok');
    expect(generateProperties()).toContain(
      'jdbc:postgresql://localhost:5433/mi_proyecto',
    );
  });
});

describe('SpringBootService.generateModules', () => {
  it('genera proyecto Maven completo y corrible', async () => {
    const service = await montarServicio();

    const resultado = await service.generateModules('user-1', {
      diagramId: '11111111-1111-4111-8111-111111111111',
      snapshot: {
        nodes: [
          {
            id: 'a',
            type: 'class',
            data: {
              name: 'Producto',
              fields: [{ name: 'nombre', type: 'String' }],
              methods: [],
            },
          },
          {
            id: 'b',
            type: 'class',
            data: { name: 'Categoria', fields: [], methods: [] },
          },
        ],
        edges: [
          {
            id: 'e1',
            source: 'a',
            target: 'b',
            type: 'association',
            sourceMultiplicity: '*',
            targetMultiplicity: '1',
          },
        ],
      },
      packageBase: 'com.ejemplo.tienda',
    });

    const base = 'src/main/java/com/ejemplo/tienda';
    const paths = resultado.files.map((f) => f.path);
    // Modulo producto con layout Maven
    expect(resultado.moduloCount).toBe(2);
    expect(paths).toContain(`${base}/producto/Producto.java`);
    expect(paths).toContain(`${base}/producto/ProductoService.java`);
    expect(paths).toContain(`${base}/producto/ProductoController.java`);
    // Archivos base del proyecto
    expect(paths).toContain('pom.xml');
    expect(paths).toContain('src/main/resources/application.properties');
    expect(paths).toContain(`${base}/TiendaApplication.java`);
    expect(paths).toContain(`${base}/common/GlobalExceptionHandler.java`);
    expect(paths).toContain(`${base}/config/CorsConfig.java`);
    expect(paths).toContain('README.md');

    // El README explica como correrlo (pasos + problemas comunes)
    const readme =
      resultado.files.find((f) => f.path === 'README.md')?.content ?? '';
    expect(readme).toContain('CREATE DATABASE mi_proyecto');
    expect(readme).toContain('mvn spring-boot:run');
    expect(readme).toContain('swagger-ui.html');
    expect(readme).toContain('Solucion de problemas');

    // El servicio mapea campos y resuelve la FK sin TODOs
    const serviceContent =
      resultado.files.find((f) => f.path.endsWith('ProductoService.java'))
        ?.content ?? '';
    expect(serviceContent).toContain('entity.setNombre(req.getNombre())');
    expect(serviceContent).toContain('CategoriaRepository');
    expect(serviceContent).toContain('ResourceNotFoundException');
    expect(serviceContent).not.toContain('TODO');
  });
});
