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
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DiagramsService } from './diagrams.service';
import { CreateDiagramDto } from './dto/create-diagram.dto';
import { UpdateDiagramDto } from './dto/update-diagram.dto';
import { UpdateDiagramStateDto } from './dto/update-diagram-state.dto';
import { ReorderDiagramsDto } from './dto/reorder-diagrams.dto';

/**
 * Controlador de diagramas de clases UML.
 * Rutas bajo /workspaces/:workspaceId/diagrams (crear, listar, ordenar)
 * y /diagrams/:id (renombrar, eliminar). Todas exigen sesion JWT valida.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class DiagramsController {
  constructor(private readonly diagramsService: DiagramsService) {}

  /**
   * Crea un diagrama dentro de un workspace (UC-1.5).
   * @param workspaceId - Id del workspace destino
   * @param user - Usuario autenticado desde el JWT
   * @param dto - Nombre (y grupo opcional) del diagrama
   * @returns El diagrama creado con el rol OWNER
   */
  @Post('workspaces/:workspaceId/diagrams')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: { sub: string },
    @Body() dto: CreateDiagramDto,
  ) {
    return this.diagramsService.create(workspaceId, user.sub, dto);
  }

  /**
   * Lista los diagramas de un workspace ya ordenados (UC-1.6).
   * @param workspaceId - Id del workspace
   * @param user - Usuario autenticado desde el JWT
   * @returns Lista de diagramas del workspace
   */
  @Get('workspaces/:workspaceId/diagrams')
  findAll(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.diagramsService.findAll(workspaceId, user.sub);
  }

  /**
   * Reordena los diagramas de un workspace (UC-1.6).
   * @param workspaceId - Id del workspace
   * @param user - Usuario autenticado desde el JWT
   * @param dto - Lista con la nueva posicion de cada diagrama
   * @returns La lista de diagramas ya reordenada
   */
  @Put('workspaces/:workspaceId/diagrams/order')
  reorder(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @CurrentUser() user: { sub: string },
    @Body() dto: ReorderDiagramsDto,
  ) {
    return this.diagramsService.reorder(workspaceId, user.sub, dto);
  }

  /**
   * Lista los diagramas en los que el usuario es colaborador (EDITOR/VIEWER).
   * @param user - Usuario autenticado desde el JWT
   * @returns Lista de diagramas compartidos con su workspace y rol
   */
  @Get('diagrams/shared')
  findShared(@CurrentUser() user: { sub: string }) {
    return this.diagramsService.findShared(user.sub);
  }

  /**
   * Obtiene un diagrama con su estado del lienzo (edicion local).
   * @param id - Id del diagrama
   * @param user - Usuario autenticado desde el JWT
   * @returns El diagrama con su reactFlowState y rol
   */
  @Get('diagrams/:id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.diagramsService.findOne(id, user.sub);
  }

  /**
   * Persiste el estado observable del lienzo (edicion local).
   * @param id - Id del diagrama
   * @param user - Usuario autenticado desde el JWT
   * @param dto - Estado reactFlowState a guardar
   * @returns El diagrama actualizado
   */
  @Put('diagrams/:id/state')
  updateState(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: { sub: string },
    @Body() dto: UpdateDiagramStateDto,
  ) {
    return this.diagramsService.updateState(id, user.sub, dto);
  }

  /**
   * Renombra un diagrama (UC-1.6).
   * @param id - Id del diagrama
   * @param user - Usuario autenticado desde el JWT
   * @param dto - Campos opcionales a actualizar
   * @returns El diagrama actualizado
   */
  @Patch('diagrams/:id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: { sub: string },
    @Body() dto: UpdateDiagramDto,
  ) {
    return this.diagramsService.update(id, user.sub, dto);
  }

  /**
   * Elimina un diagrama junto con sus colaboradores y sesiones de IA.
   * @param id - Id del diagrama
   * @param user - Usuario autenticado desde el JWT
   * @returns Un mensaje de confirmacion
   */
  @Delete('diagrams/:id')
  @HttpCode(HttpStatus.OK)
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.diagramsService.remove(id, user.sub);
  }
}
