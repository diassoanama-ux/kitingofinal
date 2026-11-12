import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Bike,
  Camera,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  Clock,
  Compass,
  Delete,
  History,
  KeyRound,
  LocateFixed,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  Navigation,
  Package,
  PackageCheck,
  Phone,
  PhoneCall,
  PhoneOff,
  Power,
  QrCode,
  Radio,
  ShieldCheck,
  Square,
  Store,
  Volume2,
  X,
  Headphones,
} from 'lucide-react';
import { formatKz } from '@/lib/products';
import {
  getSimulatedVoiceReply,
  kitingoCallAudio,
} from '../../lib/kitingo-call-audio.ts';
import {
  DELIVERY_STATE_META,
  DELIVERY_STATE_PIPELINE,
  triggerKitingoPushNotification,
  type DeliveryMissionDto,
  type DeliveryTrackingEventDto,
  type KitingoDeliveryState,
} from '../../lib/kitingo-gps.ts';
import type { DriverDeliveryTask, LatLngPoint } from './logistics-module';
import { KitingoModularNavigation } from './kitingo-modular-navigation';
import { KitingoTicketCenter } from '../support/kitingo-ticket-center';
import { KitingoDeliveryRatingCenter } from '../reviews/kitingo-delivery-rating-center';

export type DriverAppTab = 'recolha' | 'navegacao' | 'otp' | 'entregas' | 'tickets';

interface DriverAppProps {
  driverName?: string | null;
  driverPhone?: string | null;
  driverCode?: string | null;
  vehiclePlate?: string | null;
}

type MapPolylineInstance = {
  setMap: (map: unknown) => void;
  setOptions: (opts: Record<string, unknown>) => void;
};

