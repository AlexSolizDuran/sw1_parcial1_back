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
import { CollaboratorsService } from './collaborators.service';
import { AddCollaboratorDto } from './dto/add-collaborator.dto';
import { UpdateCollaboratorRoleDto } from './dto/update-collaborator-role.dto';

/**
 * Controlador de colaboradores de un diagrama.
 * Ruta base: /diagrams/:id/collaborators. Todas las rutas exigen JWT.
 * El owner invita por email (por defecto VIEWER), cambia permisos y elimina.
 */
@Controller('diagrams/:id/collaborators')
@UseGuards(JwtAuthGuard)
export class CollaboratorsController {
  constructor(private readonly collaboratorsService: CollaboratorsService) {}

  /**
   * Invita a un usuario por email a colaborar en un diagrama.
   * @param id - Id del diagrama
   * @param user - Usuario autenticado (debe ser el owner)
   * @param dto - Email del invitado y rol opcional (por defecto VIEWER)
   * @returns El colaborador creado
   */
  @Post()
  add(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: { sub: string },
    @Body() dto: AddCollaboratorDto,
  ) {
    return this.collaboratorsService.add(id, user.sub, dto);
  }

  /**
   * Lista los colaboradores de un diagrama.
   * @param id - Id del diagrama
   * @param user - Usuario autenticado (owner o colaborador)
   * @returns Lista de colaboradores con su rol
   */
  @Get()
  findAll(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.collaboratorsService.findAll(id, user.sub);
  }

  /**
   * Cambia el permiso (rol) de un colaborador.
   * @param id - Id del diagrama
   * @param collaboratorId - Id del colaborador a modificar
   * @param user - Usuario autenticado (debe ser el owner)
   * @param dto - Nuevo rol (EDITOR | VIEWER)
   * @returns El colaborador con su nuevo rol
   */
  @Patch(':collaboratorId')
  updateRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('collaboratorId', new ParseUUIDPipe()) collaboratorId: string,
    @CurrentUser() user: { sub: string },
    @Body() dto: UpdateCollaboratorRoleDto,
  ) {
    return this.collaboratorsService.updateRole(
      id,
      collaboratorId,
      user.sub,
      dto,
    );
  }

  /**
   * Elimina a un colaborador de un diagrama.
   * @param id - Id del diagrama
   * @param collaboratorId - Id del colaborador a eliminar
   * @param user - Usuario autenticado (debe ser el owner)
   * @returns Mensaje de confirmacion
   */
  @Delete(':collaboratorId')
  @HttpCode(HttpStatus.OK)
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('collaboratorId', new ParseUUIDPipe()) collaboratorId: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.collaboratorsService.remove(id, collaboratorId, user.sub);
  }
}
