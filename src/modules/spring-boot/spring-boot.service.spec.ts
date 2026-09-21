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

  it('el atributo id (id/Id/ID) del diagrama se absorbe en la PK Long y no se duplica', () => {
    for (const nombre of ['id', 'Id', 'ID']) {
      const producto: CanonicalEntity = {
        ...entidadBase('n1', 'Producto'),
        atributos: [
          { visibilidad: 'private', nombre, tipo: 'String' },
          { visibilidad: 'private', nombre: 'nombre', tipo: 'String' },
        ],
      };
      const codigo = generateEntity(producto, [], {
        packageBase: 'com.ejemplo.tienda',
        folder: 'producto',
        byId: new Map<string, CanonicalEntity>([['n1', producto]]),
        enums: new Set(),
      });
      // La PK Long auto-generada permanece, sin importar el tipo declarado
      expect(codigo).toContain('@Id');
      expect(codigo).toContain(
        '@GeneratedValue(strategy = GenerationType.IDENTITY)',
      );
      expect(codigo.match(/private Long id;/g)).toHaveLength(1);
      expect(codigo).not.toContain('private String id;');
    }
  });

  it('Request sin id y Response con UN solo Long id', () => {
    const producto: CanonicalEntity = {
      ...entidadBase('n1', 'Producto'),
      atributos: [
        { visibilidad: 'private', nombre: 'ID', tipo: 'String' },
        { visibilidad: 'private', nombre: 'nombre', tipo: 'String' },
      ],
    };
    const byId = new Map<string, CanonicalEntity>([['n1', producto]]);
    // El body del POST/PUT no pide la PK: la BD la genera
    const request = generateRequest(
      producto,
      [],
      byId,
      new Set(),
      'com.ejemplo.tienda.producto',
    );
    expect(request).toContain('private String nombre;');
    expect(request).not.toMatch(/private \w+ id;/);
    // El Response expone la PK una sola vez (Long)
    const response = generateResponse(
      producto,
      new Set(),
      'com.ejemplo.tienda.producto',
    );
    expect(response.match(/private Long id;/g)).toHaveLength(1);
    expect(response).not.toContain('private String id;');
  });

  it('el service no copia el id desde el Request (la BD lo genera)', () => {
    const producto: CanonicalEntity = {
      ...entidadBase('n1', 'Producto'),
      atributos: [
        { visibilidad: 'private', nombre: 'id', tipo: 'String' },
        { visibilidad: 'private', nombre: 'nombre', tipo: 'String' },
      ],
    };
    const codigo = generateService('Producto', 'com.ejemplo.tienda.producto', {
      packageBase: 'com.ejemplo.tienda',
      entidad: producto,
      relaciones: [],
      byId: new Map<string, CanonicalEntity>([['n1', producto]]),
    });
    expect(codigo).not.toContain('setId(');
    expect(codigo).toContain('entity.setNombre(req.getNombre())');
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
    expect(codigo).toContain('"/productos"');
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
    // Puerto fijo 8081 (la app movil lo usa hardcodeado)
    expect(generateProperties()).toContain('server.port=8081');
  });
});

describe('SpringBootService.generateModules', () => {
  it('sin screens explicitas deriva las screens del diagrama y genera el proyecto', async () => {
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
    // Cada clase del diagrama es una screen: clase Producto -> Productos
    expect(resultado.moduloCount).toBe(2);
    expect(paths).toContain(`${base}/productos/Productos.java`);
    expect(paths).toContain(`${base}/productos/ProductosService.java`);
    expect(paths).toContain(`${base}/productos/ProductosController.java`);
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

    // El servicio mapea campos y resuelve la FK de la relacion Producto->Categoria
    const serviceContent =
      resultado.files.find((f) => f.path.endsWith('ProductosService.java'))
        ?.content ?? '';
    expect(serviceContent).toContain('entity.setNombre(req.getNombre())');
    expect(serviceContent).toContain('CategoriasRepository');
    expect(serviceContent).toContain('ResourceNotFoundException');
    expect(serviceContent).not.toContain('TODO');
  });
});

