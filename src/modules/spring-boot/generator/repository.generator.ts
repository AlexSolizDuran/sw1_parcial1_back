/**
 * Generador de Repository Spring Data por tabla.
 * Un archivo por tabla: <Nombre>Repository.java dentro de la carpeta del modulo.
 */

/**
 * Genera el repository JPA de una entidad.
 * @param nombre - Nombre de la entidad (ej. Producto)
 * @param packageBase - Paquete base (ej. com.ejemplo.tienda)
 * @param folder - Carpeta del modulo (ej. producto)
 * @returns Codigo Java del repository
 */
export function generateRepository(
  nombre: string,
  packageBase: string,
  folder: string,
): string {
  return `package ${packageBase}.${folder};

import org.springframework.data.jpa.repository.JpaRepository;

// Repository de ${nombre}: acceso a la tabla ${folder}s
public interface ${nombre}Repository extends JpaRepository<${nombre}, Long> {
}
`;
}
