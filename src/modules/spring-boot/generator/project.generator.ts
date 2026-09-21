/**
 * Generador de archivos base del proyecto Spring Boot.
 * Todo plantillas fijas (sin IA): pom.xml, application.properties con
 * Postgres local, clase Application, manejo 404, CORS, README y .gitignore.
 * Con esto el ZIP se ejecuta con solo `mvn spring-boot:run`.
 */
import { capitalizar, toPluralPath } from './java-types';
import type { ScreenConfig } from '../screens/screens.types';

/** Nombre de la base de datos Postgres que usa el proyecto generado. */
export const DB_NAME = 'mi_proyecto';

/** Puerto del Postgres local (5433, para no chocar con servicios del host). */
const DB_PORT = '5433';

/**
 * Divide el packageBase en groupId y artifactId.
 * Ej. com.ejemplo.tienda -> { groupId: com.ejemplo, artifactId: tienda }.
 */
export function splitPackage(packageBase: string): {
  groupId: string;
  artifactId: string;
} {
  const partes = packageBase.split('.');
  const artifactId = partes[partes.length - 1] ?? 'demo';
  const groupId = partes.slice(0, -1).join('.') || 'com.ejemplo';
  return { groupId, artifactId };
}

/** Nombre de la clase Application (ej. tienda -> TiendaApplication). */
export function appClassName(artifactId: string): string {
  return `${capitalizar(artifactId)}Application`;
}

/**
 * Genera el pom.xml (Boot 3.2, Java 17, web/jpa/validation, Postgres, springdoc).
 * @param packageBase - Paquete base para derivar groupId/artifactId
 * @returns Contenido del pom.xml
 */
export function generatePom(packageBase: string): string {
  const { groupId, artifactId } = splitPackage(packageBase);
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.5</version>
  </parent>
  <groupId>${groupId}</groupId>
  <artifactId>${artifactId}</artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <properties>
    <java.version>17</java.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <scope>runtime</scope>
    </dependency>
    <dependency>
      <groupId>org.springdoc</groupId>
      <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
      <version>2.5.0</version>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
`;
}

/**
 * Genera application.properties apuntando al Postgres local en el puerto 5433
 * (base "mi_proyecto"). Hibernate crea/actualiza las tablas solo desde las @Entity.
 * @returns Contenido del properties
 */
export function generateProperties(): string {
  return `# Base de datos Postgres local (crear una sola vez: CREATE DATABASE ${DB_NAME};)
spring.datasource.url=jdbc:postgresql://localhost:${DB_PORT}/${DB_NAME}
spring.datasource.username=postgres
spring.datasource.password=postgres
# Hibernate genera las tablas desde las @Entity (conserva los datos)
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.format_sql=true
# Puerto fijo del API: la app movil lo usa hardcodeado (8081)
server.port=8081
`;
}

/**
 * Genera la clase Application (@SpringBootApplication).
 * @param packageBase - Paquete base
 * @param artifactId - Para el nombre de la clase
 * @returns Codigo Java del main
 */
export function generateApplicationClass(
  packageBase: string,
  artifactId: string,
): string {
  const app = appClassName(artifactId);
  return `package ${packageBase};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// Punto de entrada de la aplicacion (mvn spring-boot:run)
@SpringBootApplication
public class ${app} {
    public static void main(String[] args) {
        SpringApplication.run(${app}.class, args);
    }
}
`;
}

/**
 * Genera la excepcion 404 compartida por todos los servicios.
 * @param packageBase - Paquete base
 * @returns Codigo Java de la excepcion
 */
export function generateNotFoundException(packageBase: string): string {
  return `package ${packageBase}.common;

// Excepcion 404: se lanza cuando un id no existe (findById/update)
public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String mensaje) {
        super(mensaje);
    }
}
`;
}

/**
 * Genera el handler global: convierte la 404 y errores de validacion
 * en respuestas JSON (en vez del 500 por defecto).
 * @param packageBase - Paquete base
 * @returns Codigo Java del handler
 */
export function generateExceptionHandler(packageBase: string): string {
  return `package ${packageBase}.common;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

// Manejo global de errores: 404 si el id no existe, 400 si falla validacion
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Map<String, String>> notFound(ResourceNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(Map.of("error", ex.getMessage()));
    }
}
`;
}

/**
 * Genera la config CORS para que el front Next.js (puerto 3000)
 * pueda llamar al API (puerto 8081).
 * @param packageBase - Paquete base
 * @returns Codigo Java de la config
 */
export function generateCorsConfig(packageBase: string): string {
  return `package ${packageBase}.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

// CORS: permite peticiones del frontend Next.js en localhost:3000
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
            .allowedOrigins("http://localhost:3000", "http://127.0.0.1:3000")
            .allowedMethods("GET", "POST", "PUT", "DELETE");
    }
}
`;
}

/** Genera el .gitignore estandar de un proyecto Maven. */
export function generateGitignore(): string {
  return `target/
.idea/
*.iml/
.vscode/
.env
.DS_Store
`;
}

/**
 * Serializa las screens normalizadas a un screens.json embebido.
 * Es lo que sirve GET /meta/screens: la config tal como se genero
 * (rutas sin /api, campos tipados, FKs via `from`).
 * La app movil espera el objeto {"screens":[...]} (no un array plano).
 * @param screens - Screens normalizadas por el parser
 * @returns Contenido JSON formateado (2 espacios)
 */
export function generateScreensJson(screens: ScreenConfig[]): string {
  return JSON.stringify({ screens }, null, 2) + '\n';
}

/**
 * Genera el controller /meta/screens: devuelve el screens.json embebido
 * (config que el frontend del proyecto generado puede consumir para
 * renderizar los listados/formularios dinamicos sin conocer el codigo).
 * @param packageBase - Paquete base
 * @returns Codigo Java del controller
 */
export function generateMetaController(packageBase: string): string {
  return `package ${packageBase}.meta;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

