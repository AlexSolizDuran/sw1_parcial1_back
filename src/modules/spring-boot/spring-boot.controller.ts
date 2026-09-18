import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GenerateModulesDto } from './dto/generate-modules.dto';
import { SpringBootService } from './spring-boot.service';

/**
 * Controlador de generacion Spring Boot.
 * Ruta bajo /spring-boot, protegida con JWT.
 *  - POST /spring-boot/modules  genera 1 carpeta por tabla (archivos Java en memoria)
 */
@Controller('spring-boot')
@UseGuards(JwtAuthGuard)
export class SpringBootController {
  constructor(private readonly springBootService: SpringBootService) {}

  /**
   * Genera los modulos Spring Boot del diagrama.
   * @param user - Usuario autenticado desde el JWT
   * @param dto - Diagrama, snapshot y packageBase
   * @returns Conteo de modulos/archivos + archivos generados
   */
  @Post('modules')
  generate(
    @CurrentUser() user: { sub: string },
    @Body() dto: GenerateModulesDto,
  ) {
    return this.springBootService.generateModules(user.sub, dto);
  }
}
