import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UnauthorizedException } from '@nestjs/common';
import { RealtimeService } from './realtime.service';

/**
 * Payload esperado al unirse a la sala de un diagrama.
 */
interface JoinRoomPayload {
  /** Id del diagrama al que se une el cliente. */
  diagramId: string;
}

/**
 * Origenes permitidos por CORS para el gateway Socket.IO.
 * Se leen de CORS_ORIGIN (mismo env que main.ts), separados por coma.
 * Si no esta definida, se usan los origenes locales por defecto
 * (localhost:3000), igual que en desarrollo. Nunca wildcard porque la
 * conexion Socket.IO usa credentials (cookie HttpOnly del JWT).
 */
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

/**
 * Gateway de colaboracion en tiempo real con Socket.IO.
 *
 * Actua como un relay del protocolo de sincronizacion de Yjs:
 * - Autentica los sockets con el JWT de la cookie al conectarse.
 * - Agrupa los clientes en salas (un diagrama por sala).
 * - Recibe los updates CRDT de un cliente y los difunde a los demas
 *   miembros de la misma sala, persistiendo el estado en NeonDB.
 *
 * Escucha los eventos en el puerto 3002 (definido en SOCKET_PORT).
 */
@WebSocketGateway({
  namespace: '/collab',
  cors: {
    origin: corsOrigins,
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  /**
   * Mapea id de socket -> id de diagrama (sala) al que pertenece.
   * Permite limpiar la sala al desconectarse.
   */
  private readonly socketRoom = new Map<string, string>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Hook que se ejecuta al conectar un cliente por WebSocket.
   * Autentica el socket (guarda el userId en socket.data) usando el token
   * que el cliente envia en el handshake (auth.token). Si no es valido,
   * rechaza la conexion.
   * @param client - Socket del cliente conectado
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      // Token del JWT: se toma del handshake o, como fallback, de la cookie
      // HttpOnly 'access_token' que el navegador envía con withCredentials.
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        this.getAccessTokenFromCookie(client);
      if (!token) {
        throw new UnauthorizedException('Token de autenticacion requerido');
      }

      // Verifica el JWT con el mismo secreto que las rutas HTTP
      const payload = await this.jwt.verifyAsync<{ sub: string; name: string }>(
        token,
        { secret: this.config.get<string>('JWT_SECRET') },
      );

      // Guarda el usuario autenticado en el socket para usarlo en los eventos
      client.data.userId = payload.sub;
      client.data.userName = payload.name;
    } catch {
      // Token invalido/expirado: se desconecta el socket
      client.disconnect(true);
    }
  }

  private getAccessTokenFromCookie(client: Socket): string | undefined {
    const cookieHeader = client.handshake.headers.cookie;
    if (!cookieHeader) {
      return undefined;
    }
    const match = /(?:^|;\s*)access_token=([^;]+)/.exec(cookieHeader);
    return match?.[1];
  }

  /**
   * Hook que se ejecuta al desconectarse un cliente.
   * Libera la sala del diagrama si quedaba vacia.
   * @param client - Socket del cliente desconectado
   */
  handleDisconnect(client: Socket): void {
    const diagramId = this.socketRoom.get(client.id);
    if (!diagramId) {
      return;
    }

    this.socketRoom.delete(client.id);

    try {
      // Avisa a los demas miembros de la sala que alguien se fue
      client.to(this.roomName(diagramId)).emit('peer-left', {
        userId: client.data.userId,
      });

      // Si la sala quedo vacia, libera el Y.Doc de memoria
      const rooms = this.server?.sockets?.adapter?.rooms;
      const room = rooms?.get(this.roomName(diagramId));
      if (!room || room.size === 0) {
        this.realtime.releaseDoc(diagramId);
      }
    } catch {
      // Si el adapter no esta disponible (cliente rechazado), solo limpia memoria
      this.realtime.releaseDoc(diagramId);
    }
  }

  /**
   * Un cliente se une a la sala de un diagrama.
   * Valida que tenga rol de colaborador y le envia el snapshot del estado.
   * @param client - Socket que envia el evento
   * @param payload - Contiene el diagramId
   * @returns El snapshot Yjs (bytes) y los datos del usuario
   */
  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinRoomPayload,
  ): Promise<{
    update: Uint8Array;
    userId: string;
    userName: string;
    role: string;
  }> {
    const userId = client.data.userId;
    const diagramId = payload?.diagramId;

    if (!diagramId) {
      throw new WsException('diagramId requerido');
    }

    // Valida el rol del usuario en el diagrama (owner o colaborador)
    const access = await this.realtime.validateAccess(userId, diagramId);

    // Registra la sala a la que pertenece el socket
    this.socketRoom.set(client.id, diagramId);
    // Socket.IO agrupa los sockets con el mismo nombre de sala
    void client.join(this.roomName(diagramId));

    // Avisa a los demas miembros que un nuevo peer entro
    client.to(this.roomName(diagramId)).emit('peer-joined', {
      userId,
      userName: client.data.userName,
      role: access.role,
    });

    // Envia el estado completo para que el cliente reconstruya su lienzo
    const snapshot = await this.realtime.getSnapshot(diagramId);

    return {
      update: snapshot,
      userId,
      userName: client.data.userName,
      role: access.role,
    };
  }

  /**
   * Un cliente envia un update CRDT de Yjs.
   * El gateway lo aplica al documento compartido, lo persiste en NeonDB
   * y lo difunde a los demas clientes de la misma sala (relay).
   * Solo los EDITOR/OWNER pueden editar; los VIEWER solo observan.
   * @param client - Socket que envia el evento
   * @param payload - Contiene diagramId y el update (bytes)
   */
  @SubscribeMessage('update')
  async handleUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { diagramId: string; update: Uint8Array },
  ): Promise<void> {
    const diagramId = payload?.diagramId;
    const update = toUint8Array(payload?.update);

    if (!diagramId || !update) {
      throw new WsException('diagramId y update son requeridos');
    }

    const userId = client.data.userId;
    // Bloquea updates de VIEWER (solo lectura)
    await this.realtime.assertCanEdit(userId, diagramId);

    // Aplica el update al Y.Doc y lo persiste en NeonDB
    await this.realtime.applyUpdate(diagramId, update);

    // Difunde el update a los demas miembros de la sala (no al emisor)
    client.to(this.roomName(diagramId)).emit('update', update);
  }

  /**
   * Re-difunde el estado de awareness (bloqueos de elementos) a los demas
   * miembros de la sala. No se persiste en BD: es informacion en memoria
   * que solo importa mientras todos estan conectados (CU-2.5).
   * Cualquier usuario puede enviarlo (viewer incluido, para que vean los locks).
   * @param client - Socket que envia el evento
   * @param payload - Contiene diagramId y el mapa de locks del emisor
   */
  @SubscribeMessage('awareness')
  async handleAwareness(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      diagramId: string;
      userId?: string;
      locks: Record<string, { userId: string; userName: string }>;
    },
  ): Promise<void> {
    const diagramId = payload?.diagramId;
    if (!diagramId) {
      throw new WsException('diagramId requerido');
    }

    const userId = client.data.userId;
    // Verifica que el emisor tenga acceso al diagrama
    await this.realtime.validateAccess(userId, diagramId);

    // Retransmite el awareness a los demas miembros de la sala (no al emisor)
    client.to(this.roomName(diagramId)).emit('awareness', {
      diagramId,
      userId,
      locks: payload.locks,
    });
  }

  /**
   * Construye el nombre canonico de la sala para un diagrama.
   * @param diagramId - Id del diagrama
   * @returns Nombre de la sala (ej: "diagram:123")
   */
  private roomName(diagramId: string): string {
    return `diagram:${diagramId}`;
  }
}

/**
 * Normaliza un binario recibido por Socket.IO a Uint8Array.
 * En el navegador el transporte entrega ArrayBuffer (sin `.length`), y
 * Yjs/lib0 exige Uint8Array; sin esta conversion Y.applyUpdate lanza
 * "Unexpected end of array" al recibir un update del cliente.
 * @param value - Binario (ArrayBuffer, TypedArray o Uint8Array)
 * @returns Uint8Array equivalente, o null si no es binario
 */
function toUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    const view = value;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  return null;
}
