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
  Award,
  Bike,
  Building2,
  Camera,
  CheckCircle2,
  CheckSquare,
  Clock,
  Compass,
  Delete,
  DollarSign,
  FileCheck2,
  FileText,
  KeyRound,
  MapPin,
  Navigation,
  PackageCheck,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Square,
  Store,
  Truck,
  Upload,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { formatKz } from '@/lib/products';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface LogisticsDriverRecord {
  id: number;
  driverCode: string;
  fullName: string;
  phone: string;
  nif: string | null;
  vehicleType: string;
  vehiclePlate: string;
  zone: string;
  status: 'em_rota' | 'disponivel' | 'offline' | string;
  deliveriesToday: number;
  otpSuccessRate: string;
  licenseDocUrl: string | null;
  idDocUrl: string | null;
  vehicleDocUrl: string | null;
  createdAt: string;
}

export interface LogisticsSettlementRecord {
  id: number;
  settlementCode: string;
  periodLabel: string;
  deliveriesCount: number;
  grossOrderVolumeKz: number;
  transportFeeTotalKz: number;
  escrowBonusKz: number;
  netPartnerPayoutKz: number;
  bankReference: string;
  status: 'liquidado' | 'em_processamento' | string;
  createdAt: string;
}

export interface DriverDeliveryTask {
  orderCode: string;
  bancaCode: string;
  bancaName: string;
  bancaSector: string;
  customerName: string;
  customerPhone: string;
  destinationAddress: string;
  destinationCoords: LatLngPoint;
  vehicleModel: string;
  partSummary: string;
  partCondition: 'nova' | 'recondicionada';
  referencePhotos: string[];
  orderAmountKz: number;
  transportFeeKz: number;
  pickupOtp: string;
  deliveryOtp: string;
  status: string;
}

interface LogisticsModuleProps {
  initialSubView?: 'driver_app' | 'partner_dashboard';
  authenticatedDriverName?: string | null;
  authenticatedDriverPhone?: string | null;
}

const PRACA_DOS_CORREIOS_ORIGIN: LatLngPoint = {
  lat: -8.8147,
  lng: 13.2302,
};

const TURN_BY_TURN_STEPS = [
  {
    step: 1,
    instruction: 'Saída da Praça dos Correios · Siga pela Rua da Missão (180m)',
    street: 'Rua da Missão · Ingombota',
    distance: '0.2 km',
    maneuver: 'Partida da Banca',
  },
  {
    step: 2,
    instruction: 'Vire à direita para o Largo da Mutamba / Rua Amílcar Cabral',
    street: 'Largo da Mutamba',
    distance: '0.7 km',
    maneuver: 'Virar à direita',
  },
  {
    step: 3,
    instruction: 'Continue em frente pela Avenida Ho Chi Minh (Faixa Prioritária)',
    street: 'Avenida Ho Chi Minh',
    distance: '1.4 km',
    maneuver: 'Seguir em frente',
  },
  {
    step: 4,
    instruction: 'Desça pela Avenida Revolução de Outubro (Hospital Militar)',
    street: 'Avenida Revolução de Outubro',
    distance: '2.1 km',
    maneuver: 'Manter à esquerda',
  },
  {
    step: 5,
    instruction: 'Chegada ao cliente no Largo da Maianga · Confirme o OTP de 4 dígitos',
    street: 'Largo da Maianga, Luanda',
    distance: '2.6 km',
    maneuver: 'Destino à direita',
  },
];

const ZONE_TARIFF_BREAKDOWN = [
  {
    zone: 'Zona 1 · Centro Urbano (Ingombota, Maianga, Alvalade, Maculusso)',
    baseFeeKz: 3500,
    avgTime: '22 min',
    weeklyDeliveries: 68,
    weeklyTotalKz: 238000,
  },
  {
    zone: 'Zona 2 · Corredor Intermédio (Rangel, Vila Alice, Samba, Rocha Pinto)',
    baseFeeKz: 4500,
    avgTime: '31 min',
    weeklyDeliveries: 46,
    weeklyTotalKz: 207000,
  },
  {
    zone: 'Zona 3 · Expansão & Sul (Talatona, Morro Bento, Kilamba, Viana)',
    baseFeeKz: 6500,
    avgTime: '45 min',
    weeklyDeliveries: 34,
    weeklyTotalKz: 221000,
  },
];

type MapPolylineInstance = {
  setMap: (map: unknown) => void;
  setOptions: (opts: Record<string, unknown>) => void;
};

function DriverNavigationRouteLayer({
  origin,
  destination,
  waypoints,
}: {
  origin: LatLngPoint;
  destination: LatLngPoint;
  waypoints: LatLngPoint[];
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

    async function drawRoute() {
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
            origin,
            destination,
            travelMode: 'DRIVING',
            fields: ['path'],
          });
          if (!cancelled && response?.routes?.[0]?.createPolylines) {
            const routePolylines = response.routes[0].createPolylines();
            routePolylines.forEach((p: MapPolylineInstance) => {
              p.setOptions({
                strokeColor: '#16A34A',
                strokeOpacity: 0.92,
                strokeWeight: 5,
              });
              p.setMap(map);
            });
            polylinesRef.current = routePolylines;
            return;
          }
        } catch {
          // Fallback to corridor waypoints polyline below
        }
      }

      if (cancelled || !mapsLib) return;
      const PolylineCtor = (mapsLib as unknown as {
        Polyline: new (opts: Record<string, unknown>) => MapPolylineInstance;
      }).Polyline;

      const fallbackLine = new PolylineCtor({
        path: waypoints.length >= 2 ? waypoints : [origin, destination],
        geodesic: true,
        strokeColor: '#16A34A',
        strokeOpacity: 0.92,
        strokeWeight: 5,
        map,
      });
      polylinesRef.current = [fallbackLine];
    }

    drawRoute();

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, routesLib, mapsLib, origin, destination, waypoints]);

  return null;
}