function DriverNavigationRouteLayer({
  driverPos,
  pickupPos,
  destinationPos,
  activeLeg,
  breadcrumbs,
}: {
  driverPos: LatLngPoint;
  pickupPos: LatLngPoint;
  destinationPos: LatLngPoint;
  activeLeg: 'PICKUP' | 'DESTINATION';
  breadcrumbs: Array<{ lat: number; lng: number }>;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const mapsLib = useMapsLibrary('maps');
  const polylinesRef = useRef<MapPolylineInstance[]>([]);

  useEffect(() => {
    if (!map || !mapsLib) return;

    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    let cancelled = false;
    const targetPos = activeLeg === 'PICKUP' ? pickupPos : destinationPos;
    const strokeColor = activeLeg === 'PICKUP' ? '#D97706' : '#16A34A';

    async function drawRoute() {
      // Draw historical breadcrumbs trail in purple
      if (breadcrumbs.length >= 2 && mapsLib) {
        const PolylineCtor = (mapsLib as unknown as {
          Polyline: new (opts: Record<string, unknown>) => MapPolylineInstance;
        }).Polyline;
        const trailLine = new PolylineCtor({
          path: breadcrumbs.map((b) => ({ lat: b.lat, lng: b.lng })),
          geodesic: true,
          strokeColor: '#7C3AED',
          strokeOpacity: 0.65,
          strokeWeight: 3,
          map,
        });
        polylinesRef.current.push(trailLine);
      }

      const RouteCtor = (routesLib as Record<string, unknown> | null)?.Route as
        | {
            computeRoutes?: (req: Record<string, unknown>) => Promise<{
              routes?: Array<{
                createPolylines?: () => MapPolylineInstance[];
              }>;
            }>;
          }
        | undefined;

      if (RouteCtor && typeof RouteCtor.computeRoutes === 'function') {
        try {
          const response = await RouteCtor.computeRoutes({
            origin: driverPos,
            destination: targetPos,
            travelMode: 'DRIVING',
            fields: ['path'],
          });
          if (!cancelled && response?.routes?.[0]?.createPolylines) {
            const routePolylines = response.routes[0].createPolylines();
            routePolylines.forEach((p: MapPolylineInstance) => {
              p.setOptions({
                strokeColor,
                strokeOpacity: 0.94,
                strokeWeight: 5,
              });
              p.setMap(map);
            });
            polylinesRef.current.push(...routePolylines);
            return;
          }
        } catch {
          // Fallback to geodesic corridor polyline below
        }
      }

      if (cancelled || !mapsLib) return;
      const PolylineCtor = (mapsLib as unknown as {
        Polyline: new (opts: Record<string, unknown>) => MapPolylineInstance;
      }).Polyline;

      const fallbackLine = new PolylineCtor({
        path: [driverPos, targetPos],
        geodesic: true,
        strokeColor,
        strokeOpacity: 0.94,
        strokeWeight: 5,
        map,
      });
      polylinesRef.current.push(fallbackLine);
    }

    drawRoute();

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [
    map,
    routesLib,
    mapsLib,
    driverPos.lat,
    driverPos.lng,
    pickupPos.lat,
    pickupPos.lng,
    destinationPos.lat,
    destinationPos.lng,
    activeLeg,
    breadcrumbs,
  ]);

  return null;
}

export function DriverApp({
  driverName,
  driverPhone,
  driverCode,
  vehiclePlate,
}: DriverAppProps) {
  const activeDriverName = driverName || 'Paulo Sebastião';
  const activeDriverPhone = driverPhone || '+244 931 880 210';
  const activeDriverCode = driverCode || 'EST-019';
  const activeVehiclePlate = vehiclePlate || 'LD-44-92-AO';

  const [tab, setTab] = useState<DriverAppTab>('navegacao');
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [backgroundGpsActive, setBackgroundGpsActive] = useState<boolean>(true);
  const [liveDeviceWatchActive, setLiveDeviceWatchActive] = useState<boolean>(false);
  const [tasks, setTasks] = useState<DriverDeliveryTask[]>([]);
  const [missions, setMissions] = useState<DeliveryMissionDto[]>([]);
  const [missionEvents, setMissionEvents] = useState<DeliveryTrackingEventDto[]>([]);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState<number>(0);
  const [visualSampleConfirmed, setVisualSampleConfirmed] = useState<boolean>(true);
  const [verificationMode, setVerificationMode] = useState<'PIN_OTP' | 'QR_CODE'>('PIN_OTP');
  const [otpStage, setOtpStage] = useState<'pickup' | 'delivery'>('pickup');
  const [otpDigits, setOtpDigits] = useState<string>('');
  const [qrInputToken, setQrInputToken] = useState<string>('');
  const [verifyingOtp, setVerifyingOtp] = useState<boolean>(false);
  const [advancingGps, setAdvancingGps] = useState<boolean>(false);
  const [zoomedPhotoUrl, setZoomedPhotoUrl] = useState<string | null>(null);
  const [driverEarningsTodayKz, setDriverEarningsTodayKz] = useState<number>(40500);
  const [driverDeliveriesToday, setDriverDeliveriesToday] = useState<number>(9);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Interactive Voice Call State in DriverApp (Banca or Cliente)
  const [activeCall, setActiveCall] = useState<{
    target: 'BANCA' | 'CLIENTE';
    name: string;
    phone: string;
    subtitle: string;
  } | null>(null);
  const [callPhase, setCallPhase] = useState<'ringing' | 'connected'>('connected');
  const [callSeconds, setCallSeconds] = useState<number>(0);
  const [callMuted, setCallMuted] = useState<boolean>(false);
  const [callSpeaker, setCallSpeaker] = useState<boolean>(true);
  const [callQuickNote, setCallQuickNote] = useState<string | null>(null);
  const [callReply, setCallReply] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCall) {
      setCallSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setCallSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [activeCall]);

  const watchIdRef = useRef<number | null>(null);

  const apiKey = (
    (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_GOOGLE_MAPS_API_KEY || ''
  ).trim();

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 5500);
  }, []);

  const handleStartDriverCall = useCallback(
    (
      target: 'BANCA' | 'CLIENTE',
      name: string,
      phone: string,
      subtitle: string
    ) => {
      setCallQuickNote(null);
      setCallReply(null);
      setCallSeconds(0);
      setCallMuted(false);
      setCallSpeaker(true);
      setCallPhase('ringing');
      setActiveCall({ target, name, phone, subtitle });

      kitingoCallAudio.playDialAndConnectSound(() => {
        setCallPhase('connected');
        setCallReply(getSimulatedVoiceReply(target));
      });
    },
    []
  );

  const handleEndDriverCall = useCallback(() => {
    kitingoCallAudio.playHangupTone();
    setActiveCall(null);
    setCallQuickNote(null);
    setCallReply(null);
  }, []);

  const formatCallTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const fetchDriverData = useCallback(async () => {
    try {
      const [overviewRes, gpsRes] = await Promise.all([
        fetch('/api/logistics/overview'),
        fetch('/api/gps/missions?role=estafeta'),
      ]);
      const overviewData = await overviewRes.json();
      const gpsData = await gpsRes.json();

      if (overviewData?.ok) {
        setTasks(overviewData.tasks || []);
        const currentDriver = (overviewData.drivers || []).find(
          (d: any) => d.driverCode === activeDriverCode
        );
        if (currentDriver) {
          setDriverDeliveriesToday(currentDriver.deliveriesToday || 9);
          setDriverEarningsTodayKz((currentDriver.deliveriesToday || 9) * 4500);
        }
      }

      if (gpsData?.ok) {
        setMissions(gpsData.missions || []);
        setMissionEvents(gpsData.events || []);
      }
    } catch {
      // Keep local state on transient error
    }
  }, [activeDriverCode]);

  useEffect(() => {
    fetchDriverData();
  }, [fetchDriverData]);

  // WebSocket live connection with automatic reconnection
  useEffect(() => {
    let mounted = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connectWs() {
      if (!mounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      try {
        socket = new WebSocket(wsUrl);
        socket.onmessage = (event) => {
          if (!mounted) return;
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'gps:mission_updated' && payload.mission) {
              setMissions((prev) => {
                const exists = prev.some((m) => m.orderCode === payload.mission.orderCode);
                if (!exists) return [payload.mission, ...prev];
                return prev.map((m) =>
                  m.orderCode === payload.mission.orderCode ? payload.mission : m
                );
              });
              if (payload.event) {
                setMissionEvents((prev) => [payload.event, ...prev.slice(0, 39)]);
              }
              if (payload.pushNotification) {
                triggerKitingoPushNotification(
                  payload.pushNotification.title,
                  payload.pushNotification.body
                );
              }
            } else if (payload.type === 'delivery:completed') {
              setMissions((prev) =>
                prev.map((m) =>
                  m.orderCode === (payload.orderCode || 'CE-650018')
                    ? { ...m, missionState: 'DELIVERY_CONFIRMED', etaSeconds: 0, distanceKm: 0 }
                    : m
                )
              );
              triggerKitingoPushNotification(
                `Peça Entregue com Sucesso (${payload.orderCode || 'CE-650018'})!`,
                `O cliente ${payload.customerName || 'João Manuel Baptista'} confirmou a receção da peça.`
              );
              fetchDriverData();
            } else if (
              payload.type === 'logistics:pickup_verified' ||
              payload.type === 'logistics:delivery_verified'
            ) {
              fetchDriverData();
            }
          } catch {
            // ignore
          }
        };
        socket.onclose = () => {
          if (!mounted) return;
          reconnectTimer = setTimeout(connectWs, 3000);
        };
      } catch {
        // ignore
      }
    }

    connectWs();

    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [fetchDriverData]);

  const activeTask: DriverDeliveryTask = useMemo(() => {
    if (tasks.length > 0) {
      return tasks[Math.min(selectedTaskIndex, tasks.length - 1)];
    }
    return {
      orderCode: 'CE-650018',
      bancaCode: 'PC-008',
      bancaName: 'Banca #08 - Peças do Zé',
      bancaSector: 'Setor Central · Praça dos Correios, Ingombota',
      customerName: 'João Manuel Baptista',
      customerPhone: '+244 924 514 042',
      destinationAddress: 'Largo da Maianga, Luanda',
      destinationCoords: { lat: -8.8295, lng: 13.2348 },
      vehicleModel: 'Toyota Hilux 2.8 GD-6 (2020)',
      partSummary: '1x Alternador Denso 12V 150A · Peça Lacrada 72h',
      partCondition: 'recondicionada',
      referencePhotos: [
        '/products/alternador.png',
        '/products/pastilhas-travao.png',
        '/products/amortecedor.png',
      ],
      orderAmountKz: 97900,
      transportFeeKz: 4500,
      pickupOtp: '0018',
      deliveryOtp: '2437',
      status: 'aguarda_recolha',
    };
  }, [tasks, selectedTaskIndex]);

  const activeMission: DeliveryMissionDto = useMemo(() => {
    const matched = missions.find((m) => m.orderCode === activeTask.orderCode);
    if (matched) return matched;
    if (missions.length > 0) return missions[0];
    return {
      orderCode: activeTask.orderCode,
      trackingToken: `TRK-${activeTask.orderCode}-AO`,
      customerPhone: activeTask.customerPhone,
      customerName: activeTask.customerName,
      bancaCode: activeTask.bancaCode,
      bancaName: activeTask.bancaName,
      driverCode: activeDriverCode,
      driverName: activeDriverName,
      driverPhone: activeDriverPhone,
      vehiclePlate: activeVehiclePlate,
      missionState: 'GOING_TO_PICKUP',
      activeLeg: 'PICKUP',
      driverLat: -8.8159,
      driverLng: 13.2291,
      pickupLat: -8.8147,
      pickupLng: 13.2302,
      pickupAddress: 'Praça dos Correios · Corredor Central (Banca #08)',
      destinationLat: activeTask.destinationCoords.lat,
      destinationLng: activeTask.destinationCoords.lng,
      destinationAddress: activeTask.destinationAddress,
      distanceKm: 0.22,
      distanceToTargetMeters: 220,
      etaSeconds: 95,
      geofenceRadiusMeters: 120,
      insidePickupGeofence: false,
      insideDestinationGeofence: false,
      pickupPin: activeTask.pickupOtp,
      pickupQrToken: `KT-PICKUP-${activeTask.orderCode}-${activeTask.pickupOtp}`,
      deliveryPin: activeTask.deliveryOtp,
      deliveryQrToken: `KT-DELIV-${activeTask.orderCode}-${activeTask.deliveryOtp}`,
      routeHistory: [],
      updatedAt: new Date().toISOString(),
    };
  }, [
    missions,
    activeTask,
    activeDriverCode,
    activeDriverName,
    activeDriverPhone,
    activeVehiclePlate,
  ]);

  // Keep otpStage synchronized with the mission's active leg
  useEffect(() => {
    if (activeMission.activeLeg === 'DESTINATION') {
      setOtpStage('delivery');
    } else {
      setOtpStage('pickup');
    }
  }, [activeMission.activeLeg]);

  // Real browser Geolocation watchPosition (Android Fused Location / iOS Core Location web bridge)
  const toggleLiveDeviceGpsWatch = useCallback(() => {
    if (liveDeviceWatchActive) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
      setLiveDeviceWatchActive(false);
      showToast('success', 'Captura contínua do sensor GPS local pausada.');
      return;
    }

    if (!navigator.geolocation) {
      showToast('error', 'Sensor Geolocation não disponível neste dispositivo.');
      return;
    }

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    setLiveDeviceWatchActive(true);
    showToast(
      'success',
      'Captura GPS em Tempo Real (watchPosition + Segundo Plano) ativada!'
    );

    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          await fetch(
            `/api/gps/missions/${encodeURIComponent(activeMission.orderCode)}/telemetry`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lat: Number(pos.coords.latitude.toFixed(5)),
                lng: Number(pos.coords.longitude.toFixed(5)),
                speedKmh: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 34,
                actorRole: 'estafeta',
              }),
            }
          );
        } catch {
          // ignore transient network error
        }
      },
      () => {
        // If iframe blocks native GPS permission, advance smoothly along Luanda route
        fetch(
          `/api/gps/missions/${encodeURIComponent(activeMission.orderCode)}/telemetry`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stepTowardTarget: true,
              speedKmh: 36,
              actorRole: 'estafeta',
            }),
          }
        ).catch(() => {});
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 6000,
      }
    );
    watchIdRef.current = id;
  }, [liveDeviceWatchActive, activeMission.orderCode, showToast]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Advance GPS along active route leg (triggers 120m Geofencing automatically!)
  async function handleStepGpsTowardTarget() {
    setAdvancingGps(true);
    try {
      const res = await fetch(
        `/api/gps/missions/${encodeURIComponent(activeMission.orderCode)}/telemetry`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stepTowardTarget: true,
            speedKmh: 38,
            actorRole: 'estafeta',
          }),
        }
      );
      const data = await res.json();
      if (res.ok && data.ok && data.mission) {
        setMissions((prev) =>
          prev.map((m) => (m.orderCode === data.mission.orderCode ? data.mission : m))
        );
        if (data.geofenceTriggered && data.pushNotification) {
          showToast(
            'success',
            `${data.pushNotification.title}: ${data.pushNotification.body}`
          );
        } else {
          showToast(
            'success',
            `Coordenadas GPS atualizadas (${data.mission.driverLat.toFixed(4)}, ${data.mission.driverLng.toFixed(4)}) · Distância: ${data.mission.distanceToTargetMeters}m`
          );
        }
      }
    } catch {
      showToast('error', 'Erro ao atualizar telemetria GPS.');
    } finally {
      setAdvancingGps(false);
    }
  }

  // Trigger manual operational state transition (e.g., WAITING_FOR_DRIVER -> DRIVER_ASSIGNED -> GOING_TO_PICKUP)
  async function handleStateTransition(
    nextState: KitingoDeliveryState,
    failureReason?: string
  ) {
    try {
      const res = await fetch(
        `/api/gps/missions/${encodeURIComponent(activeMission.orderCode)}/state`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nextState,
            failureReason,
            actorRole: 'estafeta',
          }),
        }
      );
      const data = await res.json();
      if (res.ok && data.ok && data.mission) {
        setMissions((prev) =>
          prev.map((m) => (m.orderCode === data.mission.orderCode ? data.mission : m))
        );
        showToast(
          'success',
          `Estado operacional atualizado para: ${DELIVERY_STATE_META[nextState].shortLabel} (${nextState})`
        );
      }
    } catch {
      showToast('error', 'Não foi possível alterar o estado da missão.');
    }
  }

  function handleKeypadDigit(digit: string) {
    setOtpDigits((prev) => (prev.length < 4 ? prev + digit : prev));
  }

  function handleKeypadBackspace() {
    setOtpDigits((prev) => prev.slice(0, -1));
  }

  function handleKeypadClear() {
    setOtpDigits('');
  }

  // Digital Confirmation of Pickup (Leg 1 -> Auto-Switch to Leg 2) OR Final Delivery (Leg 2)
  async function handleConfirmHandoverSubmit(overrideMethod?: 'PIN_OTP' | 'QR_CODE') {
    const activeMethod = overrideMethod || verificationMode;

    if (otpStage === 'pickup' && !visualSampleConfirmed) {
      showToast(
        'error',
        'Confirme primeiro que a peça recolhida corresponde visualmente à amostra do cliente.'
      );
      return;
    }

    if (activeMethod === 'PIN_OTP' && otpDigits.length !== 4) {
      showToast('error', 'Introduza os 4 dígitos do PIN antes de confirmar.');
      return;
    }

    setVerifyingOtp(true);
    try {
      if (otpStage === 'pickup') {
        const res = await fetch(
          `/api/gps/missions/${encodeURIComponent(activeMission.orderCode)}/confirm-pickup`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: activeMethod,
              pinCode: otpDigits,
              qrToken:
                qrInputToken.trim() ||
                activeMission.pickupQrToken ||
                `KT-PICKUP-${activeMission.orderCode}-${activeMission.pickupPin}`,
              visualSampleConfirmed,
            }),
          }
        );
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Falha ao confirmar recolha na banca.');
        }

        if (data.mission) {
          setMissions((prev) =>
            prev.map((m) => (m.orderCode === data.mission.orderCode ? data.mission : m))
          );
        }
        setOtpDigits('');
        setOtpStage('delivery');
        showToast('success', data.message);
        await fetchDriverData();
      } else {
        const res = await fetch(
          `/api/gps/missions/${encodeURIComponent(activeMission.orderCode)}/confirm-delivery`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: activeMethod,
              pinCode: otpDigits,
              qrToken:
                qrInputToken.trim() ||
                activeMission.deliveryQrToken ||
                `KT-DELIV-${activeMission.orderCode}-${activeMission.deliveryPin}`,
            }),
          }
        );
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Falha ao confirmar entrega ao comprador.');
        }

        if (data.mission) {
          setMissions((prev) =>
            prev.map((m) => (m.orderCode === data.mission.orderCode ? data.mission : m))
          );
        }
        setOtpDigits('');
        setDriverDeliveriesToday((prev) => prev + 1);
        setDriverEarningsTodayKz((prev) => prev + activeTask.transportFeeKz);
        showToast('success', data.message);
        await fetchDriverData();
      }
    } catch (err: any) {
      showToast('error', err.message || 'Erro na confirmação digital.');
    } finally {
      setVerifyingOtp(false);
    }
  }

  const currentStateMeta =
    DELIVERY_STATE_META[activeMission.missionState] ||
    DELIVERY_STATE_META.GOING_TO_PICKUP;

  const driverPos: LatLngPoint = {
    lat: activeMission.driverLat,
    lng: activeMission.driverLng,
  };
  const pickupPos: LatLngPoint = {
    lat: activeMission.pickupLat,
    lng: activeMission.pickupLng,
  };
  const destinationPos: LatLngPoint = {
    lat: activeMission.destinationLat,
    lng: activeMission.destinationLng,
  };

  return (
    <div className="min-h-dvh bg-background text-foreground pb-32">
      {/* STICKY MOBILE APP HEADER */}
      <header className="sticky top-0 z-30 bg-primary text-primary-foreground shadow-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 pt-3.5 pb-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-lg font-black text-brand-accent-foreground"
              >
                KT
              </div>
              <div className="leading-tight">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-bold tracking-tight">
                    Kitingo <span className="text-brand-accent">Live GPS Estafeta</span>
                  </p>
                  <span className="rounded-md bg-primary-foreground/15 px-2 py-0.5 font-mono text-xs font-bold text-brand-accent">
                    #{activeDriverCode}
                  </span>
                  <span
                    className="rounded-md px-2 py-0.5 font-mono text-[11px] font-bold text-white"
                    style={{ backgroundColor: currentStateMeta.colorHex }}
                  >
                    {activeMission.missionState}
                  </span>
                </div>
                <p className="text-xs text-primary-foreground/75">
                  Navegação Automática 2-Etapas: Recolha na Banca → Entrega ao Comprador
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleLiveDeviceGpsWatch}
                className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors cursor-pointer ${
                  liveDeviceWatchActive
                    ? 'bg-[#7C3AED] text-white'
                    : 'bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25'
                }`}
              >
                <LocateFixed className="size-3.5" />
                <span className="hidden sm:inline">
                  {liveDeviceWatchActive ? 'GPS Nativo Ativo' : 'Ativar GPS Nativo'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = !isOnline;
                  setIsOnline(next);
                  showToast(
                    next ? 'success' : 'error',
                    next
                      ? 'Turno GPS Ativo! Pronto para recolhas na Praça dos Correios.'
                      : 'Turno em pausa.'
                  );
                }}
                className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold shadow-xs transition-transform active:scale-95 cursor-pointer ${
                  isOnline
                    ? 'bg-[#16A34A] text-white'
                    : 'bg-primary-foreground/15 text-primary-foreground'
                }`}
              >
                <Power className="size-3.5" />
                <span>{isOnline ? 'Em Turno' : 'Offline'}</span>
              </button>
            </div>
          </div>

          {/* Active Mission Selector + Background Location Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary-foreground/10 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-primary-foreground/80">Missão GPS:</span>
              <select
                aria-label="Selecionar missão de entrega"
                value={selectedTaskIndex}
                onChange={(e) => {
                  setSelectedTaskIndex(Number(e.target.value));
                  setOtpDigits('');
                }}
                className="rounded-lg bg-card px-2.5 py-1 font-mono text-xs font-bold text-foreground focus:outline-none"
              >
                {tasks.map((t, idx) => (
                  <option key={t.orderCode} value={idx}>
                    #{t.orderCode} · {t.bancaCode} → {t.destinationAddress} (+
                    {formatKz(t.transportFeeKz)})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setBackgroundGpsActive((prev) => !prev)}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold cursor-pointer ${
                  backgroundGpsActive
                    ? 'bg-[#16A34A] text-white'
                    : 'bg-primary-foreground/20 text-primary-foreground'
                }`}
              >
                <Radio className="size-3" />
                <span>
                  {backgroundGpsActive ? 'GPS 2º Plano: ON' : 'GPS 2º Plano: OFF'}
                </span>
              </button>

              {/* Botões Diretos de Chamada Rápida do Estafeta (Banca & Cliente) */}
              <button
                type="button"
                onClick={() =>
                  handleStartDriverCall(
                    'BANCA',
                    `${activeMission.bancaCode} · ${activeMission.bancaName}`,
                    '+244 923 814 008',
                    'Ponto de Recolha · Praça dos Correios'
                  )
                }
                className="inline-flex items-center gap-1 rounded-lg bg-[#D97706] px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-95 cursor-pointer"
              >
                <PhoneCall className="size-3" />
                <span>Ligar Banca (+244 923 814 008)</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleStartDriverCall(
                    'CLIENTE',
                    activeMission.customerName,
                    activeMission.customerPhone,
                    `Comprador · ${activeMission.destinationAddress}`
                  )
                }
                className="inline-flex items-center gap-1 rounded-lg bg-[#16A34A] px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-95 cursor-pointer"
              >
                <PhoneCall className="size-3" />
                <span>Ligar Cliente ({activeMission.customerPhone})</span>
              </button>

              <button
                type="button"
                onClick={() => setTab('tickets')}
                className="inline-flex items-center gap-1 rounded-lg bg-[#7C3AED] px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-95 cursor-pointer"
              >
                <Headphones className="size-3" />
                <span>Abrir Ticket Back-Office</span>
              </button>
            </div>

            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="text-primary-foreground/85">
                Etapa Ativa:{' '}
                <strong className="text-brand-accent">
                  {activeMission.activeLeg === 'PICKUP'
                    ? `1. RECOLHA (${activeMission.bancaCode})`
                    : `2. COMPRADOR (${activeMission.customerName})`}
                </strong>
              </span>
              <span className="rounded-md bg-brand-accent px-2 py-0.5 font-bold text-brand-accent-foreground">
                {formatKz(driverEarningsTodayKz)}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-4">
        {/* PAINEL INTERATIVO DE CHAMADA EM CURSO (ESTAFETA <-> BANCA OU CLIENTE) */}
        {activeCall && (
          <section
            aria-label={`Chamada em curso com ${activeCall.name}`}
            className={`rounded-2xl border-2 p-4 text-white shadow-xl space-y-3 ${
              activeCall.target === 'BANCA'
                ? 'border-[#D97706] bg-slate-900'
                : 'border-[#16A34A] bg-slate-900'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-md animate-pulse ${
                    activeCall.target === 'BANCA' ? 'bg-[#D97706]' : 'bg-[#16A34A]'
                  }`}
                >
                  <PhoneCall className="size-5" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-white/15 px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider text-amber-300">
                      {callPhase === 'ringing'
                        ? 'A CHAMAR...'
                        : `CHAMADA CONECTADA · ${formatCallTimer(callSeconds)}`}
                    </span>
                    <span className="text-xs text-slate-300">{activeCall.subtitle}</span>
                  </div>
                  <p className="mt-1 text-sm font-black text-white">{activeCall.name}</p>
                  <p className="font-mono text-xs text-emerald-400">{activeCall.phone}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCallMuted((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold cursor-pointer ${
                    callMuted
                      ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                      : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {callMuted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                  <span>{callMuted ? 'Som Off' : 'Microfone On'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCallSpeaker((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold cursor-pointer ${
                    callSpeaker
                      ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                      : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <Volume2 className="size-3.5" />
                  <span>{callSpeaker ? 'Altifalante On' : 'Normal'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCallPhase('ringing');
                    setCallSeconds(0);
                    kitingoCallAudio.playDialAndConnectSound(() => {
                      setCallPhase('connected');
                      setCallReply(getSimulatedVoiceReply(activeCall.target));
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3 py-2 text-xs font-bold text-white hover:opacity-90 cursor-pointer"
                >
                  <Phone className="size-3.5" />
                  <span>Rediscar</span>
                </button>

                <button
                  type="button"
                  onClick={handleEndDriverCall}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-3.5 py-2 text-xs font-black text-white hover:opacity-90 cursor-pointer"
                >
                  <PhoneOff className="size-3.5" />
                  <span>Terminar</span>
                </button>
              </div>
            </div>

            {callReply && (
              <div className="rounded-xl border border-emerald-500/30 bg-slate-950/90 p-3 text-xs font-medium text-emerald-300">
                🔊 {callReply}
              </div>
            )}

            <div className="border-t border-slate-800 pt-2.5">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <MessageSquare className="size-3.5 text-amber-400" />
                <span>Enviar aviso rápido operacional para {activeCall.name}:</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(activeCall.target === 'BANCA'
                  ? [
                      'Estou na entrada da Praça dos Correios, qual é o corredor?',
                      'Cheguei à banca, tenho o código OTP pronto para recolha.',
                      'Prepare a peça para conferência visual com a amostra.',
                    ]
                  : [
                      'Já recolhi a peça na banca, estou a caminho do seu local.',
                      'Estou a chegar ao endereço, prepare o PIN de 4 dígitos.',
                      'Estou estacionado no ponto de encontro indicado no GPS.',
                    ]
                ).map((msgText) => (
                  <button
                    key={msgText}
                    type="button"
                    onClick={() => {
                      kitingoCallAudio.playMessageSentBeep();
                      setCallQuickNote(msgText);
                      setCallReply(getSimulatedVoiceReply(activeCall.target, msgText));
                    }}
                    className="rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-1.5 text-left text-[11px] font-semibold text-slate-200 hover:border-amber-500/50 hover:text-white transition cursor-pointer"
                  >
                    “{msgText}”
                  </button>
                ))}
              </div>
              {callQuickNote && (
                <p className="mt-2 text-xs font-bold text-emerald-400">
                  ✓ Aviso transmitido para {activeCall.name}: “{callQuickNote}”
                </p>
              )}
            </div>
          </section>
        )}

        {toast && (
          <div
            role="status"
            className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs font-bold text-white shadow-xs ${
              toast.type === 'success' ? 'bg-[#16A34A]' : 'bg-[#DC2626]'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? (
                <CheckCircle2 className="size-4 shrink-0 text-white" />
              ) : (
                <AlertCircle className="size-4 shrink-0 text-white" />
              )}
              <span>{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-[11px] underline opacity-90 hover:opacity-100 cursor-pointer"
            >
              OK
            </button>
          </div>
        )}

        {/* 10-STATE OPERATIONAL PIPELINE BAR */}
        <section className="rounded-2xl border border-border bg-card p-3.5 shadow-2xs">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-xs font-black text-white"
                style={{ backgroundColor: currentStateMeta.colorHex }}
              >
                {activeMission.missionState}
              </span>
              <span className="text-xs font-bold text-foreground">
                {currentStateMeta.driverInstruction}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={advancingGps}
                onClick={handleStepGpsTowardTarget}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#7C3AED] px-3 py-1.5 text-xs font-bold text-white hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                <Navigation className="size-3.5" />
                <span>
                  {advancingGps
                    ? 'A atualizar GPS...'
                    : activeMission.activeLeg === 'PICKUP'
                      ? 'Avançar GPS p/ Banca (Testar Geofence 120m)'
                      : 'Avançar GPS p/ Comprador (Testar Geofence 120m)'}
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-8">
            {DELIVERY_STATE_PIPELINE.map((st) => {
              const meta = DELIVERY_STATE_META[st];
              const isCurrent = activeMission.missionState === st;
              const isDone = meta.stepNumber < currentStateMeta.stepNumber;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleStateTransition(st)}
                  className={`flex flex-col items-start rounded-xl border p-2 text-left transition-all cursor-pointer ${
                    isCurrent
                      ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                      : isDone
                        ? 'border-[#16A34A]/40 bg-[#16A34A]/10 text-foreground'
                        : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <span className="font-mono text-[10px] font-bold opacity-80">
                    {meta.stepNumber}. {meta.leg}
                  </span>
                  <span className="mt-0.5 line-clamp-1 text-[11px] font-bold">
                    {meta.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* TAB 2: NAVEGAÇÃO GPS 2-ETAPAS (PICKUP NAVIGATION -> DESTINATION NAVIGATION) */}
        {tab === 'navegacao' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <KitingoModularNavigation
                mode="driver"
                apiKey={apiKey}
                mission={activeMission}
                busy={advancingGps || verifyingOtp}
                onSimulateStep={handleStepGpsTowardTarget}
                onStateChange={(st) => handleStateTransition(st)}
                onConfirmPickup={async (method, code) => {
                  setOtpStage('pickup');
                  setOtpDigits(code);
                  const res = await fetch(
                    `/api/gps/missions/${encodeURIComponent(activeMission.orderCode)}/confirm-pickup`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        method,
                        pinCode: code,
                        qrToken: activeMission.pickupQrToken,
                        visualSampleConfirmed: true,
                      }),
                    }
                  );
                  const data = await res.json();
                  if (res.ok && data.ok) {
                    if (data.mission) {
                      setMissions((prev) =>
                        prev.map((m) =>
                          m.orderCode === data.mission.orderCode ? data.mission : m
                        )
                      );
                    }
                    setOtpStage('delivery');
                    showToast('success', data.message);
                    await fetchDriverData();
                  } else {
                    showToast('error', data.error || 'Erro ao confirmar recolha.');
                  }
                }}
                onConfirmDelivery={async (method, code) => {
                  setOtpStage('delivery');
                  setOtpDigits(code);
                  const res = await fetch(
                    `/api/gps/missions/${encodeURIComponent(activeMission.orderCode)}/confirm-delivery`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        method,
                        pinCode: code,
                        qrToken: activeMission.deliveryQrToken,
                      }),
                    }
                  );
                  const data = await res.json();
                  if (res.ok && data.ok) {
                    if (data.mission) {
                      setMissions((prev) =>
                        prev.map((m) =>
                          m.orderCode === data.mission.orderCode ? data.mission : m
                        )
                      );
                    }
                    showToast('success', data.message);
                    await fetchDriverData();
                  } else {
                    showToast('error', data.error || 'Erro ao confirmar entrega.');
                  }
                }}
              />
            </div>

            {/* Right Sidebar: Quick Digital Handover + Route History & Exception Controls */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2.5">
                  <h2 className="text-sm font-bold text-foreground">
                    Confirmação Digital Rápida (PIN ou QR)
                  </h2>
                  <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
                    {activeMission.activeLeg === 'PICKUP' ? 'RECOLHA' : 'ENTREGA'}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  {activeMission.activeLeg === 'PICKUP'
                    ? 'Ao confirmar a recolha na banca (PIN ou QR Code), o destino muda automaticamente para o comprador.'
                    : 'Solicite o PIN de 4 dígitos ou leia o QR Code do comprador para confirmar a entrega.'}
                </p>

                <div className="grid grid-cols-1 gap-2">
                  {activeMission.activeLeg === 'PICKUP' ? (
                    <>
                      <button
                        type="button"
                        disabled={verifyingOtp}
                        onClick={() => {
                          setOtpStage('pickup');
                          setOtpDigits(activeMission.pickupPin || '0018');
                          setTab('recolha');
                        }}
                        className="flex items-center justify-between rounded-xl bg-[#D97706] px-3.5 py-2.5 text-xs font-bold text-white hover:opacity-95 cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <KeyRound className="size-4" />
                          Confirmar Recolha por PIN ({activeMission.pickupPin})
                        </span>
                        <ArrowRight className="size-4" />
                      </button>

                      <button
                        type="button"
                        disabled={verifyingOtp}
                        onClick={() => {
                          setOtpStage('pickup');
                          setVerificationMode('QR_CODE');
                          setQrInputToken(activeMission.pickupQrToken || '');
                          handleConfirmHandoverSubmit('QR_CODE');
                        }}
                        className="flex items-center justify-between rounded-xl bg-[#7C3AED] px-3.5 py-2.5 text-xs font-bold text-white hover:opacity-95 cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <QrCode className="size-4" />
                          Ler QR Code da Banca → Mudar Rota p/ Comprador
                        </span>
                        <ArrowRight className="size-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={verifyingOtp}
                        onClick={() => {
                          setOtpStage('delivery');
                          setOtpDigits(activeMission.deliveryPin || '2437');
                          setTab('otp');
                        }}
                        className="flex items-center justify-between rounded-xl bg-[#16A34A] px-3.5 py-2.5 text-xs font-bold text-white hover:opacity-95 cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <KeyRound className="size-4" />
                          Validar Entrega por PIN ({activeMission.deliveryPin})
                        </span>
                        <ArrowRight className="size-4" />
                      </button>

                      <button
                        type="button"
                        disabled={verifyingOtp}
                        onClick={() => {
                          setOtpStage('delivery');
                          setVerificationMode('QR_CODE');
                          setQrInputToken(activeMission.deliveryQrToken || '');
                          handleConfirmHandoverSubmit('QR_CODE');
                        }}
                        className="flex items-center justify-between rounded-xl bg-[#7C3AED] px-3.5 py-2.5 text-xs font-bold text-white hover:opacity-95 cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <QrCode className="size-4" />
                          Ler QR Code do Comprador (Concluir Entrega)
                        </span>
                        <ArrowRight className="size-4" />
                      </button>
                    </>
                  )}
                </div>

                {/* Contactos Diretos no Painel Lateral (Banca & Cliente) */}
                <div className="grid grid-cols-2 gap-2 border-t border-border pt-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleStartDriverCall(
                        'BANCA',
                        `${activeMission.bancaCode} · ${activeMission.bancaName}`,
                        '+244 923 814 008',
                        'Ponto de Recolha · Praça dos Correios'
                      )
                    }
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#D97706] px-2.5 py-2 text-[11px] font-bold text-white hover:opacity-90 cursor-pointer"
                  >
                    <PhoneCall className="size-3.5" />
                    <span>Ligar à Banca</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleStartDriverCall(
                        'CLIENTE',
                        activeMission.customerName,
                        activeMission.customerPhone,
                        `Comprador · ${activeMission.destinationAddress}`
                      )
                    }
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#16A34A] px-2.5 py-2 text-[11px] font-bold text-white hover:opacity-90 cursor-pointer"
                  >
                    <PhoneCall className="size-3.5" />
                    <span>Ligar ao Cliente</span>
                  </button>
                </div>

                {/* Exception states: DELIVERY_FAILED / CANCELLED */}
                <div className="flex items-center gap-2 border-t border-border pt-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleStateTransition(
                        'DELIVERY_FAILED',
                        'Cliente ausente no ponto de entrega após 15 min'
                      )
                    }
                    className="flex-1 rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-2.5 py-1.5 text-[11px] font-bold text-[#DC2626] hover:bg-[#DC2626]/20 cursor-pointer"
                  >
                    Registar Falha (DELIVERY_FAILED)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStateTransition('GOING_TO_PICKUP')}
                    className="rounded-lg border border-border bg-muted px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-secondary cursor-pointer"
                  >
                    Reiniciar Rota
                  </button>
                </div>
              </section>

              {/* Route Breadcrumbs & Event History */}
              <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <History className="size-4 text-[#7C3AED]" />
                    Histórico de Percursos & Eventos ({activeMission.routeHistory.length})
                  </span>
                </div>

                <div className="max-h-56 space-y-2 overflow-y-auto pr-1 text-xs">
                  {activeMission.routeHistory
                    .slice()
                    .reverse()
                    .map((pt, idx) => (
                      <div
                        key={`${pt.timestamp}-${idx}`}
                        className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-2.5 py-1.5"
                      >
                        <div>
                          <span className="font-mono text-[10px] font-bold text-[#7C3AED]">
                            [{pt.leg}] {pt.state}
                          </span>
                          <p className="font-mono text-[11px] text-foreground">
                            {pt.lat.toFixed(4)}, {pt.lng.toFixed(4)} ({pt.speedKmh} km/h)
                          </p>
                        </div>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {pt.timestamp}
                        </span>
                      </div>
                    ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* TAB 1: RECOLHA & AMOSTRA DE REFERÊNCIA + PIN/QR */}
        {tab === 'recolha' && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="lg:col-span-7 flex flex-col gap-4">
              <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#7C3AED]">
                      <Camera className="size-4" />
                      Verificação Visual Obrigatória na Banca
                    </span>
                    <h1 className="mt-0.5 text-lg font-bold text-foreground">
                      Recolha #{activeTask.orderCode} · Amostra de Referência
                    </h1>
                  </div>

                  <div className="rounded-xl bg-[#16A34A] px-3 py-1.5 text-right text-white">
                    <span className="block text-[10px] uppercase font-semibold opacity-90">
                      Frete do Estafeta
                    </span>
                    <span className="font-mono text-sm font-black tabular-nums">
                      +{formatKz(activeTask.transportFeeKz)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-muted/40 p-3 flex flex-col justify-between gap-2.5">
                    <div>
                      <div className="flex items-center justify-between gap-1.5 text-xs font-bold text-primary">
                        <span className="flex items-center gap-1.5">
                          <Store className="size-4 text-[#D97706]" />
                          <span>1. Ponto de Recolha (Vendedor)</span>
                        </span>
                        <span className="font-mono text-[11px] text-[#D97706]">
                          +244 923 814 008
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-bold text-foreground">
                        {activeMission.bancaCode} · {activeMission.bancaName}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        GPS: {activeMission.pickupLat.toFixed(4)},{' '}
                        {activeMission.pickupLng.toFixed(4)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          handleStartDriverCall(
                            'BANCA',
                            `${activeMission.bancaCode} · ${activeMission.bancaName}`,
                            '+244 923 814 008',
                            'Ponto de Recolha · Praça dos Correios'
                          )
                        }
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#D97706] px-3 py-2 text-xs font-bold text-white hover:opacity-95 cursor-pointer"
                      >
                        <PhoneCall className="size-3.5" />
                        <span>Ligar para a Banca</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleStartDriverCall(
                            'BANCA',
                            `${activeMission.bancaCode} · ${activeMission.bancaName}`,
                            '+244 923 814 008',
                            'Ponto de Recolha · Praça dos Correios'
                          )
                        }
                        title="Iniciar chamada para a Banca"
                        className="inline-flex items-center justify-center rounded-xl border border-border bg-card p-2 text-foreground hover:bg-muted cursor-pointer"
                      >
                        <Phone className="size-3.5 text-[#D97706]" />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/40 p-3 flex flex-col justify-between gap-2.5">
                    <div>
                      <div className="flex items-center justify-between gap-1.5 text-xs font-bold text-[#16A34A]">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="size-4 text-[#16A34A]" />
                          <span>2. Destino Automático (Comprador)</span>
                        </span>
                        <span className="font-mono text-[11px] text-[#16A34A]">
                          {activeMission.customerPhone}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-bold text-foreground">
                        {activeMission.customerName}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {activeMission.destinationAddress} ({activeMission.destinationLat.toFixed(4)},{' '}
                        {activeMission.destinationLng.toFixed(4)})
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          handleStartDriverCall(
                            'CLIENTE',
                            activeMission.customerName,
                            activeMission.customerPhone,
                            `Comprador · ${activeMission.destinationAddress}`
                          )
                        }
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#16A34A] px-3 py-2 text-xs font-bold text-white hover:opacity-95 cursor-pointer"
                      >
                        <PhoneCall className="size-3.5" />
                        <span>Ligar para o Cliente</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleStartDriverCall(
                            'CLIENTE',
                            activeMission.customerName,
                            activeMission.customerPhone,
                            `Comprador · ${activeMission.destinationAddress}`
                          )
                        }
                        title="Iniciar chamada para o Cliente"
                        className="inline-flex items-center justify-center rounded-xl border border-border bg-card p-2 text-foreground hover:bg-muted cursor-pointer"
                      >
                        <Phone className="size-3.5 text-[#16A34A]" />
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold text-foreground">
                      Fotos da Peça Antiga do Cliente ("Amostra de Referência"):
                    </p>
                    <span className="text-[11px] text-muted-foreground">
                      Toque numa foto para ampliar
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {activeTask.referencePhotos.map((photoUrl, idx) => {
                      const angleLabels = [
                        '1. Frente / Corpo',
                        '2. Ficha / Encaixe',
                        '3. Referência OEM',
                      ];
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setZoomedPhotoUrl(photoUrl)}
                          className="group relative aspect-square overflow-hidden rounded-xl border-2 border-border bg-muted text-left focus:border-[#7C3AED] focus:outline-none cursor-pointer"
                        >
                          <img
                            src={photoUrl}
                            alt={`Amostra de referência ${idx + 1}`}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          <span className="absolute top-1.5 left-1.5 rounded bg-[#7C3AED] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                            Amostra #{idx + 1}
                          </span>
                          <span className="absolute right-1.5 bottom-1.5 left-1.5 truncate rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {angleLabels[idx] || `Ângulo ${idx + 1}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div
                  onClick={() => setVisualSampleConfirmed((prev) => !prev)}
                  role="checkbox"
                  aria-checked={visualSampleConfirmed}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      setVisualSampleConfirmed((prev) => !prev);
                    }
                  }}
                  className={`flex items-start gap-3 rounded-xl border-2 p-3.5 transition-colors cursor-pointer select-none ${
                    visualSampleConfirmed
                      ? 'border-[#16A34A] bg-[#16A34A]/10'
                      : 'border-[#D97706] bg-accent/60 hover:bg-accent'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {visualSampleConfirmed ? (
                      <CheckSquare className="size-5 text-[#16A34A]" />
                    ) : (
                      <Square className="size-5 text-[#D97706]" />
                    )}
                  </span>
                  <div className="flex-1">
                    <p className="text-xs sm:text-sm font-bold text-foreground">
                      Confirmo que a peça recolhida corresponde visualmente à amostra do cliente
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Após confirmar a recolha, a rota GPS muda automaticamente para o endereço de{' '}
                      {activeMission.customerName}.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: PIN / QR Code Handover Box */}
            <div className="lg:col-span-5">
              <section className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                      <QrCode className="size-4 text-brand-accent" />
                      Confirmação Digital (PIN ou QR Code)
                    </span>
                    <h2 className="mt-0.5 text-lg font-bold text-foreground">
                      {otpStage === 'pickup'
                        ? '1. Confirmar Recolha na Banca'
                        : '2. Confirmar Entrega ao Comprador'}
                    </h2>
                  </div>
                </div>

                {/* Stage Toggle */}
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/50 p-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpStage('pickup');
                      setOtpDigits('');
                    }}
                    className={`flex flex-col items-center justify-center rounded-lg px-2.5 py-2 text-center transition-all cursor-pointer ${
                      otpStage === 'pickup'
                        ? 'bg-[#D97706] text-white font-bold shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="text-xs font-bold">1. Recolha na Banca</span>
                    <span className="font-mono text-[10px] opacity-90">
                      PIN {activeMission.pickupPin} · QR
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOtpStage('delivery');
                      setOtpDigits('');
                    }}
                    className={`flex flex-col items-center justify-center rounded-lg px-2.5 py-2 text-center transition-all cursor-pointer ${
                      otpStage === 'delivery'
                        ? 'bg-[#16A34A] text-white font-bold shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="text-xs font-bold">2. Entrega ao Cliente</span>
                    <span className="font-mono text-[10px] opacity-90">
                      PIN {activeMission.deliveryPin} · QR
                    </span>
                  </button>
                </div>

                {/* Method Toggle: PIN vs QR Code */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setVerificationMode('PIN_OTP')}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-bold cursor-pointer ${
                      verificationMode === 'PIN_OTP'
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground'
                    }`}
                  >
                    <KeyRound className="size-3.5" />
                    <span>Teclado PIN (4 Dígitos)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVerificationMode('QR_CODE')}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-bold cursor-pointer ${
                      verificationMode === 'QR_CODE'
                        ? 'border-[#7C3AED] bg-[#7C3AED] text-white'
                        : 'border-border bg-card text-foreground'
                    }`}
                  >
                    <QrCode className="size-3.5" />
                    <span>Leitor QR Code</span>
                  </button>
                </div>

                {verificationMode === 'QR_CODE' ? (
                  <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4 text-center">
                    <div className="mx-auto flex size-24 items-center justify-center rounded-2xl border-2 border-dashed border-[#7C3AED] bg-card">
                      <QrCode className="size-12 text-[#7C3AED]" />
                    </div>
                    <p className="text-xs font-bold text-foreground">
                      Token QR esperado ({otpStage === 'pickup' ? 'Banca' : 'Comprador'}):
                    </p>
                    <p className="rounded-lg bg-card px-3 py-1.5 font-mono text-xs font-bold text-[#7C3AED]">
                      {otpStage === 'pickup'
                        ? activeMission.pickupQrToken
                        : activeMission.deliveryQrToken}
                    </p>
                    <button
                      type="button"
                      disabled={verifyingOtp}
                      onClick={() => handleConfirmHandoverSubmit('QR_CODE')}
                      className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#7C3AED] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:opacity-95 cursor-pointer"
                    >
                      <QrCode className="size-4" />
                      <span>
                        {otpStage === 'pickup'
                          ? 'Simular Leitura QR da Banca & Ativar Rota Comprador'
                          : 'Simular Leitura QR do Comprador & Concluir Entrega'}
                      </span>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">
                        PIN esperado ({otpStage === 'pickup' ? 'Banca' : 'Cliente'}):{' '}
                        <strong className="font-mono text-foreground">
                          {otpStage === 'pickup'
                            ? activeMission.pickupPin
                            : activeMission.deliveryPin}
                        </strong>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setOtpDigits(
                            (otpStage === 'pickup'
                              ? activeMission.pickupPin
                              : activeMission.deliveryPin) || '0018'
                          )
                        }
                        className="rounded-lg bg-primary px-2.5 py-1 font-mono text-[11px] font-bold text-primary-foreground hover:opacity-90 cursor-pointer"
                      >
                        Preencher PIN
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-2.5">
                      {[0, 1, 2, 3].map((slot) => {
                        const char = otpDigits[slot] || '';
                        return (
                          <div
                            key={slot}
                            className={`flex h-14 items-center justify-center rounded-xl border-2 font-mono text-2xl font-black tabular-nums ${
                              char
                                ? 'border-primary bg-primary/5 text-foreground'
                                : 'border-border bg-muted/30 text-muted-foreground'
                            }`}
                          >
                            {char || '•'}
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                        <button
                          key={digit}
                          type="button"
                          onClick={() => handleKeypadDigit(digit)}
                          className="flex h-12 items-center justify-center rounded-xl border border-border bg-muted/40 font-mono text-lg font-bold text-foreground transition-colors hover:bg-secondary active:scale-95 cursor-pointer"
                        >
                          {digit}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={handleKeypadClear}
                        className="flex h-12 items-center justify-center rounded-xl border border-border bg-card text-xs font-bold text-muted-foreground hover:bg-muted cursor-pointer"
                      >
                        Limpar
                      </button>

                      <button
                        type="button"
                        onClick={() => handleKeypadDigit('0')}
                        className="flex h-12 items-center justify-center rounded-xl border border-border bg-muted/40 font-mono text-lg font-bold text-foreground transition-colors hover:bg-secondary active:scale-95 cursor-pointer"
                      >
                        0
                      </button>

                      <button
                        type="button"
                        onClick={handleKeypadBackspace}
                        aria-label="Apagar último dígito"
                        className="flex h-12 items-center justify-center rounded-xl border border-border bg-card text-foreground hover:bg-muted cursor-pointer"
                      >
                        <Delete className="size-5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={verifyingOtp}
                      onClick={() => handleConfirmHandoverSubmit('PIN_OTP')}
                      className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-50 cursor-pointer ${
                        otpStage === 'pickup' ? 'bg-[#D97706]' : 'bg-[#16A34A]'
                      }`}
                    >
                      <PackageCheck className="size-5 shrink-0" />
                      <span>
                        {verifyingOtp
                          ? 'A validar...'
                          : otpStage === 'pickup'
                            ? `Confirmar Recolha & Mudar Rota p/ Comprador`
                            : `Confirmar Entrega Final (+${formatKz(activeTask.transportFeeKz)})`}
                      </span>
                    </button>
                  </>
                )}
              </section>
            </div>
          </div>
        )}

        {/* TAB 3: DEDICATED OTP / QR SCREEN */}
        {tab === 'otp' && (
          <div className="mx-auto w-full max-w-md">
            <section className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
              <div className="border-b border-border pb-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                  <KeyRound className="size-4 text-brand-accent" />
                  Missão #{activeMission.orderCode} · {activeMission.missionState}
                </span>
                <h1 className="mt-0.5 text-lg font-bold text-foreground">
                  Validação Digital por PIN ou QR Code
                </h1>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/50 p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setOtpStage('pickup');
                    setOtpDigits('');
                  }}
                  className={`flex flex-col items-center justify-center rounded-lg px-2.5 py-2 text-center transition-all cursor-pointer ${
                    otpStage === 'pickup'
                      ? 'bg-[#D97706] text-white font-bold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="text-xs font-bold">1. Recolha na Banca</span>
                  <span className="font-mono text-[10px] opacity-90">
                    {activeMission.bancaCode} · PIN {activeMission.pickupPin}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOtpStage('delivery');
                    setOtpDigits('');
                  }}
                  className={`flex flex-col items-center justify-center rounded-lg px-2.5 py-2 text-center transition-all cursor-pointer ${
                    otpStage === 'delivery'
                      ? 'bg-[#16A34A] text-white font-bold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="text-xs font-bold">2. Entrega ao Cliente</span>
                  <span className="font-mono text-[10px] opacity-90">
                    Cliente · PIN {activeMission.deliveryPin}
                  </span>
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  PIN esperado:{' '}
                  <strong className="font-mono text-foreground">
                    {otpStage === 'pickup'
                      ? activeMission.pickupPin
                      : activeMission.deliveryPin}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setOtpDigits(
                      (otpStage === 'pickup'
                        ? activeMission.pickupPin
                        : activeMission.deliveryPin) || '2437'
                    )
                  }
                  className="rounded-lg bg-primary px-2.5 py-1 font-mono text-[11px] font-bold text-primary-foreground cursor-pointer"
                >
                  Preencher PIN
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2.5">
                {[0, 1, 2, 3].map((slot) => {
                  const char = otpDigits[slot] || '';
                  return (
                    <div
                      key={slot}
                      className={`flex h-14 items-center justify-center rounded-xl border-2 font-mono text-2xl font-black tabular-nums ${
                        char
                          ? 'border-primary bg-primary/5 text-foreground'
                          : 'border-border bg-muted/30 text-muted-foreground'
                      }`}
                    >
                      {char || '•'}
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handleKeypadDigit(digit)}
                    className="flex h-12 items-center justify-center rounded-xl border border-border bg-muted/40 font-mono text-lg font-bold text-foreground hover:bg-secondary cursor-pointer"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleKeypadClear}
                  className="flex h-12 items-center justify-center rounded-xl border border-border bg-card text-xs font-bold text-muted-foreground hover:bg-muted cursor-pointer"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadDigit('0')}
                  className="flex h-12 items-center justify-center rounded-xl border border-border bg-muted/40 font-mono text-lg font-bold text-foreground hover:bg-secondary cursor-pointer"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleKeypadBackspace}
                  className="flex h-12 items-center justify-center rounded-xl border border-border bg-card text-foreground hover:bg-muted cursor-pointer"
                >
                  <Delete className="size-5" />
                </button>
              </div>

              <button
                type="button"
                disabled={verifyingOtp}
                onClick={() => handleConfirmHandoverSubmit('PIN_OTP')}
                className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm cursor-pointer ${
                  otpStage === 'pickup' ? 'bg-[#D97706]' : 'bg-[#16A34A]'
                }`}
              >
                <PackageCheck className="size-5 shrink-0" />
                <span>
                  {verifyingOtp
                    ? 'A validar...'
                    : otpStage === 'pickup'
                      ? `Confirmar Recolha por PIN`
                      : `Confirmar Entrega Final por PIN`}
                </span>
              </button>

              <button
                type="button"
                disabled={verifyingOtp}
                onClick={() => handleConfirmHandoverSubmit('QR_CODE')}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#7C3AED] px-4 py-2.5 text-xs font-bold text-white shadow-sm cursor-pointer"
              >
                <QrCode className="size-4 shrink-0" />
                <span>
                  Validar via QR Code (
                  {otpStage === 'pickup'
                    ? activeMission.pickupQrToken
                    : activeMission.deliveryQrToken}
                  )
                </span>
              </button>

              {/* Chamadas Rápidas no Ecrã de PIN/QR Code caso haja dúvida no código */}
              <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() =>
                    handleStartDriverCall(
                      'BANCA',
                      `${activeMission.bancaCode} · ${activeMission.bancaName}`,
                      '+244 923 814 008',
                      'Ponto de Recolha · Praça dos Correios'
                    )
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#D97706] px-3 py-2 text-xs font-bold text-white hover:opacity-90 cursor-pointer"
                >
                  <PhoneCall className="size-3.5" />
                  <span>Ligar à Banca</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleStartDriverCall(
                      'CLIENTE',
                      activeMission.customerName,
                      activeMission.customerPhone,
                      `Comprador · ${activeMission.destinationAddress}`
                    )
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#16A34A] px-3 py-2 text-xs font-bold text-white hover:opacity-90 cursor-pointer"
                >
                  <PhoneCall className="size-3.5" />
                  <span>Ligar ao Cliente</span>
                </button>
              </div>
            </section>
          </div>
        )}

        {/* TAB 4: MINHAS ENTREGAS & HISTÓRICO DE EVENTOS GPS */}
        {tab === 'entregas' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#16A34A] bg-[#16A34A] p-4 text-white">
                <span className="text-xs font-bold uppercase">Ganhos do Turno Hoje</span>
                <p className="mt-1 font-mono text-2xl font-black tabular-nums">
                  {formatKz(driverEarningsTodayKz)}
                </p>
                <p className="mt-1 text-xs text-white/90">Liquidação automática Multicaixa</p>
              </div>

              <div className="rounded-2xl border border-[#7C3AED] bg-[#7C3AED] p-4 text-white">
                <span className="text-xs font-bold uppercase">Entregas Concluídas</span>
                <p className="mt-1 font-mono text-2xl font-black tabular-nums">
                  {driverDeliveriesToday} entregas
                </p>
                <p className="mt-1 text-xs text-white/90">100% validadas com PIN / QR Code</p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4">
                <span className="text-xs font-bold uppercase text-muted-foreground">
                  Log de Eventos GPS
                </span>
                <p className="mt-1 font-mono text-2xl font-black text-foreground">
                  {missionEvents.length} eventos
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  Geofencing 120m + Transições Automáticas
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <h2 className="text-base font-bold text-foreground">
                Histórico Auditado de Eventos GPS & Transições de Estado
              </h2>
              <div className="space-y-2">
                {missionEvents.slice(0, 12).map((ev) => (
                  <div
                    key={ev.eventCode}
                    className="flex flex-col justify-between gap-2 rounded-xl border border-border bg-muted/30 p-3 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-primary px-2 py-0.5 font-mono text-[10px] font-bold text-primary-foreground">
                          {ev.orderCode}
                        </span>
                        <span className="rounded bg-[#7C3AED] px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                          {ev.previousState ? `${ev.previousState} → ` : ''}
                          {ev.newState}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          Método: {ev.verificationMethod} · GPS ({ev.lat}, {ev.lng})
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-medium text-foreground">
                        {ev.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <KitingoDeliveryRatingCenter
              mode="driver"
              orderCode={activeMission.orderCode}
              customerName={activeMission.customerName}
              customerPhone={activeMission.customerPhone}
              driverCode={activeDriverCode}
              driverName={activeDriverName}
              bancaCode={activeMission.bancaCode}
              bancaName={activeMission.bancaName}
              deliveryPin={activeMission.deliveryPin || '2437'}
              isDeliveredInitial={activeMission.missionState === 'DELIVERY_CONFIRMED'}
            />

            <KitingoTicketCenter
              role="estafeta"
              reporterName={`${activeDriverName} (${activeDriverCode})`}
              reporterPhone={activeDriverPhone}
              defaultOrderCode={activeMission.orderCode}
              defaultBancaCode={activeMission.bancaCode}
              defaultBancaName={activeMission.bancaName}
              defaultCustomerName={activeMission.customerName}
              defaultCustomerPhone={activeMission.customerPhone}
            />
          </div>
        )}

        {/* TAB 5: TICKETS & SUPORTE BACK-OFFICE DO ESTAFETA */}
        {tab === 'tickets' && (
          <div className="space-y-4">
            <KitingoDeliveryRatingCenter
              mode="driver"
              orderCode={activeMission.orderCode}
              customerName={activeMission.customerName}
              customerPhone={activeMission.customerPhone}
              driverCode={activeDriverCode}
              driverName={activeDriverName}
              bancaCode={activeMission.bancaCode}
              bancaName={activeMission.bancaName}
              deliveryPin={activeMission.deliveryPin || '2437'}
              isDeliveredInitial={activeMission.missionState === 'DELIVERY_CONFIRMED'}
            />
            <KitingoTicketCenter
              role="estafeta"
              reporterName={`${activeDriverName} (${activeDriverCode})`}
              reporterPhone={activeDriverPhone}
              defaultOrderCode={activeMission.orderCode}
              defaultBancaCode={activeMission.bancaCode}
              defaultBancaName={activeMission.bancaName}
              defaultCustomerName={activeMission.customerName}
              defaultCustomerPhone={activeMission.customerPhone}
            />
          </div>
        )}
      </main>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav
        aria-label="Navegação da App do Estafeta"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex max-w-lg">
          {(
            [
              { id: 'navegacao', label: 'Navegação GPS', icon: Navigation },
              { id: 'recolha', label: 'Recolha & Amostra', icon: ClipboardCheck },
              { id: 'otp', label: 'PIN & QR Code', icon: QrCode },
              { id: 'tickets', label: 'Tickets Suporte', icon: Headphones },
              { id: 'entregas', label: 'Histórico & Rotas', icon: Package },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const isActive = tab === id;
            return (
              <li key={id} className="flex flex-1">
                <button
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'text-primary font-semibold'
                      : 'text-muted-foreground hover:text-primary'
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-accent"
                    />
                  )}
                  <Icon className="size-5" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ZOOMED REFERENCE SAMPLE PHOTO MODAL */}
      {zoomedPhotoUrl && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setZoomedPhotoUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-md overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">
                Inspeção Visual · Amostra do Cliente (#{activeTask.orderCode})
              </span>
              <button
                type="button"
                onClick={() => setZoomedPhotoUrl(null)}
                className="rounded-full bg-muted p-1 text-foreground hover:bg-secondary cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
            <img
              src={zoomedPhotoUrl}
              alt="Amostra ampliada"
              referrerPolicy="no-referrer"
              className="max-h-[65vh] w-full rounded-xl object-contain bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
}
