import { Controller, Get } from '@nestjs/common';
import { EndpointsService } from './endpoints.service';

/**
 * Controlador de utilidades de desarrollo.
 * Expone la lista de endpoints registrados en el backend.
 */
@Controller('endpoints')
export class EndpointsController {
  constructor(private readonly endpointsService: EndpointsService) {}

  /**
   * Devuelve todos los endpoints del backend (metodo + ruta).
   * @returns Lista ordenada de endpoints
   */
  @Get()
  list() {
    return this.endpointsService.list();
  }
}
