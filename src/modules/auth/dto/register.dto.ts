import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

/**
 * Cuerpo de la peticion POST /auth/register.
 * Valida que el usuario envie username, email valido, nombre y password segura.
 */
export class RegisterDto {
  /** Username unico del usuario. Se usara para iniciar sesion. */
  @IsString({ message: 'El usuario no es valido' })
  username: string;

  /** Email unico del usuario. */
  @IsEmail({}, { message: 'El email no es valido' })
  email: string;

  /** Nombre visible del usuario. */
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(255, { message: 'El nombre no puede superar 255 caracteres' })
  name: string;

  /** Password en texto plano (se hashea con bcrypt antes de guardar). */
  @IsString()
  @MinLength(8, { message: 'La password debe tener al menos 8 caracteres' })
  @MaxLength(255, { message: 'La password no puede superar 255 caracteres' })
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'La password debe incluir mayusculas, minusculas y numeros',
  })
  password: string;
}
