export type KitingoDeliveryState =
  | 'WAITING_FOR_DRIVER'
  | 'DRIVER_ASSIGNED'
  | 'GOING_TO_PICKUP'
  | 'ARRIVED_AT_PICKUP'
  | 'PICKUP_CONFIRMED'
  | 'GOING_TO_DESTINATION'
  | 'ARRIVED_AT_DESTINATION'
  | 'DELIVERY_CONFIRMED'
  | 'DELIVERY_FAILED'
  | 'CANCELLED';

export type NavigationLeg = 'PICKUP' | 'DESTINATION';

export interface RouteBreadcrumb {
  lat: number;
  lng: number;
  timestamp: string;
  state: KitingoDeliveryState;
  leg: NavigationLeg;
  speedKmh: number;
}

export interface DeliveryMissionDto {
  orderCode: string;
  trackingToken: string;
  customerPhone: string;
  customerName: string;
  bancaCode: string;
  bancaName: string;
  driverCode: string;
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  missionState: KitingoDeliveryState;
  activeLeg: NavigationLeg;
  driverLat: number;
  driverLng: number;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  destinationLat: number;
  destinationLng: number;
  destinationAddress: string;
  distanceKm: number;
  distanceToTargetMeters: number;
  etaSeconds: number;
  geofenceRadiusMeters: number;
  insidePickupGeofence: boolean;
  insideDestinationGeofence: boolean;
  pickupPin?: string;
  pickupQrToken?: string;
  deliveryPin?: string;
  deliveryQrToken?: string;
  routeHistory: RouteBreadcrumb[];
  failureReason?: string | null;
  updatedAt: string;
}

export interface DeliveryTrackingEventDto {
  id: number;
  eventCode: string;
  orderCode: string;
  driverCode: string;
  previousState: string | null;
  newState: KitingoDeliveryState;
  actorRole: string;
  verificationMethod: string;
  lat: number;
  lng: number;
  distanceToTargetMeters: number;
  description: string;
  createdAt: string;
}

export const DELIVERY_STATE_PIPELINE: KitingoDeliveryState[] = [
  'WAITING_FOR_DRIVER',
  'DRIVER_ASSIGNED',
  'GOING_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'PICKUP_CONFIRMED',
  'GOING_TO_DESTINATION',
  'ARRIVED_AT_DESTINATION',
  'DELIVERY_CONFIRMED',
];

export const DELIVERY_STATE_META: Record<
  KitingoDeliveryState,
  {
    code: KitingoDeliveryState;
    stepNumber: number;
    shortLabel: string;
    customerTitle: string;
    driverInstruction: string;
    leg: NavigationLeg;
    colorHex: string;
  }