describe('SpringBootService.generateModules con screens', () => {
  const screensEjemplo = [
    {
      id: 'customers',
      list: { method: 'GET', path: '/customers' },
      search: { method: 'GET', path: '/customers/search?q={q}' },
      create: { method: 'POST', path: '/customers' },
      update: { method: 'PUT', path: '/customers/{id}' },
      delete: { method: 'DELETE', path: '/customers/{id}' },
      searchFields: ['name', 'email'],
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'email', type: 'text' },
        {
          name: 'category_id',
          type: 'select',
          from: { screen: 'categories', of: 'name' },
        },
      ],
    },
    {
      id: 'categories',
      list: { method: 'GET', path: '/categories' },
      create: { method: 'POST', path: '/categories' },
      fields: [{ name: 'name', type: 'text', required: true }],
    },
  ];

  it('genera un modulo por screen con rutas exactas del JSON (sin /api)', async () => {
    const service = await montarServicio();
    const resultado = await service.generateModules('user-1', {
      diagramId: '11111111-1111-4111-8111-111111111111',
      snapshot: { nodes: [] },
      packageBase: 'com.ejemplo.tienda',
      screens: screensEjemplo,
    });

    const base = 'src/main/java/com/ejemplo/tienda';
    const paths = resultado.files.map((f) => f.path);
    expect(resultado.moduloCount).toBe(2);
    // Modulo customers
    expect(paths).toContain(`${base}/customers/Customers.java`);
    expect(paths).toContain(`${base}/customers/CustomersController.java`);
    expect(paths).toContain(`${base}/customers/CustomersService.java`);
    expect(paths).toContain(`${base}/customers/CustomersRepository.java`);
    // Modulo categories
    expect(paths).toContain(`${base}/categories/Categories.java`);
    // Base del proyecto siempre se genera
    expect(paths).toContain('pom.xml');
    expect(paths).toContain(`${base}/TiendaApplication.java`);

    // Controller con rutas exactas, sin /api, con GET /{id} y OpenAPI
    const controller =
      resultado.files.find((f) =>
        f.path.endsWith('customers/CustomersController.java'),
      )?.content ?? '';
    expect(controller).toContain('@RequestMapping("/customers")');
    expect(controller).toContain('@GetMapping("/search")');
    expect(controller).toContain(
      '@RequestParam(name = "q", required = false) String q',
    );
    expect(controller).not.toContain('/api/');
    // GET /{id}: el movil edita con fetchOne (evita la caida a cache)
    expect(controller).toContain('@GetMapping("/{id}")');
    expect(controller).toContain('findById(@PathVariable Long id)');
    // Metadatos OpenAPI: dan nombres/grupos utiles al movil
    expect(controller).toContain('@Tag(name = "Customers"');
    expect(controller).toContain('@Operation(');
    expect(controller).toContain(
      'import io.swagger.v3.oas.annotations.Operation;',
    );

    // Entidad con FK real hacia Categories (@ManyToOne)
    const entity =
      resultado.files.find((f) =>
        f.path.endsWith('customers/Customers.java'),
      )?.content ?? '';
    expect(entity).toContain('@ManyToOne');
    expect(entity).toContain('@JoinColumn(name = "category_id")');
    expect(entity).toContain('private Categories categoryId;');

    // Response con la FK como id escalar (Long), no objeto anidado
    const response =
      resultado.files.find((f) =>
        f.path.endsWith('customers/CustomersResponse.java'),
      )?.content ?? '';
    expect(response).toContain('private Long categoryId;');
    expect(response).not.toContain('private Categories categoryId;');
    // El JSON usa el nombre exacto del DSL (snake_case), no el camelCase
    expect(response).toContain('@JsonProperty("category_id")');

    // Request igual: la FK entra como Long con su nombre del DSL
    const request =
      resultado.files.find((f) =>
        f.path.endsWith('customers/CustomersRequest.java'),
      )?.content ?? '';
    expect(request).toContain('private Long categoryId;');
    expect(request).toContain('@JsonProperty("category_id")');
    expect(request).not.toContain('private Categories categoryId;');

    // Mapper resuelve el id de la entidad (entity.getCategoryId().getId())
    const mapper =
      resultado.files.find((f) =>
        f.path.endsWith('customers/CustomersMapper.java'),
      )?.content ?? '';
    expect(mapper).toContain('entity.getCategoryId().getId()');
    expect(mapper).not.toContain('Categories');

    // El service resuelve la FK con CategoriesRepository
    const serviceContent =
      resultado.files.find((f) =>
        f.path.endsWith('customers/CustomersService.java'),
      )?.content ?? '';
    expect(serviceContent).toContain('CategoriesRepository');
    expect(serviceContent).toContain('search');
    expect(serviceContent).toContain('getEmail()');
  });

  it('expone GET /meta/screens con el screens.json embebido', async () => {
    const service = await montarServicio();
    const resultado = await service.generateModules('user-1', {
      diagramId: '11111111-1111-4111-8111-111111111111',
      snapshot: { nodes: [] },
      packageBase: 'com.ejemplo.tienda',
      screens: screensEjemplo,
    });

    const json = resultado.files.find((f) =>
      f.path.endsWith('resources/screens.json'),
    )?.content;
    expect(json).toBeDefined();
    const parsed = JSON.parse(json!);
    // La app movil espera {"screens":[...]}, no un array plano
    expect(Array.isArray(parsed)).toBe(false);
    expect(Array.isArray(parsed.screens)).toBe(true);
    expect(parsed.screens[0].id).toBe('customers');
    // Rutas sin /api
    expect(parsed.screens[0].list.path).toBe('/customers');

    const meta =
      resultado.files.find((f) =>
        f.path.endsWith('meta/MetaController.java'),
      )?.content ?? '';
    expect(meta).toContain('@RequestMapping("/meta")');
    expect(meta).toContain('@GetMapping(value = "/screens"');
    expect(meta).not.toContain('/api/');
  });

  it('normaliza rutas con /api y respeta list/search/create/update/delete', () => {
    const { normalizarPath } = require('./screens/screens.parser');
    expect(normalizarPath('/api/customers')).toBe('/customers');
    expect(normalizarPath('customers')).toBe('/customers');
    expect(normalizarPath('/customers/')).toBe('/customers');
  });

  it('un field id (String) del screen se absorbe en la PK Long sin duplicar', async () => {
    const service = await montarServicio();
    const resultado = await service.generateModules('user-1', {
      diagramId: '11111111-1111-4111-8111-111111111111',
      snapshot: { nodes: [] },
      packageBase: 'com.ejemplo.tienda',
      screens: [
        {
          id: 'productos',
          list: { method: 'GET', path: '/productos' },
          create: { method: 'POST', path: '/productos' },
          update: { method: 'PUT', path: '/productos/{id}' },
          delete: { method: 'DELETE', path: '/productos/{id}' },
          searchFields: ['nombre'],
          fields: [
            { name: 'id', type: 'text' },
            { name: 'nombre', type: 'text', required: true },
          ],
        },
      ],
    });

    const base = 'src/main/java/com/ejemplo/tienda/productos';
    const ent = (nombre: string) =>
      resultado.files.find((f) => f.path === `${base}/${nombre}.java`)?.content ??
      '';
    const entity = ent('Productos');
    // PK Long unica, automatica, sin columnas duplicadas
    expect(entity.match(/private Long id;/g)).toHaveLength(1);
    expect(entity).not.toContain('private String id;');
    expect(entity).toContain(
      '@GeneratedValue(strategy = GenerationType.IDENTITY)',
    );
    // Response: un solo id Long
    expect(ent('ProductosResponse').match(/private Long id;/g)).toHaveLength(1);
    expect(ent('ProductosResponse')).not.toContain('private String id;');
    // Request: sin id (lo genera la BD), con el resto de campos
    const request = ent('ProductosRequest');
    expect(request).toContain('private String nombre;');
    expect(request).not.toMatch(/private \w+ id;/);
  });
});

