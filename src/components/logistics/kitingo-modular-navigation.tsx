import React, { useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Bike,
  CheckCircle2,
  Compass,
  Database,
  KeyRound,
  Layers,
  MapPin,
  Navigation,
  QrCode,
  Radio,
  RefreshCw,
  Route,
  ShieldCheck,
  Store,
  Timer,
} from 'lucide-react';
import {
  DELIVERY_STATE_LABELS,
  DELIVERY_STATE_ORDER,
  DeliveryState,
} from '../../lib/kitingo-gps';
import KitingoLiveNavigation from './kitingo-live-navigation';

export interface ModularGpsMission {
  orderCode: string;
  postgisId?: string | null;
  customerPhone: string;
  customerName: string;
  bancaCode: string;
  bancaName: string;
  driverCode: string;
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  missionState: DeliveryState | string;
  activeLeg: 'PICKUP' | 'DESTINATION' | string;
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
  pickupWkt?: string;
  destinationWkt?: string;
  driverWkt?: string;
  postgisDistanceToPickupMeters?: number;
  postgisDistanceToDestinationMeters?: number;
  isOtpVerified?: boolean;
  pickupPin?: string;
  pickupQrToken?: string;
  deliveryPin?: string;
  deliveryQrToken?: string;
  routeHistory?: Array<{
    lat: number;
    lng: number;
    timestamp: string;
    state: string;
    leg: string;
    speedKmh: number;
  }>;
}

interface KitingoModularNavigationProps {
  mode: 'driver' | 'customer' | 'admin';
  apiKey: string;
  mission: ModularGpsMission;
  onSimulateStep?: () => void;
  onStateChange?: (nextState: DeliveryState) => void;
  onConfirmPickup?: (method: 'PIN_OTP' | 'QR_CODE', code: string) => void;
  onConfirmDelivery?: (method: 'PIN_OTP' | 'QR_CODE', code: string) => void;
  busy?: boolean;
}

type PolylineInstance = {
  setMap: (map: unknown) => void;
  setPath: (path: unknown) => void;
};