> = {
  WAITING_FOR_DRIVER: {
    code: 'WAITING_FOR_DRIVER',
    stepNumber: 1,
    shortLabel: 'Aguarda Estafeta',
    customerTitle: 'A localizar estafeta disponível na Praça dos Correios',
    driverInstruction: 'Pedido na fila de despacho GPS da Praça dos Correios.',
    leg: 'PICKUP',
    colorHex: '#64748B',
  },
  DRIVER_ASSIGNED: {
    code: 'DRIVER_ASSIGNED',
    stepNumber: 2,
    shortLabel: 'Estafeta Atribuído',
    customerTitle: 'Estafeta atribuído · Coordenadas da banca recebidas',
    driverInstruction: 'Coordenadas do vendedor recebidas. Inicie navegação para a banca.',
    leg: 'PICKUP',
    colorHex: '#7C3AED',
  },
  GOING_TO_PICKUP: {
    code: 'GOING_TO_PICKUP',
    stepNumber: 3,
    shortLabel: 'A Caminho da Banca',
    customerTitle: 'Estafeta em navegação até à banca vendedora',
    driverInstruction: 'Siga a rota GPS até à banca na Praça dos Correios para recolher a peça.',
    leg: 'PICKUP',
    colorHex: '#D97706',
  },
  ARRIVED_AT_PICKUP: {
    code: 'ARRIVED_AT_PICKUP',
    stepNumber: 4,
    shortLabel: 'Na Banca (Geofence)',
    customerTitle: 'Estafeta chegou à banca · A inspecionar peça vs. amostra',
    driverInstruction: 'Dentro da Geofence da Banca (<120m). Valide a amostra e confirme o PIN ou QR Code de recolha.',
    leg: 'PICKUP',
    colorHex: '#D97706',
  },
  PICKUP_CONFIRMED: {
    code: 'PICKUP_CONFIRMED',
    stepNumber: 5,
    shortLabel: 'Recolha Confirmada',
    customerTitle: 'Peça recolhida e validada! Rota atualizada automaticamente para si',
    driverInstruction: 'Recolha confirmada! Destino comutado automaticamente para as coordenadas do comprador.',
    leg: 'DESTINATION',
    colorHex: '#16A34A',
  },
  GOING_TO_DESTINATION: {
    code: 'GOING_TO_DESTINATION',
    stepNumber: 6,
    shortLabel: 'A Caminho do Cliente',
    customerTitle: 'Estafeta em trânsito GPS para o seu endereço de entrega',
    driverInstruction: 'Navegação ativa até ao comprador. Mantenha o GPS ativo.',
    leg: 'DESTINATION',
    colorHex: '#16A34A',
  },
  ARRIVED_AT_DESTINATION: {
    code: 'ARRIVED_AT_DESTINATION',
    stepNumber: 7,
    shortLabel: 'Chegou ao Cliente',
    customerTitle: 'O estafeta chegou ao seu local! Apresente o PIN ou QR Code',
    driverInstruction: 'Dentro da Geofence do Comprador (<120m). Solicite o PIN de 4 dígitos ou leia o QR Code do cliente.',
    leg: 'DESTINATION',
    colorHex: '#7C3AED',
  },
  DELIVERY_CONFIRMED: {
    code: 'DELIVERY_CONFIRMED',
    stepNumber: 8,
    shortLabel: 'Entrega Confirmada',
    customerTitle: 'Entrega concluída e validada digitalmente (Escrow Libertado)',
    driverInstruction: 'Entrega final confirmada por PIN/QR! Frete creditado na carteira.',
    leg: 'DESTINATION',
    colorHex: '#16A34A',
  },
  DELIVERY_FAILED: {
    code: 'DELIVERY_FAILED',
    stepNumber: 0,
    shortLabel: 'Falha na Entrega',
    customerTitle: 'Ocorrência registada na entrega · Suporte Kitingo acionado',
    driverInstruction: 'Entrega não concluída. Registe o motivo e aguarde instruções da Torre GPS.',
    leg: 'DESTINATION',
    colorHex: '#DC2626',
  },
  CANCELLED: {
    code: 'CANCELLED',
    stepNumber: 0,
    shortLabel: 'Cancelado',
    customerTitle: 'Missão de entrega cancelada · Reembolso Escrow protegido',
    driverInstruction: 'Missão cancelada pela central.',
    leg: 'PICKUP',
    colorHex: '#64748B',
  },
};

export function isValidGpsCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

export function isWithinAngolaBounds(lat: number, lng: number): boolean {
  if (!isValidGpsCoordinate(lat, lng)) return false;
  // Angola bounding box (-18.5 to -4.2 lat, 11.4 to 24.5 lng)
  return lat >= -19.0 && lat <= -4.0 && lng >= 11.0 && lng <= 25.0;
}

export function computeDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const s =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return Math.round(R * c);
}

export type DeliveryState = KitingoDeliveryState;

export const DELIVERY_STATE_ORDER: KitingoDeliveryState[] = [
  'WAITING_FOR_DRIVER',
  'DRIVER_ASSIGNED',
  'GOING_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'PICKUP_CONFIRMED',
  'GOING_TO_DESTINATION',
  'ARRIVED_AT_DESTINATION',
  'DELIVERY_CONFIRMED',
  'DELIVERY_FAILED',
  'CANCELLED',
];

export const DELIVERY_STATE_LABELS: Record<KitingoDeliveryState, string> = {
  WAITING_FOR_DRIVER: '1. Aguarda Estafeta (WAITING_FOR_DRIVER)',
  DRIVER_ASSIGNED: '2. Estafeta Atribuído (DRIVER_ASSIGNED)',
  GOING_TO_PICKUP: '3. Navegação até Banca (GOING_TO_PICKUP)',
  ARRIVED_AT_PICKUP: '4. Na Banca · Geofence (ARRIVED_AT_PICKUP)',
  PICKUP_CONFIRMED: '5. Recolha Confirmada (PICKUP_CONFIRMED)',
  GOING_TO_DESTINATION: '6. Rota Automática p/ Comprador (GOING_TO_DESTINATION)',
  ARRIVED_AT_DESTINATION: '7. No Local do Comprador (ARRIVED_AT_DESTINATION)',
  DELIVERY_CONFIRMED: '8. Entrega Confirmada (DELIVERY_CONFIRMED)',
  DELIVERY_FAILED: 'Falha na Entrega (DELIVERY_FAILED)',
  CANCELLED: 'Missão Cancelada (CANCELLED)',
};

export function triggerKitingoPushNotification(title: string, body: string) {
  if (typeof window === 'undefined') return;
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: `kitingo-gps-${Date.now()}`,
      });
    }
  } catch {
    // Ignore browser notification restrictions inside iframe
  }
}

