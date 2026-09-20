/**
 * Generador de @RestController por tabla.
 * 5 endpoints fijos: GET /, GET /{id}, POST /, PUT /{id}, DELETE /{id}.
 */
import { toPluralPath } from './java-types';

/**
 * Genera el controlador REST de una entidad.
 * @param nombre - Nombre de la entidad (ej. Producto)
 * @param paquete - Paquete del modulo (ej. com.ejemplo.tienda.producto)
 * @returns Codigo Java del controlador
 */
export function generateController(nombre: string, paquete: string): string {
  const path = toPluralPath(nombre);
  return `package ${paquete};

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

// Controlador REST de ${nombre}: 5 endpoints CRUD
@RestController
@RequestMapping("/${path}")
@Tag(name = "${nombre}", description = "CRUD de ${nombre}")
public class ${nombre}Controller {

    private final ${nombre}Service service;

    public ${nombre}Controller(${nombre}Service service) {
        this.service = service;
    }

    // GET /${path} -> listar todos
    @Operation(summary = "Lista todos los registros de ${nombre}")
    @GetMapping
    public List<${nombre}Response> findAll() {
        return service.findAll();
    }

    // GET /${path}/{id} -> obtener uno (404 si no existe)
    @Operation(summary = "Obtiene un ${nombre} por id")
    @GetMapping("/{id}")
    public ${nombre}Response findById(@PathVariable Long id) {
        return service.findById(id);
    }

    // POST /${path} -> crear (responde 201)
    @Operation(summary = "Crea un nuevo ${nombre}")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ${nombre}Response create(@RequestBody ${nombre}Request req) {
        return service.save(req);
    }

    // PUT /${path}/{id} -> actualizar (404 si no existe)
    @Operation(summary = "Actualiza un ${nombre} existente")
    @PutMapping("/{id}")
    public ${nombre}Response update(@PathVariable Long id, @RequestBody ${nombre}Request req) {
        return service.update(id, req);
    }

    // DELETE /${path}/{id} -> eliminar (responde 204)
    @Operation(summary = "Elimina un ${nombre} por id")
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.deleteById(id);
    }
}
`;
}
