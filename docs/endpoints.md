# Endpoints del Backend

Inventario estatico de las rutas expuestas por el backend (NestJS).
Prefijo global: `/api`. Autenticacion: JWT en cookie HttpOnly `access_token`.

> Nota: existe ademas un listado dinamico en runtime en `GET /api/endpoints`
> que descubre las rutas automaticamente al arrancar la aplicacion.
>
> Para consultar la lista actual en vivo:
> ```bash
> curl http://localhost:3001/api/endpoints
> ```

---

## Modulo: Autenticacion — `/api/auth`

| Metodo | Ruta              | Caso de uso | Descripcion                              |
|--------|-------------------|-------------|------------------------------------------|
| POST   | `/api/auth/register` | UC-1.1   | Registra un usuario nuevo y crea sesion   |
| POST   | `/api/auth/login`    | UC-1.2   | Inicia sesion y crea sesion JWT           |
| GET    | `/api/auth/profile`  | UC-1.3   | Devuelve el perfil del usuario autenticado|
| PATCH  | `/api/auth/profile`  | UC-1.3   | Actualiza nombre y/o contrasena           |
| POST   | `/api/auth/logout`   | -        | Cierra la sesion (elimina la cookie)      |

### Cuerpos de peticion

**POST /api/auth/register**
```json
{
  "email": "usuario@correo.com",
  "name": "Nombre",
  "password": "Password123"
}
```
- `email`: email valido y unico.
- `password`: minimo 8 caracteres; debe incluir mayuscula, minuscula y numero.

**POST /api/auth/login**
```json
{ "email": "usuario@correo.com", "password": "Password123" }
```

**PATCH /api/auth/profile** (todos opcionales)
```json
{ "name": "Nuevo Nombre" }
```
```json
{ "currentPassword": "Password123", "newPassword": "NuevaPassword123" }
```
- `newPassword` requiere `currentPassword` para confirmar identidad.

### Respuestas
- `POST /login` y `POST /register` devuelven `{ "user": { id, email, name } }` y fijan la cookie JWT.
- `GET /profile` y `PATCH /profile` devuelven `{ id, email, name }`.

---

## Modulo: Workspaces — `/api/workspaces`

| Metodo | Ruta                  | Caso de uso | Descripcion                          |
|--------|-----------------------|-------------|--------------------------------------|
| POST   | `/api/workspaces`     | UC-1.4      | Crea un workspace (creador = OWNER)  |
| GET    | `/api/workspaces`     | UC-1.4      | Lista los workspaces del usuario     |
| GET    | `/api/workspaces/:id` | UC-1.5/1.6  | Muestra un workspace con sus diagramas|

### Cuerpos de peticion

**POST /api/workspaces**
```json
{ "name": "Mi Workspace" }
```
- `name`: minimo 2, maximo 255 caracteres.

### Respuestas
- `POST /workspaces` devuelve `{ id, name, createdAt }`.
- `GET /workspaces` devuelve lista con `diagramCount`.
- `GET /workspaces/:id` devuelve `{ id, name, createdAt, diagrams: [{ id, name, lastModified }] }`.

---

## Modulo: Diagramas

| Metodo | Ruta                                              | Caso de uso | Descripcion                                |
|--------|---------------------------------------------------|-------------|--------------------------------------------|
| POST   | `/api/workspaces/:workspaceId/diagrams`           | UC-1.5      | Crea un diagrama y agrega creador como OWNER|
| GET    | `/api/workspaces/:workspaceId/diagrams`           | UC-1.6      | Lista los diagramas del workspace          |
| GET    | `/api/diagrams/:id`                               | Edicion     | Obtiene un diagrama con su estado del lienzo (`reactFlowState`) |
| PUT    | `/api/diagrams/:id/state`                         | Edicion     | Persiste el estado del lienzo (`reactFlowState`) |
| GET    | `/api/diagrams/shared`                            | -           | Lista los diagramas donde el usuario es colaborador (EDITOR/VIEWER) |
| PUT    | `/api/workspaces/:workspaceId/diagrams/order`     | UC-1.6      | Persiste el nuevo orden de los diagramas   |
| PATCH  | `/api/diagrams/:id`                               | UC-1.6      | Renombra y/o reagrupa un diagrama          |

### Cuerpos de peticion

**POST /api/workspaces/:workspaceId/diagrams**
```json
{ "name": "Diagrama de Ventas", "group": "Comercio" }
```
- `name`: obligatorio, minimo 2, maximo 255 caracteres.
- `group`: opcional, texto.

**PUT /api/workspaces/:workspaceId/diagrams/order**
```json
{ "items": [ { "id": "<uuid>", "position": 0 }, { "id": "<uuid>", "position": 1 } ] }
```
- `items`: lista no vacia de `{ id, position }`; `position` entero >= 0.

**PATCH /api/diagrams/:id** (todos opcionales)
```json
{ "name": "Nuevo Nombre", "group": "Otro Grupo" }
```
- `group: null` elimina el diagrama del grupo actual.

**PUT /api/diagrams/:id/state**
```json
{
  "reactFlowState": {
    "nodes": [ { "id": "n1", "type": "class", "position": { "x": 0, "y": 0 }, "data": { "name": "User" } } ],
    "edges": [ { "id": "e1", "source": "n1", "target": "n2", "type": "inheritance" } ]
  }
}
```
- `reactFlowState`: objeto con `nodes` y `edges` del lienzo.

### Respuestas
- `POST` devuelve el diagrama creado con `role: "OWNER"`.
- `GET` y `PUT order` devuelven la lista de diagramas (id, name, position, group, lastModified, createdAt, createdById, role).
- `GET /diagrams/:id` devuelve el diagrama más `role` y `reactFlowState`.
- `PUT /diagrams/:id/state` y `PATCH` devuelven el diagrama actualizado.

---

## Modulo: Utilidades (desarrollo) — `/api/endpoints`

| Metodo | Ruta            | Caso de uso | Descripcion                                |
|--------|-----------------|-------------|--------------------------------------------|
| GET    | `/api/endpoints` | -           | Lista dinamica de todos los endpoints del backend |

### Respuesta
```json
[
  { "method": "GET", "path": "/api/auth/profile" },
  { "method": "POST", "path": "/api/auth/register" }
]
```

---

## Resumen

| Modulo     | Cantidad de endpoints |
|------------|-----------------------|
| Autenticacion | 5                    |
| Workspaces    | 3                    |
| Diagramas     | 7                    |
| Utilidades    | 1                    |
| **Total**     | **16**               |