// Sirve la config de los modulos (screens.json embebido) en GET /meta/screens
@RestController
@RequestMapping("/meta")
public class MetaController {

    @GetMapping(value = "/screens", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> screens() throws IOException {
        Resource resource = new ClassPathResource("screens.json");
        if (!resource.exists()) {
            return ResponseEntity.notFound().build();
        }
        String json = new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        return ResponseEntity.ok(json);
    }
}
`;
}

/**
 * Genera el README con pasos para correr, ejemplos y solucion de problemas.
 * @param artifactId - Nombre del proyecto/BD
 * @param modulos - Nombres de las entidades generadas
 * @returns Contenido del README.md
 */
export function generateReadme(artifactId: string, modulos: string[]): string {
  const primero = modulos[0] ?? 'Entidad';
  const lineas = modulos
    .map(
      (m) =>
        `- \`/${toPluralPath(m)}\` — CRUD de ${m} (GET, GET by id, POST, PUT, DELETE)`,
    )
    .join('\n');
  return `# ${capitalizar(artifactId)} — Backend Spring Boot generado

Proyecto generado desde el diagrama de clases UML. Listo para correr sin codigo manual.

## Requisitos

- Java 17 (\`java -version\`)
- Maven 3.9+ (\`mvn -version\`)
- Postgres 16+ corriendo en localhost:${DB_PORT} con la base "${DB_NAME}" creada

## Puesta en marcha (2 pasos)

\`\`\`bash
# 1. Crear la base UNA sola vez (las tablas las crea Hibernate solo al arrancar)
psql -h localhost -p ${DB_PORT} -U postgres -c "CREATE DATABASE ${DB_NAME};"

# 2. Entrar al proyecto y correr
cd ${artifactId}
mvn spring-boot:run
\`\`\`

Veras en consola los \`CREATE TABLE\` de Hibernate y al final
\`Started ...Application in X seconds\`. El API queda en http://localhost:8081
(el puerto lo fija \`server.port=8081\` en \`application.properties\`).

## Probarlo (ejemplo con ${primero})

\`\`\`bash
# Crear (201)
curl -X POST localhost:8081/${toPluralPath(primero)} \\
  -H "Content-Type: application/json" \\
  -d '{}'

# Listar
curl localhost:8081/${toPluralPath(primero)}

# Obtener uno (404 si no existe)
curl localhost:8081/${toPluralPath(primero)}/1

# Actualizar
curl -X PUT localhost:8081/${toPluralPath(primero)}/1 \\
  -H "Content-Type: application/json" \\
  -d '{}'

# Eliminar (204)
curl -X DELETE localhost:8081/${toPluralPath(primero)}/1
\`\`\`

## Endpoints

- \`GET /meta/screens\` — config JSON de los modulos (para renderizar el front)

${lineas}

## Llave primaria

- Cada tabla usa una PK auto-generada \`Long\` (\`@GeneratedValue IDENTITY\`).
- Si una clase del diagrama tiene un atributo llamado \`id\` (en cualquier
  mayuscula: \`id\`, \`Id\`, \`ID\`), ese atributo ES la PK: se absorbe en ese
  \`Long\` auto-generado, no se duplica como columna y no va en el body del
  POST/PUT (el valor lo crea la BD). Si su tipo declarado no es numerico,
  tambien se fuerza a \`Long\`.

## Documentacion interactiva

- Swagger UI: http://localhost:8081/swagger-ui.html (probar cada endpoint desde el navegador)

## Estructura

- \`<modulo>/<Modulo>.java\` — @Entity JPA (una carpeta por tabla)
- \`<modulo>/<Modulo>Repository.java\` — Spring Data (sin codigo)
- \`<modulo>/<Modulo>Service.java\` — CRUD + resolucion de FKs por id
- \`<modulo>/<Modulo>Controller.java\` — REST /...
- \`<modulo>/<Modulo>Request.java\` — lo que recibe POST/PUT (FKs como ids)
- \`<modulo>/<Modulo>Response.java\` — lo que devuelve GET (con id)
- \`common/\` — error 404 en JSON · \`config/\` — CORS para localhost:3000

## Solucion de problemas

| Sintoma | Causa y arreglo |
|---|---|
| \`Connection to localhost:${DB_PORT} refused\` | Postgres no esta corriendo en el puerto ${DB_PORT}: inicia tu servicio local o usa \`docker compose up -d\` (ver docker-compose.yml) |
| \`database "${DB_NAME}" does not exist\` | Falta el paso 1: \`psql -h localhost -p ${DB_PORT} -U postgres -c "CREATE DATABASE ${DB_NAME};"\` |
| \`password authentication failed\` | Ajusta \`spring.datasource.username/password\` en \`src/main/resources/application.properties\` |
| \`Port 8081 already in use\` | Otro proceso ocupa el puerto fijo (8081): detenlo o cambia \`server.port\` en el \`application.properties\` |
| Las tablas no aparecen | Revisa que \`spring.jpa.hibernate.ddl-auto=update\` siga en el properties y mira el log de arranque |
| El front (puerto 3000) da CORS | \`config/CorsConfig.java\` ya permite localhost:3000; si tu front usa otro origen, agregalo ahi |
`;
}
