import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspacesService } from './workspaces.service';

/**
 * Controlador de workspaces.
 * Todas las rutas exigen sesion JWT valida.
 */
@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  /**
   * Crea un workspace con el usuario actual como Owner. (UC-1.4)
   * @param user - Usuario autenticado desde el JWT
   * @param dto - Nombre del workspace
   * @returns El workspace creado
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: { sub: string },
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspacesService.create(user.sub, dto);
  }

  /**
   * Lista todos los workspaces del usuario autenticado.
   * @param user - Usuario autenticado desde el JWT
   * @returns Lista de workspaces con su cantidad de diagramas
   */
  @Get()
  findAll(@CurrentUser() user: { sub: string }) {
    return this.workspacesService.findAllByOwner(user.sub);
  }

  /**
   * Muestra un workspace propio con sus diagramas. (prepara UC-1.5 y UC-1.6)
   * @param user - Usuario autenticado desde el JWT
   * @param id - Id del workspace
   * @returns El workspace con sus diagramas
   */
  @Get(':id')
  findOne(
    @CurrentUser() user: { sub: string },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.workspacesService.findOne(user.sub, id);
  }

  /**
   * Renombra un workspace. Solo el owner puede hacerlo.
   * @param user - Usuario autenticado desde el JWT
   * @param id - Id del workspace
   * @param dto - Nuevo nombre
   * @returns El workspace actualizado
   */
  @Patch(':id')
  update(
    @CurrentUser() user: { sub: string },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(user.sub, id, dto);
  }

  /**
   * Elimina un workspace y sus diagramas en cascada. Solo el owner.
   * @param user - Usuario autenticado desde el JWT
   * @param id - Id del workspace
   * @returns Un mensaje de confirmacion
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentUser() user: { sub: string },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.workspacesService.remove(user.sub, id);
  }
}
