import { Injectable } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

/** Capa del router de Express que representa una ruta registrada. */
interface ExpressLayer {
  /** Presente solo en capas de ruta reales (no middlewares). */
  route?: {
    path: string;
    methods: Record<string, boolean>;
  };
}

/** Estados internos del router de Express que necesitamos explorar. */
interface ExpressRouter {
  stack: ExpressLayer[];
}

/** Aplicacion Express con acceso al router interno. */
interface ExpressApp {
  _router: ExpressRouter;
}

/** Http method normalizado. */
type NormalizedHttpMethod =
  'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/** Descripcion de un endpoint expuesto por el backend. */
export interface EndpointInfo {
  method: NormalizedHttpMethod;
  path: string;
}

/** Prefijo global de rutas configurado en main.ts. */
const GLOBAL_PREFIX = '/api';

/**
 * Explorador de endpoints.
 * Recorre el router de Express de la aplicacion y devuelve todas las
 * rutas registradas por los controladores de NestJS.
 */
@Injectable()
export class EndpointsService {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  /**
   * Lista todos los endpoints del backend con su metodo HTTP y ruta completa.
   * @returns Arreglo ordenado de endpoints
   */
  list(): EndpointInfo[] {
    // La asercion de tipo es necesaria: getInstance() devuelve `any` y aqui se
    // tipa el router interno. El autofix de no-unnecessary-type-assertion
    // borraria el cast (any es asignable a todo), rompiendo el tipado.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const app = this.adapterHost.httpAdapter.getInstance() as ExpressApp;
    const router = app._router;

    const endpoints: EndpointInfo[] = [];

    for (const layer of router.stack) {
      const route = layer.route;
      // Las capas sin route son middlewares, se ignoran
      if (!route) {
        continue;
      }

      for (const method of Object.keys(route.methods)) {
        if (route.methods[method]) {
          endpoints.push({
            method: method.toUpperCase() as NormalizedHttpMethod,
            path: `${GLOBAL_PREFIX}${route.path}`,
          });
        }
      }
    }

    return endpoints.sort(
      (a, b) =>
        a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
    );
  }
}