describe('screens.deriver (diagrama -> screens)', () => {
  const { derivarScreensDeDiagrama } = require('./screens/screens.deriver');

  it('genera 1 screen por clase con rutas plurales sin /api', () => {
    const screens = derivarScreensDeDiagrama({
      entidades: [
        {
          id: 'n1',
          tipo: 'class',
          nombre: 'Producto',
          atributos: [{ visibilidad: 'private', nombre: 'nombre', tipo: 'String' }],
          metodos: [],
        },
        {
          id: 'n2',
          tipo: 'class',
          nombre: 'Categoria',
          atributos: [],
          metodos: [],
        },
      ],
      relaciones: [],
    });
    expect(screens).toHaveLength(2);
    expect(screens[0].id).toBe('productos');
    expect(screens[0].list.path).toBe('/productos');
    expect(screens[0].list.method).toBe('GET');
    expect(screens[0].create.path).toBe('/productos');
    expect(screens[0].update.path).toBe('/productos/{id}');
    expect(screens[0].delete.path).toBe('/productos/{id}');
    expect(screens[0].fields[0].name).toBe('nombre');
    expect(screens[0].fields[0].type).toBe('text');
  });

  it('convierte una relacion 1..* en FK hacia la otra screen', () => {
    const screens = derivarScreensDeDiagrama({
      entidades: [
        {
          id: 'n1',
          tipo: 'class',
          nombre: 'Venta',
          atributos: [{ visibilidad: 'private', nombre: 'total', tipo: 'double' }],
          metodos: [],
        },
        {
          id: 'n2',
          tipo: 'class',
          nombre: 'Cliente',
          atributos: [{ visibilidad: 'private', nombre: 'email', tipo: 'String' }],
          metodos: [],
        },
      ],
      relaciones: [
        {
          id: 'e1',
          tipo: 'association',
          origen: 'n2',
          destino: 'n1',
          multiplicidadOrigen: '1',
          multiplicidadDestino: '*',
        },
      ],
    });
    const venta = screens.find((s) => s.id === 'ventas')!;
    // Venta es el lado "muchos": lleva la FK hacia clientes
    const fk = venta.fields.find((f) => f.type === 'select');
    expect(fk).toBeTruthy();
    expect(fk!.from?.screen).toBe('clientes');
    expect(fk!.from?.of).toBe('email');
    expect(fk!.from?.idField).toBe('id');
    expect(venta.fields[0].type).toBe('number'); // total (double)
  });

  it('ignora interfaces, enumeraciones y dependencias para las screens', () => {
    const screens = derivarScreensDeDiagrama({
      entidades: [
        { id: 'n1', tipo: 'interface', nombre: 'Repositorio', atributos: [], metodos: [] },
        {
          id: 'n2',
          tipo: 'enumeration',
          nombre: 'Estado',
          atributos: [],
          metodos: [],
          literales: ['ABIERTO', 'CERRADO'],
        },
        { id: 'n3', tipo: 'class', nombre: 'Orden', atributos: [], metodos: [] },
      ],
      relaciones: [
        {
          id: 'e1',
          tipo: 'dependency',
          origen: 'n3',
          destino: 'n1',
        },
      ],
    });
    expect(screens).toHaveLength(1);
    expect(screens[0].id).toBe('ordenes');
    // La dependencia hacia la interfaz no genera FK
    expect(screens[0].fields.some((f) => f.type === 'select')).toBe(false);
  });

  it('resuelve un atributo de enumeracion como select con sus literales', () => {
    const screens = derivarScreensDeDiagrama({
      entidades: [
        {
          id: 'n1',
          tipo: 'enumeration',
          nombre: 'Estado',
          atributos: [],
          metodos: [],
          literales: ['ACTIVO', 'INACTIVO'],
        },
        {
          id: 'n2',
          tipo: 'class',
          nombre: 'Pedido',
          atributos: [
            { visibilidad: 'private', nombre: 'estado', tipo: 'Estado' },
          ],
          metodos: [],
        },
      ],
      relaciones: [],
    });
    const pedido = screens.find((s) => s.id === 'pedidos')!;
    const estado = pedido.fields.find((f) => f.name === 'estado')!;
    expect(estado.type).toBe('select');
    expect(estado.options).toEqual([
      { value: 'ACTIVO', label: 'ACTIVO' },
      { value: 'INACTIVO', label: 'INACTIVO' },
    ]);
  });
});
