import { IsString, MaxLength } from 'class-validator';

/**
 * Cuerpo de la peticion POST /auth/login.
 * Contiene las credenciales que verificara la estrategia local.
 */
export class LoginDto {
  /** Username del usuario. */
  @IsString({ message: 'El usuario no es valido' })
  username: string;

  /** Password en texto plano a verificar contra el hash almacenado. */
  @IsString()
  @MaxLength(255, { message: 'La password no puede superar 255 caracteres' })
  password: string;
}
