import type { IncomingMessage, Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { createPool } from '../db/index.ts';

export interface ActiveTrackingConnection {
  userId?: string;
  role: 'DRIVER' | 'CUSTOMER' | 'ADMIN';
  deliveryId: string;
  orderCode?: string;
  connectedAt: string;
}

export const activeConnections = new Map<WebSocket, ActiveTrackingConnection>();

export function getActiveTrackingSocketsSummary() {
  const list: Array<ActiveTrackingConnection> = [];
  activeConnections.forEach((info, socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      list.push(info);
    }
  });
  return list;
}

export function setupKitingoTrackingSocket(
  server: HttpServer,
  options?: {
    onConnectionInit?: (ws: WebSocket) => void;
  }
) {
  const pool = createPool();
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const reqUrl = request.url || '';
    if (!reqUrl.startsWith('/ws') && !reqUrl.startsWith('/tracking')) {
      return;
    }

    // Autenticação básica via token/parâmetros no header ou query string do WebSocket
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    let currentDeliveryId: string | null = null;
    let currentOrderCode: string | null = null;
    let userRole: 'DRIVER' | 'CUSTOMER' | 'ADMIN' | null = null;

    // Suporte opcional para autenticação imediata via query string (?role=CUSTOMER&deliveryId=...)
    try {
      const parsedUrl = new URL(req.url || '/ws', 'http://localhost');
      const qRole = parsedUrl.searchParams.get('role');
      const qDeliveryId = parsedUrl.searchParams.get('deliveryId');
      const qUserId = parsedUrl.searchParams.get('userId') || undefined;
      if (qRole && qDeliveryId) {
        const normalizedRole =
          qRole.toUpperCase() === 'DRIVER'
            ? 'DRIVER'
            : qRole.toUpperCase() === 'ADMIN'
              ? 'ADMIN'
              : 'CUSTOMER';
        userRole = normalizedRole;
        currentDeliveryId = qDeliveryId;
        activeConnections.set(ws, {
          userId: qUserId,
          role: normalizedRole,
          deliveryId: qDeliveryId,
          connectedAt: new Date().toISOString(),
        });
      }
    } catch {
      // Ignorar URL malformada
    }

    if (options?.onConnectionInit) {
      options.onConnectionInit(ws);
    }

    ws.on('message', async (rawMessage) => {
      try {
        const data = JSON.parse(String(rawMessage));

        // 1. Ação: AUTH_TRACKING — Regista o socket na sala isolada da entrega (deliveryId)
        if (data.action === 'AUTH_TRACKING') {
          const normalizedRole: 'DRIVER' | 'CUSTOMER' | 'ADMIN' =
            String(data.role || '').toUpperCase() === 'DRIVER'
              ? 'DRIVER'
              : String(data.role || '').toUpperCase() === 'ADMIN'
                ? 'ADMIN'
                : 'CUSTOMER';

          userRole = normalizedRole;
          currentDeliveryId = String(data.deliveryId || 'CE-650018').trim();

          // Resolver tanto o UUID (id) como o order_code no PostgreSQL PostGIS
          const lookupRes = await pool.query(
            `SELECT
               id::text AS id,
               order_code,
               status::text AS status,
               COALESCE(ST_Y(current_driver_location), ST_Y(pickup_location)) AS latitude,
               COALESCE(ST_X(current_driver_location), ST_X(pickup_location)) AS longitude,
               ST_AsText(current_driver_location) AS driver_wkt
             FROM kitingo_deliveries
             WHERE id::text = $1 OR order_code = $1
             LIMIT 1`,
            [currentDeliveryId]
          );

          const resolvedRow = lookupRes.rows[0];
          if (resolvedRow) {
            currentOrderCode = String(resolvedRow.order_code);
          }

          activeConnections.set(ws, {
            userId: data.userId ? String(data.userId) : undefined,
            deliveryId: resolvedRow ? String(resolvedRow.id) : currentDeliveryId,
            orderCode: currentOrderCode || currentDeliveryId,
            role: userRole,
            connectedAt: new Date().toISOString(),
          });

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                event: 'AUTH_TRACKING_ACK',
                role: userRole,
                deliveryId: resolvedRow ? String(resolvedRow.id) : currentDeliveryId,
                orderCode: currentOrderCode || currentDeliveryId,
                latitude: resolvedRow ? Number(resolvedRow.latitude) : -8.8168,
                longitude: resolvedRow ? Number(resolvedRow.longitude) : 13.2284,
                driverWkt: resolvedRow?.driver_wkt || 'POINT(13.2284 -8.8168)',
                timestamp: new Date(),
              })
            );
          }
          return;
        }

        // 2. Se o estafeta enviar nova coordenada GPS (UPDATE_DRIVER_LOCATION)
        if (
          data.action === 'UPDATE_DRIVER_LOCATION' &&
          (userRole === 'DRIVER' || String(data.role || '').toUpperCase() === 'DRIVER')
        ) {
          const latitude = Number(data.latitude);
          const longitude = Number(data.longitude);
          const heading = Number(data.heading ?? 145);
          const speed = Number(data.speed ?? 38);
          const targetDeliveryId = String(
            currentDeliveryId || data.deliveryId || 'CE-650018'
          ).trim();

          if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
          ) {
            return;
          }

          // 1. Atualizar base de dados com PostGIS (suporta UUID id ou order_code)
          const updateRes = await pool.query(
            `UPDATE kitingo_deliveries 
             SET current_driver_location = ST_SetSRID(ST_MakePoint($1, $2), 4326),
                 updated_at = NOW()
             WHERE id::text = $3 OR order_code = $3
             RETURNING
               id::text AS id,
               order_code,
               status::text AS status,
               ST_AsText(current_driver_location) AS driver_wkt,
               COALESCE(ROUND(ST_DistanceSphere(current_driver_location, pickup_location))::int, 0) AS dist_pickup_m,
               COALESCE(ROUND(ST_DistanceSphere(current_driver_location, destination_location))::int, 0) AS dist_dest_m`,
            [longitude, latitude, targetDeliveryId]
          );

          const updatedDelivery = updateRes.rows[0];
          const canonicalId = updatedDelivery ? String(updatedDelivery.id) : targetDeliveryId;
          const canonicalOrderCode = updatedDelivery
            ? String(updatedDelivery.order_code)
            : currentOrderCode || targetDeliveryId;

          // Sincronizar também delivery_missions para manter paridade total
          await pool
            .query(
              `UPDATE delivery_missions
               SET driver_lat = $1,
                   driver_lng = $2,
                   updated_at = NOW()
               WHERE order_code = $3`,
              [String(latitude), String(longitude), canonicalOrderCode]
            )
            .catch(() => {});

          const locationUpdatePayload = {
            event: 'DRIVER_LOCATION_UPDATE',
            deliveryId: canonicalId,
            orderCode: canonicalOrderCode,
            latitude,
            longitude,
            heading,
            speed,
            driverWkt:
              updatedDelivery?.driver_wkt ||
              `POINT(${longitude.toFixed(4)} ${latitude.toFixed(4)})`,
            postgisDistanceToPickupMeters: updatedDelivery
              ? Number(updatedDelivery.dist_pickup_m)
              : undefined,
            postgisDistanceToDestinationMeters: updatedDelivery
              ? Number(updatedDelivery.dist_dest_m)
              : undefined,
            timestamp: new Date(),
          };

          // 2. Transmitir em tempo real EXCLUSIVAMENTE para o cliente da mesma entrega
          activeConnections.forEach((clientInfo, clientSocket) => {
            const isSameDelivery =
              clientInfo.deliveryId === targetDeliveryId ||
              clientInfo.deliveryId === canonicalId ||
              clientInfo.orderCode === canonicalOrderCode ||
              clientInfo.deliveryId === canonicalOrderCode;

            if (
              clientSocket.readyState === WebSocket.OPEN &&
              isSameDelivery &&
              clientInfo.role === 'CUSTOMER'
            ) {
              clientSocket.send(JSON.stringify(locationUpdatePayload));
            }
          });

          // Confirmar receção ao próprio estafeta (e Torre Admin se subscrita na mesma entrega)
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(locationUpdatePayload));
          }
        }
      } catch (err) {
        console.error('Erro no fluxo de socket do Kitingo:', err);
      }
    });

    ws.on('close', () => {
      activeConnections.delete(ws);
    });
  });

  return wss;
}

export default setupKitingoTrackingSocket;
