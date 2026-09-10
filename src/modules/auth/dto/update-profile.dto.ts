import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

/**
 * Cuerpo de la peticion PATCH /auth/profile.
 * Todos los campos son opcionales: solo se actualizan los enviados.
 * Si se envia newPassword, es obligatorio enviar currentPassword.
 */
export class UpdateProfileDto {
  /** Nuevo nombre visible, opcional. */
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(255, { message: 'El nombre no puede superar 255 caracteres' })
  name?: string;

  /** Nuevo username, opcional. Si se envia, debe ser unico. */
  @IsOptional()
  @IsString({ message: 'El username debe ser texto' })
  @MinLength(3, { message: 'El username debe tener al menos 3 caracteres' })
  @MaxLength(50, { message: 'El username no puede superar 50 caracteres' })
  username?: string;

  /** Contrasena actual, obligatoria solo si se quiere cambiar la contrasena. */
  @IsOptional()
  @IsString({ message: 'La contrasena actual debe ser texto' })
  @MaxLength(255, {
    message: 'La contrasena actual no puede superar 255 caracteres',
  })
  currentPassword?: string;

  /** Nueva contrasena, opcional. Requiere currentPassword para poder cambiarla. */
  @IsOptional()
  @IsString({ message: 'La nueva contrasena debe ser texto' })
  @MinLength(8, {
    message: 'La nueva contrasena debe tener al menos 8 caracteres',
  })
  @MaxLength(255, {
    message: 'La nueva contrasena no puede superar 255 caracteres',
  })
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'La contrasena debe incluir mayusculas, minusculas y numeros',
  })
  newPassword?: string;
}