function DirectionsRouteOverlay({
  driverPos,
  pickupPos,
  destPos,
  activeLeg,
  routeHistory = [],
}: {
  driverPos: { lat: number; lng: number };
  pickupPos: { lat: number; lng: number };
  destPos: { lat: number; lng: number };
  activeLeg: string;
  routeHistory?: Array<{ lat: number; lng: number }>;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const mapsLib = useMapsLibrary('maps');
  const polyRef = useRef<PolylineInstance | null>(null);
  const trailRef = useRef<PolylineInstance | null>(null);

  useEffect(() => {
    if (!map || !mapsLib) return;

    const targetPos = activeLeg === 'PICKUP' ? pickupPos : destPos;

    if (polyRef.current) {
      polyRef.current.setMap(null);
    }

    const activeColor = activeLeg === 'PICKUP' ? '#D97706' : '#16A34A';

    const PolylineCtor = (
      mapsLib as unknown as {
        Polyline: new (opts: Record<string, unknown>) => PolylineInstance;
      }
    ).Polyline;

    polyRef.current = new PolylineCtor({
      path: [driverPos, targetPos],
      geodesic: true,
      strokeColor: activeColor,
      strokeOpacity: 0.95,
      strokeWeight: 5,
      map,
    });

    if (trailRef.current) {
      trailRef.current.setMap(null);
    }

    if (routeHistory.length > 1) {
      trailRef.current = new PolylineCtor({
        path: routeHistory.map((pt) => ({ lat: Number(pt.lat), lng: Number(pt.lng) })),
        geodesic: true,
        strokeColor: '#7C3AED',
        strokeOpacity: 0.65,
        strokeWeight: 3,
        map,
      });
    }

    // Optional Google Routes DirectionsService refinement
    if (routesLib) {
      const DirectionsServiceCtor = (
        routesLib as unknown as {
          DirectionsService: new () => {
            route: (
              req: Record<string, unknown>,
              cb: (
                result: { routes?: Array<{ overview_path?: unknown }> } | null,
                status: string
              ) => void
            ) => void;
          };
        }
      ).DirectionsService;
      if (DirectionsServiceCtor) {
        const ds = new DirectionsServiceCtor();
        ds.route(
          {
            origin: driverPos,
            destination: targetPos,
            travelMode: 'DRIVING',
          },
          (result, status) => {
            if (status === 'OK' && result?.routes?.[0]?.overview_path && polyRef.current) {
              polyRef.current.setPath(result.routes[0].overview_path);
            }
          }
        );
      }
    }

    return () => {
      if (polyRef.current) polyRef.current.setMap(null);
      if (trailRef.current) trailRef.current.setMap(null);
    };
  }, [
    map,
    mapsLib,
    routesLib,
    driverPos.lat,
    driverPos.lng,
    pickupPos.lat,
    pickupPos.lng,
    destPos.lat,
    destPos.lng,
    activeLeg,
    routeHistory.length,
  ]);

  return null;
}

export const KitingoModularNavigation: React.FC<KitingoModularNavigationProps> = ({
  mode,
  apiKey,
  mission,
  onSimulateStep,
  onStateChange,
  onConfirmPickup,
  onConfirmDelivery,
  busy = false,
}) => {
  const [quickPin, setQuickPin] = useState('');
  const [showPostgisInspector, setShowPostgisInspector] = useState(mode === 'admin');
  const wsRef = useRef<WebSocket | null>(null);
  const [wsAuthActive, setWsAuthActive] = useState(false);
  const [liveSocketLocation, setLiveSocketLocation] = useState<{
    latitude: number;
    longitude: number;
    heading: number;
    speed: number;
    driverWkt?: string;
    timestamp: string;
  } | null>(null);

  const deliveryIdForSocket =
    mission.postgisId || mission.orderCode || 'e856c0b8-df63-45df-8320-60707f0fb846';
  const socketRole =
    mode === 'driver' ? 'DRIVER' : mode === 'customer' ? 'CUSTOMER' : 'ADMIN';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mounted = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mounted) return;
        ws.send(
          JSON.stringify({
            action: 'AUTH_TRACKING',
            role: socketRole,
            deliveryId: deliveryIdForSocket,
          })
        );
      };

      ws.onmessage = (evt) => {
        if (!mounted) return;
        try {
          const payload = JSON.parse(evt.data);
          if (payload?.event === 'AUTH_TRACKING_ACK') {
            setWsAuthActive(true);
          } else if (payload?.event === 'DRIVER_LOCATION_UPDATE') {
            setLiveSocketLocation({
              latitude: Number(payload.latitude),
              longitude: Number(payload.longitude),
              heading: Number(payload.heading ?? 145),
              speed: Number(payload.speed ?? 38),
              driverWkt: payload.driverWkt,
              timestamp: new Date(payload.timestamp || Date.now()).toLocaleTimeString('pt-AO'),
            });
          }
        } catch {
          // ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        if (mounted) setWsAuthActive(false);
      };
    } catch {
      setWsAuthActive(false);
    }

    return () => {
      mounted = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [deliveryIdForSocket, socketRole]);

  const effectiveDriverLat = liveSocketLocation?.latitude ?? mission.driverLat;
  const effectiveDriverLng = liveSocketLocation?.longitude ?? mission.driverLng;

  const isPickupLeg = mission.activeLeg === 'PICKUP';
  const etaMinutes = Math.max(1, Math.ceil((mission.etaSeconds || 120) / 60));
  const stateLabel =
    DELIVERY_STATE_LABELS[mission.missionState as DeliveryState] || mission.missionState;

  const pickupWkt =
    mission.pickupWkt || `POINT(${mission.pickupLng.toFixed(4)} ${mission.pickupLat.toFixed(4)})`;
  const destinationWkt =
    mission.destinationWkt ||
    `POINT(${mission.destinationLng.toFixed(4)} ${mission.destinationLat.toFixed(4)})`;
  const driverWkt =
    liveSocketLocation?.driverWkt ||
    mission.driverWkt ||
    `POINT(${effectiveDriverLng.toFixed(4)} ${effectiveDriverLat.toFixed(4)})`;

  function handleEmitSocketLocationUpdate() {
    const targetLat = isPickupLeg ? mission.pickupLat : mission.destinationLat;
    const targetLng = isPickupLeg ? mission.pickupLng : mission.destinationLng;
    const nextLat = Number(
      (effectiveDriverLat + (targetLat - effectiveDriverLat) * 0.35).toFixed(5)
    );
    const nextLng = Number(
      (effectiveDriverLng + (targetLng - effectiveDriverLng) * 0.35).toFixed(5)
    );

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: 'UPDATE_DRIVER_LOCATION',
          role: 'DRIVER',
          deliveryId: deliveryIdForSocket,
          latitude: nextLat,
          longitude: nextLng,
          heading: 148,
          speed: 38,
        })
      );
    }
    if (onSimulateStep) {
      onSimulateStep();
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Top Modular Navigation Header */}
      <div
        className={`px-4 py-3.5 text-white flex flex-wrap items-center justify-between gap-3 ${
          isPickupLeg ? 'bg-[#D97706]' : 'bg-[#16A34A]'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
            <Compass className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-black/25">
                {mode === 'driver'
                  ? 'Módulo GPS Estafeta'
                  : mode === 'customer'
                    ? 'Rastreio Live Comprador'
                    : 'Torre PostGIS Admin'}
              </span>
              <span className="text-xs font-mono font-bold bg-white/20 px-2 py-0.5 rounded">
                {mission.orderCode}
              </span>
              <span className="text-[11px] font-extrabold bg-slate-900/40 px-2 py-0.5 rounded">
                {mission.missionState}
              </span>
              <span className="text-[10px] font-mono font-bold bg-black/30 px-2 py-0.5 rounded flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    wsAuthActive ? 'bg-emerald-300' : 'bg-amber-300'
                  }`}
                />
                WS AUTH_TRACKING ({socketRole})
              </span>
            </div>
            <p className="text-sm font-black mt-0.5">
              {isPickupLeg
                ? `ETAPA 1 (RECOLHA): Navegar até ${mission.bancaName}`
                : `ETAPA 2 (ENTREGA): Rota Automática até ${mission.customerName}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right bg-black/20 px-3 py-1.5 rounded-xl">
            <p className="text-[10px] uppercase font-bold text-white/80">Distância / ETA</p>
            <p className="text-xs font-black">
              {mission.distanceToTargetMeters}m ({mission.distanceKm} km) · ~{etaMinutes} min
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPostgisInspector((prev) => !prev)}
            className="px-2.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5 transition"
            title="Inspecionar Geometria PostGIS (SRID 4326)"
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">PostGIS 4326</span>
          </button>
        </div>
      </div>

      {/* PostGIS Spatial Inspector Bar (kitingo_deliveries schema) */}
      {showPostgisInspector && (
        <div className="bg-slate-900 text-slate-100 px-4 py-3 border-b border-slate-800 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#16A34A]" />
              <span className="font-black uppercase tracking-wider text-[11px] text-emerald-400">
                PostgreSQL + PostGIS (kitingo_deliveries · SRID 4326 GIST Index) + WebSocket Isolado
              </span>
            </div>
            <span className="font-mono text-[11px] text-slate-400">
              deliveryId: {deliveryIdForSocket}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 font-mono text-[11px]">
            <div className="bg-slate-800/90 border border-slate-700 rounded-lg p-2">
              <span className="text-amber-400 font-bold block">pickup_location (GEOMETRY):</span>
              <span className="text-slate-200">{pickupWkt}</span>
              <span className="block text-[10px] text-slate-400 mt-0.5">
                ST_DistanceSphere: {mission.postgisDistanceToPickupMeters ?? mission.distanceToTargetMeters}m
              </span>
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-lg p-2">
              <span className="text-sky-400 font-bold block">current_driver_location (GIST):</span>
              <span className="text-slate-200">{driverWkt}</span>
              <span className="block text-[10px] text-slate-400 mt-0.5">
                {liveSocketLocation
                  ? `WS DRIVER_LOCATION_UPDATE: ${liveSocketLocation.speed}km/h · ${liveSocketLocation.heading}° (${liveSocketLocation.timestamp})`
                  : `Estafeta: ${mission.driverCode} (${mission.vehiclePlate})`}
              </span>
            </div>
            <div className="bg-slate-800/90 border border-slate-700 rounded-lg p-2">
              <span className="text-emerald-400 font-bold block">destination_location (GEOMETRY):</span>
              <span className="text-slate-200">{destinationWkt}</span>
              <span className="block text-[10px] text-slate-400 mt-0.5">
                ST_DistanceSphere: {mission.postgisDistanceToDestinationMeters ?? mission.distanceToTargetMeters}m · OTP Verified:{' '}
                {mission.isOtpVerified ? 'TRUE' : 'FALSE'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Google Maps SDK Route Canvas */}
      <div className="relative h-64 sm:h-72 w-full bg-slate-100">
        {apiKey ? (
          <APIProvider apiKey={apiKey}>
            <GoogleMap
              defaultZoom={14}
              center={{ lat: effectiveDriverLat, lng: effectiveDriverLng }}
              mapId="KITINGO_MODULAR_POSTGIS_MAP"
              gestureHandling="greedy"
              disableDefaultUI={false}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              className="w-full h-full"
            >
              <DirectionsRouteOverlay
                driverPos={{ lat: effectiveDriverLat, lng: effectiveDriverLng }}
                pickupPos={{ lat: mission.pickupLat, lng: mission.pickupLng }}
                destPos={{ lat: mission.destinationLat, lng: mission.destinationLng }}
                activeLeg={mission.activeLeg}
                routeHistory={mission.routeHistory}
              />

              {/* Vendor Pickup Marker (Praça dos Correios) */}
              <AdvancedMarker position={{ lat: mission.pickupLat, lng: mission.pickupLng }}>
                <div className="px-2.5 py-1 rounded-full bg-[#D97706] text-white text-[11px] font-black shadow-lg border-2 border-white flex items-center gap-1">
                  <Store className="w-3.5 h-3.5" />
                  <span>{mission.bancaCode}</span>
                </div>
              </AdvancedMarker>

              {/* Customer Destination Marker */}
              <AdvancedMarker position={{ lat: mission.destinationLat, lng: mission.destinationLng }}>
                <div className="px-2.5 py-1 rounded-full bg-[#16A34A] text-white text-[11px] font-black shadow-lg border-2 border-white flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Comprador</span>
                </div>
              </AdvancedMarker>

              {/* Active Driver Live Location Marker */}
              <AdvancedMarker position={{ lat: effectiveDriverLat, lng: effectiveDriverLng }}>
                <div className="px-3 py-1.5 rounded-full bg-slate-900 text-white text-xs font-black shadow-xl border-2 border-amber-400 flex items-center gap-1.5">
                  <Bike className="w-4 h-4 text-amber-400" />
                  <span>{mission.driverCode}</span>
                </div>
              </AdvancedMarker>
            </GoogleMap>
          </APIProvider>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
            <Navigation className="w-8 h-8 text-amber-400 mb-2 animate-pulse" />
            <p className="text-sm font-bold">
              Mapa Vetorial PostGIS Kitingo ({driverWkt})
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {isPickupLeg
                ? `Origem Estafeta → Recolha: ${mission.pickupAddress}`
                : `Recolha Confirmada → Comprador: ${mission.destinationAddress}`}
            </p>
          </div>
        )}

        {/* Floating Geofence & State Overlay Pill */}
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <div className="pointer-events-auto bg-slate-900/90 backdrop-blur text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>{stateLabel}</span>
          </div>

          <div
            className={`pointer-events-auto px-3 py-1.5 rounded-xl text-xs font-black shadow-lg flex items-center gap-1.5 ${
              mission.insidePickupGeofence || mission.insideDestinationGeofence
                ? 'bg-[#16A34A] text-white'
                : 'bg-white/95 text-slate-800 border border-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>
              Geofence ({mission.geofenceRadiusMeters}m):{' '}
              {mission.insidePickupGeofence
                ? 'NO PERÍMETRO DA BANCA'
                : mission.insideDestinationGeofence
                  ? 'NO PERÍMETRO DO CLIENTE'
                  : 'EM TRÂNSITO'}
            </span>
          </div>
        </div>
      </div>

      {/* Role-Specific Action & Telemetry Footer */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
        {/* 10-State Operational Progress Bar */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {DELIVERY_STATE_ORDER.map((st) => {
            const active = mission.missionState === st;
            return (
              <button
                key={st}
                type="button"
                disabled={!onStateChange || busy}
                onClick={() => onStateChange && onStateChange(st)}
                className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0 transition ${
                  active
                    ? 'bg-[#7C3AED] text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {st.replace(/_/g, ' ')}
              </button>
            );
          })}
        </div>

        {/* Driver & Admin Quick Simulation Controls */}
        {(mode === 'driver' || mode === 'admin') && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleEmitSocketLocationUpdate}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                <span>Emitir UPDATE_DRIVER_LOCATION (WS + PostGIS ST_MakePoint)</span>
              </button>

              {isPickupLeg && onConfirmPickup && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    maxLength={4}
                    value={quickPin}
                    onChange={(e) => setQuickPin(e.target.value.replace(/\D/g, ''))}
                    placeholder={`PIN Recolha (${mission.pickupPin || '0018'})`}
                    className="w-36 px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      onConfirmPickup('PIN_OTP', quickPin || mission.pickupPin || '0018')
                    }
                    className="px-3 py-2 rounded-xl bg-[#D97706] hover:bg-amber-700 text-white text-xs font-black flex items-center gap-1"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Confirmar Recolha → Mudar Rota</span>
                  </button>
                </div>
              )}

              {!isPickupLeg &&
                mission.missionState !== 'DELIVERY_CONFIRMED' &&
                onConfirmDelivery && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      maxLength={4}
                      value={quickPin}
                      onChange={(e) => setQuickPin(e.target.value.replace(/\D/g, ''))}
                      placeholder={`PIN Entrega (${mission.deliveryPin || '2437'})`}
                      className="w-36 px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onConfirmDelivery('PIN_OTP', quickPin || mission.deliveryPin || '2437')
                      }
                      className="px-3 py-2 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirmar Entrega Final</span>
                    </button>
                  </div>
                )}
            </div>

            <div className="text-[11px] font-bold text-slate-600 flex items-center gap-2">
              <Route className="w-3.5 h-3.5 text-[#7C3AED]" />
              <span>
                {isPickupLeg
                  ? `Destino Atual: ${mission.pickupAddress}`
                  : `Destino Comutado: ${mission.destinationAddress}`}
              </span>
            </div>
          </div>
        )}

        {/* Customer Mode Verification Card */}
        {mode === 'customer' && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#16A34A]">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-black text-slate-900">
                  Código de Validação de Entrega ao Comprador
                </p>
                <p className="text-[11px] text-slate-500">
                  Apresente este PIN de 4 dígitos ou QR Code apenas quando o estafeta entregar a peça em mãos.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-mono text-sm font-black tracking-widest">
                PIN: {mission.deliveryPin || '2437'}
              </div>
              {onSimulateStep && (
                <button
                  type="button"
                  onClick={onSimulateStep}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1"
                >
                  <Timer className="w-3.5 h-3.5" />
                  <span>Atualizar Posição</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* KitingoLiveNavigation (Estafeta <-> Cliente WebSocket /tracking & OTP Regra 4) */}
        <KitingoLiveNavigation
          deliveryId={deliveryIdForSocket}
          userRole={mode === 'customer' ? 'CUSTOMER' : 'DRIVER'}
          initialPickup={{
            lat: mission.pickupLat,
            lng: mission.pickupLng,
            label: `${mission.bancaName} (${mission.pickupAddress})`,
          }}
          initialDestination={{
            lat: mission.destinationLat,
            lng: mission.destinationLng,
            label: `${mission.customerName} (${mission.destinationAddress})`,
          }}
          initialStatus={mission.missionState}
          initialDriverLocation={{
            lat: effectiveDriverLat,
            lng: effectiveDriverLng,
          }}
          initialEta={`${etaMinutes} min`}
          expectedPickupOtp={mission.pickupPin || '0018'}
          secureDeliveryPin={mission.deliveryPin || '4892'}
          bancaName={`${mission.bancaCode} · ${mission.bancaName}`}
          bancaPhone={mode === 'customer' ? undefined : '+244 923 814 008'}
          driverName={`${mission.driverName} (${mission.driverCode})`}
          driverPhone={mission.driverPhone || '+244 931 880 210'}
          customerName={mission.customerName}
          customerPhone={mission.customerPhone}
          onStatusChanged={(nextSt) => {
            if (onStateChange) {
              onStateChange(nextSt as DeliveryState);
            }
          }}
        />
      </div>
    </div>
  );
};
