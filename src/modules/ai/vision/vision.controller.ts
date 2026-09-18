/**
 * Controlador de la importacion de diagramas desde imagen (vision -> DSL).
 * Expone POST /api/ai/diagram-from-image bajo la proteccion JWT del modulo ai.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ImportarImagenDto } from './dto/vision.dto';
import type { ArchivoImagen } from './vision.gateway';
import { VisionService } from './vision.service';

/** Tamano maximo de la imagen subida (8 MB, suficiente para capturas). */
const TAMANO_MAXIMO = 8 * 1024 * 1024;

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class VisionController {
  constructor(private readonly visionService: VisionService) {}

  /**
   * Importa una imagen de diagrama de clases y devuelve las acciones a aplicar.
   * Recibe multipart/form-data: campo "file" (imagen) + diagramId / snapshot /
   * modo / esquema como campos de formulario.
   * @param user - Usuario autenticado desde el JWT
   * @param file - Imagen subida (obligatoria, image/*)
   * @param dto - Campos del formulario validados
   * @returns Acciones aplicables (ids reales) y advertencias
   */
  @Post('diagram-from-image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: TAMANO_MAXIMO },
      fileFilter: (_request, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(
            new BadRequestException(
              'El archivo debe ser una imagen (png, jpeg, webp...).',
            ),
            false,
          );
        } else {
          callback(null, true);
        }
      },
    }),
  )
  importar(
    @CurrentUser() user: { sub: string },
    @UploadedFile() file: ArchivoImagen | undefined,
    @Body() dto: ImportarImagenDto,
  ) {
    if (!file) {
      throw new BadRequestException(
        'El archivo de imagen es obligatorio (campo "file").',
      );
    }
    return this.visionService.importarImagen(
      dto.diagramId,
      user.sub,
      dto,
      file,
    );
  }
}