export function LogisticsModule({
  initialSubView = 'driver_app',
  authenticatedDriverName,
  authenticatedDriverPhone,
}: LogisticsModuleProps) {
  const [subView, setSubView] = useState<'driver_app' | 'partner_dashboard'>(initialSubView);
  const [partnerTab, setPartnerTab] = useState<'drivers' | 'settlements'>('drivers');

  // Data from Backend
  const [drivers, setDrivers] = useState<LogisticsDriverRecord[]>([]);
  const [settlements, setSettlements] = useState<LogisticsSettlementRecord[]>([]);
  const [tasks, setTasks] = useState<DriverDeliveryTask[]>([]);
  const [metrics, setMetrics] = useState({
    activeDriversCount: 5,
    totalDriversCount: 5,
    deliveriesTodayCount: 31,
    accumulatedEarningsKz: 2231400,
    otpSuccessRate: '99.4%',
  });
  const [loading, setLoading] = useState<boolean>(true);

  // Driver App State
  const [selectedTaskIndex, setSelectedTaskIndex] = useState<number>(0);
  const [visualSampleConfirmed, setVisualSampleConfirmed] = useState<boolean>(false);
  const [otpStage, setOtpStage] = useState<'pickup' | 'delivery'>('pickup');
  const [otpDigits, setOtpDigits] = useState<string>('');
  const [verifyingOtp, setVerifyingOtp] = useState<boolean>(false);
  const [navStepIndex, setNavStepIndex] = useState<number>(1);
  const [zoomedPhotoUrl, setZoomedPhotoUrl] = useState<string | null>(null);

  // Partner Dashboard State
  const [driverSearchQuery, setDriverSearchQuery] = useState<string>('');
  const [driverStatusFilter, setDriverStatusFilter] = useState<string>('todos');
  const [newDriverModalOpen, setNewDriverModalOpen] = useState<boolean>(false);

  // "Cadastrar Novo Estafeta" Modal Form State
  const [newDriverName, setNewDriverName] = useState<string>('');
  const [newDriverPhone, setNewDriverPhone] = useState<string>('923 841 205');
  const [newDriverNif, setNewDriverNif] = useState<string>('');
  const [newDriverVehicleType, setNewDriverVehicleType] = useState<string>(
    'Motorizada 150cc · Caixa Térmica/Peças'
  );
  const [newDriverPlate, setNewDriverPlate] = useState<string>('LD-72-19-AO');
  const [newDriverZone, setNewDriverZone] = useState<string>(
    'Praça dos Correios → Maianga / Alvalade'
  );
  const [licenseDocName, setLicenseDocName] = useState<string>('Carta_Conducao_Profissional.pdf');
  const [idDocName, setIdDocName] = useState<string>('Bilhete_Identidade_NIF.pdf');
  const [vehicleDocName, setVehicleDocName] = useState<string>('Livrete_Seguro_Motorizada.pdf');
  const [savingDriver, setSavingDriver] = useState<boolean>(false);

  // Toast Notification
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const apiKey = (
    (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_GOOGLE_MAPS_API_KEY || ''
  ).trim();

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  }, []);

  const fetchLogisticsData = useCallback(async () => {
    try {
      const res = await fetch('/api/logistics/overview');
      const data = await res.json();
      if (data && data.ok) {
        setDrivers(data.drivers || []);
        setSettlements(data.settlements || []);
        setTasks(data.tasks || []);
        if (data.metrics) {
          setMetrics(data.metrics);
        }
      }
    } catch {
      // Keep existing state on transient error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogisticsData();
  }, [fetchLogisticsData]);

  // Listen to WebSocket updates for live logistics events
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(wsUrl);
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (
            payload.type === 'logistics:driver_added' ||
            payload.type === 'logistics:pickup_verified' ||
            payload.type === 'logistics:delivery_verified' ||
            payload.type === 'payout:created'
          ) {
            fetchLogisticsData();
          }
        } catch {
          // ignore
        }
      };
    } catch {
      // ignore
    }

    return () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [fetchLogisticsData]);

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
        'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=600&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=600&auto=format&fit=crop&q=80',
      ],
      orderAmountKz: 97900,
      transportFeeKz: 4500,
      pickupOtp: '0018',
      deliveryOtp: '2437',
      status: 'aguarda_recolha',
    };
  }, [tasks, selectedTaskIndex]);

  // Compute simulated live driver coordinates along the corridor from Praça dos Correios to Customer
  const corridorWaypoints = useMemo<LatLngPoint[]>(() => {
    const dest = activeTask.destinationCoords;
    return [
      PRACA_DOS_CORREIOS_ORIGIN,
      { lat: -8.8175, lng: 13.2321 },
      { lat: -8.8212, lng: 13.2355 },
      { lat: -8.8256, lng: 13.2359 },
      dest,
    ];
  }, [activeTask]);

  const currentDriverCoords = useMemo<LatLngPoint>(() => {
    const idx = Math.min(navStepIndex, corridorWaypoints.length - 1);
    return corridorWaypoints[idx] || PRACA_DOS_CORREIOS_ORIGIN;
  }, [navStepIndex, corridorWaypoints]);

  // Keypad Handlers
  function handleKeypadDigit(digit: string) {
    setOtpDigits((prev) => (prev.length < 4 ? prev + digit : prev));
  }

  function handleKeypadBackspace() {
    setOtpDigits((prev) => prev.slice(0, -1));
  }

  function handleKeypadClear() {
    setOtpDigits('');
  }

  async function handleConfirmOtpSubmit() {
    if (otpStage === 'pickup' && !visualSampleConfirmed) {
      showToast(
        'error',
        'Confirme primeiro na caixa de verificação que a peça recolhida corresponde visualmente à amostra do cliente.'
      );
      return;
    }

    if (otpDigits.length !== 4) {
      showToast('error', 'Digite os 4 dígitos no teclado seguro OTP.');
      return;
    }

    setVerifyingOtp(true);
    try {
      const res = await fetch(
        `/api/logistics/tasks/${encodeURIComponent(activeTask.orderCode)}/verify-otp`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stage: otpStage,
            otpCode: otpDigits,
            visualSampleConfirmed,
            driverCode: 'EST-019',
            driverName: authenticatedDriverName || 'Paulo Sebastião',
            bancaCode: activeTask.bancaCode,
            bancaName: activeTask.bancaName,
            grossAmount: activeTask.orderAmountKz,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Código OTP incorreto.');
      }

      showToast('success', data.message);
      setOtpDigits('');
      if (otpStage === 'pickup') {
        setOtpStage('delivery');
        setNavStepIndex(2);
      } else {
        setNavStepIndex(4);
      }
      await fetchLogisticsData();
    } catch (err: any) {
      showToast('error', err.message || 'Erro ao validar código OTP.');
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function handleRegisterNewDriverSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newDriverName.trim() || !newDriverPhone.trim() || !newDriverPlate.trim()) {
      showToast('error', 'Preencha o nome, telemóvel (+244) e matrícula da viatura.');
      return;
    }

    setSavingDriver(true);
    try {
      const res = await fetch('/api/logistics/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: newDriverName.trim(),
          phone: newDriverPhone.trim(),
          nif: newDriverNif.trim() || null,
          vehicleType: newDriverVehicleType,
          vehiclePlate: newDriverPlate.trim().toUpperCase(),
          zone: newDriverZone,
          licenseDocUrl: licenseDocName,
          idDocUrl: idDocName,
          vehicleDocUrl: vehicleDocName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao registar novo estafeta.');
      }

      showToast(
        'success',
        `Estafeta ${data.driver.fullName} (${data.driver.driverCode}) cadastrado com documentação validada!`
      );
      setNewDriverName('');
      setNewDriverNif('');
      setNewDriverModalOpen(false);
      await fetchLogisticsData();
    } catch (err: any) {
      showToast('error', err.message || 'Erro ao guardar novo estafeta.');
    } finally {
      setSavingDriver(false);
    }
  }

  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      if (driverStatusFilter !== 'todos' && d.status !== driverStatusFilter) {
        return false;
      }
      if (!driverSearchQuery.trim()) return true;
      const q = driverSearchQuery.toLowerCase();
      return (
        d.fullName.toLowerCase().includes(q) ||
        d.driverCode.toLowerCase().includes(q) ||
        d.vehiclePlate.toLowerCase().includes(q) ||
        d.phone.toLowerCase().includes(q)
      );
    });
  }, [drivers, driverStatusFilter, driverSearchQuery]);

  return (
    <div className="min-h-dvh bg-background text-foreground pb-20">
      {/* TOP LOGISTICS HEADER & MODULE SWITCHER (App do Estafeta vs Painel da Empresa de Estafetas) */}
      <header className="sticky top-0 z-30 bg-primary text-primary-foreground shadow-md">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
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
                  Kitingo <span className="text-brand-accent">Logística</span>
                </p>
                <span className="rounded-md bg-[#16A34A] px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                  GPS & OTP Ativos
                </span>
              </div>
              <p className="text-xs text-primary-foreground/80">
                O Mercado dos Correios no Telemóvel · Operação Praça dos Correios ↔ Luanda
              </p>
            </div>
          </div>

          {/* Switcher: [1. App do Estafeta] | [2. Painel da Empresa de Estafetas] */}
          <div
            role="tablist"
            aria-label="Módulos Logísticos Kitingo"
            className="grid grid-cols-2 gap-1.5 rounded-xl bg-primary-foreground/10 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={subView === 'driver_app'}
              onClick={() => setSubView('driver_app')}
              className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                subView === 'driver_app'
                  ? 'bg-brand-accent text-brand-accent-foreground shadow-xs'
                  : 'text-primary-foreground/85 hover:bg-primary-foreground/10'
              }`}
            >
              <Bike className="size-4 shrink-0" />
              <span>App do Estafeta</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={subView === 'partner_dashboard'}
              onClick={() => setSubView('partner_dashboard')}
              className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                subView === 'partner_dashboard'
                  ? 'bg-brand-accent text-brand-accent-foreground shadow-xs'
                  : 'text-primary-foreground/85 hover:bg-primary-foreground/10'
              }`}
            >
              <Building2 className="size-4 shrink-0" />
              <span>Painel Empresa Frota</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-4">
        {/* Feedback Toast */}
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
              className="text-[11px] underline opacity-90 hover:opacity-100"
            >
              OK
            </button>
          </div>
        )}

        {/* ===========================================================================
            1. DELIVERY DRIVER APP (APP DO ESTAFETA)
        =========================================================================== */}
        {subView === 'driver_app' && (
          <div className="flex flex-col gap-4">
            {/* Driver Identity & Active Task Selector Bar */}
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#16A34A] text-white">
                  <Bike className="size-6" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-primary px-2 py-0.5 font-mono text-xs font-bold text-primary-foreground">
                      #EST-019
                    </span>
                    <h1 className="text-base font-bold text-foreground">
                      {authenticatedDriverName || 'Paulo Sebastião'}
                    </h1>
                    <span className="rounded-md bg-[#16A34A]/15 px-2 py-0.5 text-[11px] font-bold text-[#16A34A]">
                      Motorizada 150cc · LD-44-92-AO
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Telemóvel: {authenticatedDriverPhone || '+244 931 880 210'} · Base: Praça dos Correios
                  </p>
                </div>
              </div>

              {/* Active Task Picker */}
              <div className="flex items-center gap-2">
                <label
                  htmlFor="active-driver-task"
                  className="text-xs font-bold text-muted-foreground whitespace-nowrap"
                >
                  Tarefa Ativa:
                </label>
                <select
                  id="active-driver-task"
                  value={selectedTaskIndex}
                  onChange={(e) => {
                    setSelectedTaskIndex(Number(e.target.value));
                    setOtpDigits('');
                  }}
                  className="h-10 rounded-xl border border-input bg-background px-3 font-mono text-xs font-bold text-foreground focus:border-primary focus:outline-none"
                >
                  {tasks.map((t, idx) => (
                    <option key={t.orderCode} value={idx}>
                      #{t.orderCode} · {t.bancaCode} → {t.destinationAddress} ({formatKz(t.transportFeeKz)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              {/* LEFT COLUMN (7 cols): ACTIVE PICKUP TASK + VISUAL CROSS-CHECK ("AMOSTRA DE REFERÊNCIA") + TURN-BY-TURN LIVE GPS */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                {/* Active Pickup Task Card & Visual Sample Cross-Check */}
                <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                    <div>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#7C3AED]">
                        <Camera className="size-4" />
                        Verificação Visual Obrigatória na Banca
                      </span>
                      <h2 className="mt-0.5 text-lg font-bold text-foreground">
                        Tarefa #{activeTask.orderCode} · Amostra de Referência do Cliente
                      </h2>
                    </div>

                    <div className="rounded-xl bg-[#16A34A] px-3 py-1.5 text-right text-white">
                      <span className="block text-[10px] uppercase font-semibold opacity-90">
                        Ganho do Estafeta
                      </span>
                      <span className="font-mono text-sm font-black tabular-nums">
                        +{formatKz(activeTask.transportFeeKz)}
                      </span>
                    </div>
                  </div>

                  {/* Origin Banca -> Destination Customer Route Summary */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border bg-muted/40 p-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                        <Store className="size-4 text-[#D97706]" />
                        <span>1. Ponto de Recolha (Praça dos Correios)</span>
                      </div>
                      <p className="mt-1 text-sm font-bold text-foreground">
                        {activeTask.bancaCode} · {activeTask.bancaName}
                      </p>
                      <p className="text-xs text-muted-foreground">{activeTask.bancaSector}</p>
                    </div>

                    <div className="rounded-xl border border-border bg-muted/40 p-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#16A34A]">
                        <MapPin className="size-4 text-[#16A34A]" />
                        <span>2. Ponto de Entrega (Cliente)</span>
                      </div>
                      <p className="mt-1 text-sm font-bold text-foreground">
                        {activeTask.customerName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activeTask.destinationAddress} · {activeTask.customerPhone}
                      </p>
                    </div>
                  </div>

                  {/* Part Details & Condition Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs">
                    <div>
                      <span className="text-muted-foreground">Peça Encomendada: </span>
                      <strong className="font-bold text-foreground">{activeTask.partSummary}</strong>
                      <span className="ml-2 text-muted-foreground">
                        ({activeTask.vehicleModel})
                      </span>
                    </div>
                    {activeTask.partCondition === 'nova' ? (
                      <span className="rounded-md bg-[#16A34A] px-2 py-0.5 text-[11px] font-bold text-white">
                        🆕 Peça Nova (Na Caixa)
                      </span>
                    ) : (
                      <span className="rounded-md bg-[#D97706] px-2 py-0.5 text-[11px] font-bold text-white">
                        🔄 Ocasião · Garantia 72h
                      </span>
                    )}
                  </div>

                  {/* Thumbnail Photos of the Client's Old Part ("Amostra de Referência") */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-bold text-foreground">
                        Fotografias da Peça Antiga do Cliente ("Amostra de Referência"):
                      </p>
                      <span className="text-[11px] text-muted-foreground">
                        Toque numa foto para ampliar e comparar na bancada
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

                  {/* Driver Verification Checkbox */}
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
                        Verifiquei furação, polia/encaixe e selo de garantia da {activeTask.bancaName}{' '}
                        antes de introduzir o código OTP de recolha.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Turn-by-Turn Live GPS Navigation Map */}
                <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                  {/* Turn-by-Turn Active Maneuver Banner */}
                  <div className="bg-primary px-4 py-3.5 text-primary-foreground">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#16A34A] text-white">
                          <Navigation className="size-5" />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-brand-accent px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand-accent-foreground uppercase">
                              Passo {TURN_BY_TURN_STEPS[navStepIndex]?.step || 1} de{' '}
                              {TURN_BY_TURN_STEPS.length}
                            </span>
                            <span className="font-mono text-xs text-primary-foreground/80">
                              {TURN_BY_TURN_STEPS[navStepIndex]?.distance} ·{' '}
                              {TURN_BY_TURN_STEPS[navStepIndex]?.maneuver}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm font-bold text-white">
                            {TURN_BY_TURN_STEPS[navStepIndex]?.instruction}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setNavStepIndex((prev) =>
                              prev > 0 ? prev - 1 : TURN_BY_TURN_STEPS.length - 1
                            )
                          }
                          className="rounded-lg bg-primary-foreground/15 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-primary-foreground/25 cursor-pointer"
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setNavStepIndex((prev) => (prev + 1) % TURN_BY_TURN_STEPS.length)
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-brand-accent px-2.5 py-1.5 text-xs font-bold text-brand-accent-foreground hover:bg-brand-accent/90 cursor-pointer"
                        >
                          <span>Próxima Curva</span>
                          <ArrowRight className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Google Map Container */}
                  <div className="relative h-[300px] w-full bg-muted">
                    {apiKey ? (
                      <APIProvider apiKey={apiKey}>
                        <GoogleMap
                          defaultCenter={{ lat: -8.8225, lng: 13.2332 }}
                          defaultZoom={14}
                          mapId="DEMO_MAP_ID"
                          gestureHandling="greedy"
                          disableDefaultUI={false}
                          className="h-full w-full"
                        >
                          <DriverNavigationRouteLayer
                            origin={PRACA_DOS_CORREIOS_ORIGIN}
                            destination={activeTask.destinationCoords}
                            waypoints={corridorWaypoints}
                          />

                          {/* Origin Banca Marker (Praça dos Correios) */}
                          <AdvancedMarker
                            position={PRACA_DOS_CORREIOS_ORIGIN}
                            title={`Origem: ${activeTask.bancaName}`}
                          >
                            <div className="flex items-center gap-1 rounded-full border-2 border-white bg-[#D97706] px-2.5 py-1 text-[11px] font-bold text-white shadow-md">
                              <Store className="size-3.5" />
                              <span>{activeTask.bancaCode}</span>
                            </div>
                          </AdvancedMarker>

                          {/* Live Driver Position Marker */}
                          <AdvancedMarker
                            position={currentDriverCoords}
                            title="A sua posição GPS (Estafeta)"
                          >
                            <div className="flex items-center gap-1 rounded-full border-2 border-white bg-[#16A34A] px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
                              <Bike className="size-3.5" />
                              <span>Estafeta GPS</span>
                            </div>
                          </AdvancedMarker>

                          {/* Destination Customer Marker */}
                          <AdvancedMarker
                            position={activeTask.destinationCoords}
                            title={`Cliente: ${activeTask.customerName}`}
                          >
                            <div className="flex items-center gap-1 rounded-full border-2 border-white bg-primary px-2.5 py-1 text-[11px] font-bold text-white shadow-md">
                              <MapPin className="size-3.5 text-brand-accent" />
                              <span>Cliente</span>
                            </div>
                          </AdvancedMarker>
                        </GoogleMap>
                      </APIProvider>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                        <Compass className="size-8 text-primary" />
                        <p className="mt-2 text-sm font-bold text-foreground">
                          Mapa GPS Turn-by-Turn · Praça dos Correios → {activeTask.destinationAddress}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Turn-by-Turn Route Steps List */}
                  <div className="divide-y divide-border p-3">
                    {TURN_BY_TURN_STEPS.map((s, idx) => {
                      const isCurrent = idx === navStepIndex;
                      const isPassed = idx < navStepIndex;
                      return (
                        <button
                          key={s.step}
                          type="button"
                          onClick={() => setNavStepIndex(idx)}
                          className={`flex w-full items-center justify-between gap-3 px-2.5 py-2 text-left text-xs transition-colors rounded-lg cursor-pointer ${
                            isCurrent
                              ? 'bg-[#16A34A]/10 font-bold text-foreground'
                              : isPassed
                                ? 'text-muted-foreground line-through opacity-75'
                                : 'text-foreground hover:bg-muted/60'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold ${
                                isCurrent
                                  ? 'bg-[#16A34A] text-white'
                                  : isPassed
                                    ? 'bg-muted text-muted-foreground'
                                    : 'bg-primary/10 text-primary'
                              }`}
                            >
                              {s.step}
                            </span>
                            <span>{s.instruction}</span>
                          </div>
                          <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                            {s.distance}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>

              {/* RIGHT COLUMN (5 cols): 4-DIGIT OTP SECURE KEYPAD FOR PICKUP & FINAL HANDOVER */}
              <div className="lg:col-span-5">
                <section className="sticky top-20 rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
                  <div className="border-b border-border pb-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                      <KeyRound className="size-4 text-brand-accent" />
                      Validação de Custódia por PIN/OTP
                    </span>
                    <h2 className="mt-0.5 text-lg font-bold text-foreground">
                      Teclado Seguro OTP (4 Dígitos)
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Valide primeiro o OTP de recolha na banca e, à chegada, o OTP final do cliente.
                    </p>
                  </div>

                  {/* Stage Selector: [1. Recolha na Banca] vs [2. Entrega ao Cliente] */}
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
                        {activeTask.bancaCode} · OTP {activeTask.pickupOtp}
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
                        Cliente · OTP {activeTask.deliveryOtp}
                      </span>
                    </button>
                  </div>

                  {/* Quick Pre-fill Helper Bar */}
                  <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">
                      Código esperado ({otpStage === 'pickup' ? 'Banca' : 'Cliente'}):{' '}
                      <strong className="font-mono text-foreground">
                        {otpStage === 'pickup' ? activeTask.pickupOtp : activeTask.deliveryOtp}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setOtpDigits(
                          otpStage === 'pickup' ? activeTask.pickupOtp : activeTask.deliveryOtp
                        )
                      }
                      className="rounded-lg bg-primary px-2.5 py-1 font-mono text-[11px] font-bold text-primary-foreground hover:opacity-90 cursor-pointer"
                    >
                      Preencher OTP
                    </button>
                  </div>

                  {/* 4-Digit Display Boxes */}
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

                  {/* Numeric Keypad Grid (1-9, Clear, 0, Backspace) */}
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

                  {/* Submit OTP Button */}
                  <button
                    type="button"
                    disabled={verifyingOtp}
                    onClick={handleConfirmOtpSubmit}
                    className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-50 cursor-pointer ${
                      otpStage === 'pickup' ? 'bg-[#D97706]' : 'bg-[#16A34A]'
                    }`}
                  >
                    <PackageCheck className="size-5 shrink-0" />
                    <span>
                      {verifyingOtp
                        ? 'A validar OTP...'
                        : otpStage === 'pickup'
                          ? `Confirmar Recolha na ${activeTask.bancaCode}`
                          : `Confirmar Entrega Final (+${formatKz(activeTask.transportFeeKz)})`}
                    </span>
                  </button>

                  <div className="rounded-xl border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
                    <p className="font-semibold text-foreground">
                      Protocolo de Custódia Kitingo ("Zero Fiado"):
                    </p>
                    <p className="mt-0.5">
                      • Na recolha, o OTP liberta os 90% da venda para a carteira da banca.
                      <br />• Na entrega final, o OTP do cliente credita o frete ({formatKz(activeTask.transportFeeKz)}) na conta da frota.
                    </p>
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}

        {/* ===========================================================================
            2. LOGISTICS PARTNER DASHBOARD (PAINEL DA EMPRESA DE ESTAFETAS)
        =========================================================================== */}
        {subView === 'partner_dashboard' && (
          <div className="flex flex-col gap-5">
            {/* Top Metrics Cards (4 KPIs) */}
            <section
              aria-label="Indicadores da Empresa de Estafetas"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              {/* KPI 1: Active Drivers */}
              <div className="rounded-2xl border border-[#16A34A] bg-[#16A34A] p-4 text-white shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase">
                    <Users className="size-4" />
                    Estafetas Ativos
                  </span>
                  <span className="rounded-md bg-white/20 px-2 py-0.5 font-mono text-[11px] font-bold">
                    Frota Luanda
                  </span>
                </div>
                <p className="mt-2 font-mono text-3xl font-black tabular-nums">
                  {metrics.activeDriversCount}{' '}
                  <span className="text-base font-normal text-white/85">
                    / {metrics.totalDriversCount}
                  </span>
                </p>
                <p className="mt-1.5 text-xs text-white/90">
                  Rastreio GPS ativo na Praça dos Correios
                </p>
              </div>

              {/* KPI 2: Deliveries Completed Today */}
              <div className="rounded-2xl border border-[#7C3AED] bg-[#7C3AED] p-4 text-white shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase">
                    <Truck className="size-4" />
                    Entregas Concluídas Hoje
                  </span>
                  <span className="rounded-md bg-white/20 px-2 py-0.5 font-mono text-[11px] font-bold">
                    SLA 26 min
                  </span>
                </div>
                <p className="mt-2 font-mono text-3xl font-black tabular-nums">
                  {metrics.deliveriesTodayCount}
                </p>
                <p className="mt-1.5 text-xs text-white/90">
                  Peças entregues com verificação visual
                </p>
              </div>

              {/* KPI 3: Accumulated Delivery Earnings (AOA) */}
              <div className="rounded-2xl border border-[#D97706] bg-[#D97706] p-4 text-white shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase">
                    <Wallet className="size-4" />
                    Faturação Acumulada
                  </span>
                  <span className="rounded-md bg-white/20 px-2 py-0.5 font-mono text-[11px] font-bold">
                    AOA / Kz
                  </span>
                </div>
                <p className="mt-2 font-mono text-2xl sm:text-3xl font-black tabular-nums">
                  {formatKz(metrics.accumulatedEarningsKz)}
                </p>
                <p className="mt-1.5 text-xs text-white/90">
                  Fretes + Bónus de Custódia Escrow
                </p>
              </div>

              {/* KPI 4: OTP Success Rate */}
              <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase text-primary">
                    <ShieldCheck className="size-4 text-[#16A34A]" />
                    Taxa de Sucesso OTP
                  </span>
                  <span className="rounded-md bg-[#16A34A]/15 px-2 py-0.5 font-mono text-[11px] font-bold text-[#16A34A]">
                    Zero Extravios
                  </span>
                </div>
                <p className="mt-2 font-mono text-3xl font-black text-foreground tabular-nums">
                  {metrics.otpSuccessRate}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Dupla validação (Recolha Banca + Cliente)
                </p>
              </div>
            </section>

            {/* Partner Dashboard Tabs: [Gestão de Estafetas] vs [Liquidações Financeiras] */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 shadow-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPartnerTab('drivers')}
                  className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                    partnerTab === 'drivers'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground hover:bg-secondary'
                  }`}
                >
                  <Users className="size-4" />
                  <span>Gestão de Estafetas ({drivers.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPartnerTab('settlements')}
                  className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                    partnerTab === 'settlements'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground hover:bg-secondary'
                  }`}
                >
                  <DollarSign className="size-4" />
                  <span>Liquidações Financeiras ({settlements.length})</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setNewDriverModalOpen(true)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-xs hover:opacity-90 transition-opacity cursor-pointer"
              >
                <UserPlus className="size-4" />
                <span>Cadastrar Novo Estafeta</span>
              </button>
            </div>

            {/* TAB 1: DRIVER MANAGEMENT TABLE */}
            {partnerTab === 'drivers' && (
              <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">
                      Frota de Estafetas Credenciados · Luanda
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Controlo de matrículas, estado GPS em tempo real, entregas do dia e documentação verificada.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="search"
                        value={driverSearchQuery}
                        onChange={(e) => setDriverSearchQuery(e.target.value)}
                        placeholder="Nome, código ou matrícula…"
                        className="h-10 rounded-xl border border-input bg-background pr-3 pl-9 text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                    </div>

                    <select
                      value={driverStatusFilter}
                      onChange={(e) => setDriverStatusFilter(e.target.value)}
                      className="h-10 rounded-xl border border-input bg-background px-3 text-xs font-bold text-foreground focus:border-primary focus:outline-none"
                    >
                      <option value="todos">Todos os Estados</option>
                      <option value="em_rota">Em Rota (GPS Ativo)</option>
                      <option value="disponivel">Disponível na Praça</option>
                      <option value="offline">Offline</option>
                    </select>
                  </div>
                </div>

                {/* Responsive Driver Table */}
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border bg-muted/60 text-[11px] font-bold uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3.5 py-3">ID / Estafeta</th>
                        <th className="px-3.5 py-3">Estado</th>
                        <th className="px-3.5 py-3">Viatura & Matrícula</th>
                        <th className="px-3.5 py-3">Corredor Luanda</th>
                        <th className="px-3.5 py-3 text-center">Entregas Hoje</th>
                        <th className="px-3.5 py-3 text-center">Sucesso OTP</th>
                        <th className="px-3.5 py-3">Documentação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredDrivers.map((driver) => (
                        <tr key={driver.driverCode} className="hover:bg-muted/30">
                          <td className="px-3.5 py-3">
                            <div className="flex items-center gap-2.5">
                              <span className="rounded-md bg-primary px-2 py-0.5 font-mono text-[11px] font-bold text-primary-foreground">
                                {driver.driverCode}
                              </span>
                              <div>
                                <p className="font-bold text-foreground">{driver.fullName}</p>
                                <p className="font-mono text-[11px] text-muted-foreground">
                                  {driver.phone}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3.5 py-3">
                            {driver.status === 'em_rota' ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-[#16A34A] px-2 py-0.5 text-[11px] font-bold text-white">
                                <span className="size-1.5 rounded-full bg-white animate-pulse" />
                                Em Rota · GPS
                              </span>
                            ) : driver.status === 'disponivel' ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-[#D97706] px-2 py-0.5 text-[11px] font-bold text-white">
                                Disponível Praça
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-[#64748B] px-2 py-0.5 text-[11px] font-bold text-white">
                                Offline
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-3">
                            <p className="font-semibold text-foreground">{driver.vehicleType}</p>
                            <span className="mt-0.5 inline-block rounded bg-accent px-1.5 py-0.5 font-mono text-[11px] font-bold text-accent-foreground">
                              {driver.vehiclePlate}
                            </span>
                          </td>
                          <td className="px-3.5 py-3 text-muted-foreground">{driver.zone}</td>
                          <td className="px-3.5 py-3 text-center font-mono text-sm font-black text-foreground">
                            {driver.deliveriesToday}
                          </td>
                          <td className="px-3.5 py-3 text-center">
                            <span className="rounded-md bg-[#16A34A]/15 px-2 py-0.5 font-mono text-xs font-bold text-[#16A34A]">
                              {driver.otpSuccessRate}
                            </span>
                          </td>
                          <td className="px-3.5 py-3">
                            <div className="flex flex-wrap gap-1">
                              <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                                <FileCheck2 className="size-3 text-[#16A34A]" />
                                Carta
                              </span>
                              <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                                <FileCheck2 className="size-3 text-[#16A34A]" />
                                BI/NIF
                              </span>
                              <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                                <FileCheck2 className="size-3 text-[#16A34A]" />
                                Livrete
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* TAB 2: FINANCIAL SETTLEMENTS & WEEKLY TRANSPORT FEE BREAKDOWN */}
            {partnerTab === 'settlements' && (
              <div className="flex flex-col gap-4">
                {/* Weekly Transport Fee Breakdown by Luanda Zone */}
                <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-foreground">
                        Tabela Semanal de Fretes por Zona Logística (Luanda)
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Repartição das taxas de transporte a partir da Praça dos Correios liquidadas via Escrow EMIS Multicaixa.
                      </p>
                    </div>
                    <span className="rounded-xl bg-[#16A34A]/15 px-3 py-1.5 font-mono text-xs font-bold text-[#16A34A]">
                      Comissão Logística + Frete 100% Garantido
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {ZONE_TARIFF_BREAKDOWN.map((z) => (
                      <div
                        key={z.zone}
                        className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-2"
                      >
                        <p className="text-xs font-bold text-foreground">{z.zone}</p>
                        <div className="flex items-baseline justify-between">
                          <span className="text-[11px] text-muted-foreground">
                            Tarifa Base / Entrega:
                          </span>
                          <span className="font-mono text-sm font-black text-primary">
                            {formatKz(z.baseFeeKz)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border pt-2">
                          <span>{z.weeklyDeliveries} entregas · Tempo médio {z.avgTime}</span>
                          <strong className="font-mono text-[#16A34A]">
                            {formatKz(z.weeklyTotalKz)}
                          </strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Payout History from Kitingo */}
                <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-foreground">
                        Histórico de Liquidações Financeiras Kitingo → Empresa de Estafetas
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Transferências semanais automáticas via EMIS Multicaixa / IBAN Empresarial.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {settlements.map((s) => (
                      <div
                        key={s.settlementCode}
                        className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-primary px-2 py-0.5 font-mono text-xs font-bold text-primary-foreground">
                              {s.settlementCode}
                            </span>
                            <span className="text-sm font-bold text-foreground">
                              {s.periodLabel}
                            </span>
                            {s.status === 'liquidado' ? (
                              <span className="rounded-md bg-[#16A34A] px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                                Liquidado
                              </span>
                            ) : (
                              <span className="rounded-md bg-[#D97706] px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                                Em Processamento
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {s.deliveriesCount} entregas validadas por OTP · Volume Bruto de Peças:{' '}
                            <strong className="font-mono text-foreground">
                              {formatKz(s.grossOrderVolumeKz)}
                            </strong>
                          </p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            Ref. Bancária: {s.bankReference}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-2 sm:border-t-0 sm:pt-0">
                          <div className="text-right">
                            <span className="block text-[10px] uppercase text-muted-foreground">
                              Fretes Base
                            </span>
                            <span className="font-mono text-xs font-bold text-foreground">
                              {formatKz(s.transportFeeTotalKz)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="block text-[10px] uppercase text-muted-foreground">
                              Bónus SLA OTP
                            </span>
                            <span className="font-mono text-xs font-bold text-[#7C3AED]">
                              +{formatKz(s.escrowBonusKz)}
                            </span>
                          </div>
                          <div className="rounded-xl bg-[#16A34A] px-3.5 py-2 text-right text-white">
                            <span className="block text-[10px] font-bold uppercase text-white/90">
                              Total Recebido (AOA)
                            </span>
                            <span className="font-mono text-sm font-black tabular-nums">
                              {formatKz(s.netPartnerPayoutKz)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL: "CADASTRAR NOVO ESTAFETA" WITH DOCUMENT UPLOADS */}
      {newDriverModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-new-driver-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#16A34A]">
                  Credenciação Oficial · Frota Kitingo Luanda
                </span>
                <h2 id="modal-new-driver-title" className="text-lg font-bold text-foreground">
                  Cadastrar Novo Estafeta
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setNewDriverModalOpen(false)}
                className="flex size-8 items-center justify-center rounded-full bg-muted text-foreground hover:bg-secondary cursor-pointer"
                aria-label="Fechar janela"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleRegisterNewDriverSubmit} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">
                    Nome Completo do Estafeta *
                  </label>
                  <input
                    type="text"
                    value={newDriverName}
                    onChange={(e) => setNewDriverName(e.target.value)}
                    placeholder="Ex: Domingos Manuel Sebastião"
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">
                    Telemóvel (+244) *
                  </label>
                  <input
                    type="tel"
                    value={newDriverPhone}
                    onChange={(e) => setNewDriverPhone(e.target.value)}
                    placeholder="923 841 205"
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">
                    Bilhete de Identidade / NIF
                  </label>
                  <input
                    type="text"
                    value={newDriverNif}
                    onChange={(e) => setNewDriverNif(e.target.value)}
                    placeholder="Ex: 005819204LA042"
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">
                    Matrícula (Luanda) *
                  </label>
                  <input
                    type="text"
                    value={newDriverPlate}
                    onChange={(e) => setNewDriverPlate(e.target.value.toUpperCase())}
                    placeholder="LD-72-19-AO"
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 font-mono text-xs font-bold text-foreground focus:border-primary focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">
                    Tipo de Viatura
                  </label>
                  <select
                    value={newDriverVehicleType}
                    onChange={(e) => setNewDriverVehicleType(e.target.value)}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="Motorizada 150cc · Caixa Térmica/Peças">
                      Motorizada 150cc · Caixa de Peças
                    </option>
                    <option value="Motorizada 200cc · Suporte Reforçado">
                      Motorizada 200cc · Suporte Reforçado
                    </option>
                    <option value="Triciclo de Carga Pesada (Motores/Caixas)">
                      Triciclo de Carga Pesada (Motores)
                    </option>
                    <option value="Carrinha Ligeira · Toyota Hiace Cargo">
                      Carrinha Ligeira · Hiace Cargo
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">
                    Corredor de Entrega Principal
                  </label>
                  <select
                    value={newDriverZone}
                    onChange={(e) => setNewDriverZone(e.target.value)}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="Praça dos Correios → Maianga / Alvalade">
                      Praça dos Correios → Maianga / Alvalade
                    </option>
                    <option value="Praça dos Correios → Ingombota / Maculusso">
                      Praça dos Correios → Ingombota / Maculusso
                    </option>
                    <option value="Praça dos Correios → Talatona / Morro Bento">
                      Praça dos Correios → Talatona / Morro Bento
                    </option>
                    <option value="Praça dos Correios → Viana / Zango / Kilamba">
                      Praça dos Correios → Viana / Kilamba
                    </option>
                  </select>
                </div>
              </div>

              {/* Document Uploads Section */}
              <div className="rounded-xl border border-border bg-muted/40 p-3.5 space-y-2.5">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Upload className="size-4 text-[#7C3AED]" />
                  Upload de Documentos Obrigatórios (PDF / Imagem)
                </p>

                <div className="grid grid-cols-1 gap-2">
                  <label className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs cursor-pointer hover:bg-muted/50">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <FileText className="size-4 text-[#16A34A]" />
                      <span>1. Carta de Condução: <strong>{licenseDocName}</strong></span>
                    </span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setLicenseDocName(f.name);
                      }}
                      className="hidden"
                    />
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      Substituir
                    </span>
                  </label>

                  <label className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs cursor-pointer hover:bg-muted/50">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <FileText className="size-4 text-[#16A34A]" />
                      <span>2. Bilhete de Identidade / NIF: <strong>{idDocName}</strong></span>
                    </span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setIdDocName(f.name);
                      }}
                      className="hidden"
                    />
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      Substituir
                    </span>
                  </label>

                  <label className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs cursor-pointer hover:bg-muted/50">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <FileText className="size-4 text-[#16A34A]" />
                      <span>3. Livrete & Seguro Viatura: <strong>{vehicleDocName}</strong></span>
                    </span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setVehicleDocName(f.name);
                      }}
                      className="hidden"
                    />
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      Substituir
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewDriverModalOpen(false)}
                  className="rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold text-foreground hover:bg-muted cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingDriver}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-4 py-2.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  <UserPlus className="size-4" />
                  <span>{savingDriver ? 'A registar...' : 'Concluir Cadastro & Ativar GPS'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
              className="max-h-[65vh] w-full rounded-xl object-contain bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
}
