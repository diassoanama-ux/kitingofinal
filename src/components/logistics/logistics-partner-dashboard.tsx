import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bike,
  Building2,
  CheckCircle2,
  DollarSign,
  FileCheck2,
  FileText,
  MessageSquare,
  Mic,
  MicOff,
  PackageCheck,
  Phone,
  PhoneCall,
  PhoneOff,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  UserPlus,
  Users,
  Volume2,
  Wallet,
  X,
} from 'lucide-react';
import { formatKz } from '@/lib/products';
import { getSimulatedVoiceReply, kitingoCallAudio } from '../../lib/kitingo-call-audio';
import type { LogisticsDriverRecord, LogisticsSettlementRecord } from './logistics-module';
import { KitingoDeliveryRatingCenter } from '../reviews/kitingo-delivery-rating-center';

interface LogisticsPartnerDashboardProps {
  partnerAdminName?: string | null;
  partnerAdminEmail?: string | null;
}

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

export function LogisticsPartnerDashboard({
  partnerAdminName = 'Direção de Operações · Frota Luanda',
  partnerAdminEmail = 'logistica@kitingo.ao',
}: LogisticsPartnerDashboardProps) {
  const [partnerTab, setPartnerTab] = useState<'drivers' | 'settlements'>('drivers');
  const [drivers, setDrivers] = useState<LogisticsDriverRecord[]>([]);
  const [settlements, setSettlements] = useState<LogisticsSettlementRecord[]>([]);
  const [metrics, setMetrics] = useState({
    activeDriversCount: 4,
    totalDriversCount: 5,
    deliveriesCompletedToday: 43,
    accumulatedEarningsKz: 1938500,
    otpSuccessRate: '99.4%',
  });
  const [loadingData, setLoadingData] = useState(true);
  const [toastNotice, setToastNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [driverSearchQuery, setDriverSearchQuery] = useState('');
  const [driverStatusFilter, setDriverStatusFilter] = useState<string>('todos');
  const [newDriverModalOpen, setNewDriverModalOpen] = useState(false);

  // "Cadastrar Novo Estafeta" form state
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [newDriverNif, setNewDriverNif] = useState('');
  const [newDriverVehicleType, setNewDriverVehicleType] = useState(
    'Motorizada 150cc · Caixa Térmica/Peças'
  );
  const [newDriverPlate, setNewDriverPlate] = useState('LD-64-11-AO');
  const [newDriverZone, setNewDriverZone] = useState(
    'Praça dos Correios → Maianga / Alvalade'
  );
  const [licenseDocName, setLicenseDocName] = useState<string>('Carta_Conducao_AO.pdf');
  const [idDocName, setIdDocName] = useState<string>('Bilhete_Identidade_Luanda.pdf');
  const [vehicleDocName, setVehicleDocName] = useState<string>('Livrete_Seguro_Viatura.pdf');
  const [savingDriver, setSavingDriver] = useState(false);

  // Interactive Fleet Partner -> Driver Call State
  const [partnerCall, setPartnerCall] = useState<{
    driverCode: string;
    fullName: string;
    phone: string;
    vehiclePlate: string;
    zone: string;
  } | null>(null);
  const [callPhase, setCallPhase] = useState<'ringing' | 'connected'>('connected');
  const [callSeconds, setCallSeconds] = useState(0);
  const [callMuted, setCallMuted] = useState(false);
  const [callSpeaker, setCallSpeaker] = useState(true);
  const [callQuickNote, setCallQuickNote] = useState<string | null>(null);
  const [callReply, setCallReply] = useState<string | null>(null);

  useEffect(() => {
    if (!partnerCall) {
      setCallSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setCallSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [partnerCall]);

  const handleStartPartnerCall = (driver: {
    driverCode: string;
    fullName: string;
    phone: string;
    vehiclePlate: string;
    zone: string;
  }) => {
    setCallQuickNote(null);
    setCallReply(null);
    setCallSeconds(0);
    setCallMuted(false);
    setCallSpeaker(true);
    setCallPhase('ringing');
    setPartnerCall(driver);

    kitingoCallAudio.playDialAndConnectSound(() => {
      setCallPhase('connected');
      setCallReply(getSimulatedVoiceReply('ESTAFETA'));
    });
  };

  const handleEndPartnerCall = () => {
    kitingoCallAudio.playHangupTone();
    setPartnerCall(null);
    setCallQuickNote(null);
    setCallReply(null);
  };

  const formatCallTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const fetchLogisticsData = useCallback(async () => {
    setLoadingData(true);
    try {
      const res = await fetch('/api/logistics/overview');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.drivers)) setDrivers(data.drivers);
        if (Array.isArray(data.settlements)) setSettlements(data.settlements);
        if (data.metrics) setMetrics(data.metrics);
      }
    } catch {
      // Non-blocking fallback
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    fetchLogisticsData();
  }, [fetchLogisticsData]);

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
        d.zone.toLowerCase().includes(q)
      );
    });
  }, [drivers, driverStatusFilter, driverSearchQuery]);

  async function handleRegisterNewDriverSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newDriverName.trim() || !newDriverPhone.trim() || !newDriverPlate.trim()) {
      setToastNotice({
        type: 'error',
        message: 'Preencha o nome completo, telemóvel (+244) e matrícula da viatura.',
      });
      return;
    }

    setSavingDriver(true);
    setToastNotice(null);

    try {
      const res = await fetch('/api/logistics/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: newDriverName,
          phone: newDriverPhone,
          nif: newDriverNif || undefined,
          vehicleType: newDriverVehicleType,
          vehiclePlate: newDriverPlate,
          zone: newDriverZone,
          licenseDocUrl: `/docs/drivers/${licenseDocName}`,
          idDocUrl: `/docs/drivers/${idDocName}`,
          vehicleDocUrl: `/docs/drivers/${vehicleDocName}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToastNotice({
          type: 'error',
          message: data.error || 'Não foi possível registar o novo estafeta.',
        });
        return;
      }

      if (data.driver) {
        setDrivers((prev) => [data.driver, ...prev]);
        setMetrics((prev) => ({
          ...prev,
          activeDriversCount: prev.activeDriversCount + 1,
          totalDriversCount: prev.totalDriversCount + 1,
        }));
      }

      setNewDriverModalOpen(false);
      setNewDriverName('');
      setNewDriverPhone('');
      setNewDriverNif('');
      setToastNotice({
        type: 'success',
        message: `Estafeta ${data.driver?.driverCode ?? ''} (${data.driver?.fullName ?? newDriverName}) credenciado com sucesso na frota Kitingo!`,
      });
    } catch {
      setToastNotice({
        type: 'error',
        message: 'Erro de comunicação ao cadastrar novo estafeta.',
      });
    } finally {
      setSavingDriver(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-14">
      {/* Standalone Logistics Partner Enterprise Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-card shadow-xs">
        <div className="mx-auto max-w-7xl px-4 py-3.5 md:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-mono text-sm font-black shadow-xs">
                KT
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 font-mono text-xs font-bold text-primary-foreground">
                    FROTA-LUANDA
                  </span>
                  <h1 className="text-base font-extrabold tracking-tight text-foreground sm:text-lg">
                    Painel da Empresa de Estafetas · Kitingo Logística
                  </h1>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#16A34A] px-2.5 py-0.5 text-[11px] font-bold text-white">
                    <span className="size-2 rounded-full bg-white animate-pulse" />
                    CENTRAL DE DESPACHO ATIVA
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  O Mercado dos Correios no Telemóvel · Operador:{' '}
                  <strong className="text-foreground">{partnerAdminName}</strong> (
                  <span className="font-mono">{partnerAdminEmail}</span>)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleStartPartnerCall(
                    drivers[0] || {
                      driverCode: 'EST-019',
                      fullName: 'Paulo Sebastião',
                      phone: '+244 931 880 210',
                      vehiclePlate: 'LD-44-92-AO',
                      zone: 'Praça dos Correios → Maianga',
                    }
                  )
                }
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#D97706] px-4 py-2 text-xs font-bold text-white shadow-xs hover:opacity-90 transition-opacity cursor-pointer"
              >
                <PhoneCall className="size-4" />
                <span>Ligar Estafeta em Turno</span>
              </button>

              <button
                type="button"
                onClick={() => setNewDriverModalOpen(true)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2 text-xs font-bold text-white shadow-xs hover:opacity-90 transition-opacity cursor-pointer"
              >
                <UserPlus className="size-4" />
                <span>Cadastrar Novo Estafeta</span>
              </button>

              <button
                type="button"
                onClick={fetchLogisticsData}
                disabled={loadingData}
                title="Sincronizar frota e liquidações"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <RefreshCw className={`size-4 ${loadingData ? 'animate-spin' : ''}`} />
                <span>Atualizar Frota</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-5 md:px-6 space-y-5">
        {/* Interactive Voice Call Panel (Central de Frota -> Estafeta) */}
        {partnerCall && (
          <div
            role="dialog"
            aria-label={`Chamada em curso com ${partnerCall.fullName}`}
            className="rounded-2xl border-2 border-[#16A34A] bg-slate-900 p-4 text-white shadow-xl space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#16A34A] text-white animate-pulse">
                  <PhoneCall className="size-5" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-white/15 px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider text-amber-300">
                      {callPhase === 'ringing'
                        ? 'A CHAMAR ESTAFETA...'
                        : `CHAMADA CONECTADA · ${formatCallTime(callSeconds)}`}
                    </span>
                    <span className="text-xs text-slate-300">
                      Viatura {partnerCall.vehiclePlate} · {partnerCall.zone}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-black text-white">
                    {partnerCall.fullName} ({partnerCall.driverCode})
                  </p>
                  <p className="font-mono text-xs text-emerald-400">{partnerCall.phone}</p>
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
                      setCallReply(getSimulatedVoiceReply('ESTAFETA'));
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3 py-2 text-xs font-bold text-white hover:opacity-90 cursor-pointer"
                >
                  <Phone className="size-3.5" />
                  <span>Rediscar</span>
                </button>

                <button
                  type="button"
                  onClick={handleEndPartnerCall}
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
                <span>Transmitir instrução operacional da Central de Frota:</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Dirija-se imediatamente à Praça dos Correios para nova recolha prioritária.',
                  'Confirme a validação do PIN OTP de 4 dígitos junto da banca.',
                  'Mantenha o GPS ativo durante todo o percurso até ao comprador.',
                ].map((msgText) => (
                  <button
                    key={msgText}
                    type="button"
                    onClick={() => {
                      kitingoCallAudio.playMessageSentBeep();
                      setCallQuickNote(msgText);
                      setCallReply(getSimulatedVoiceReply('ESTAFETA', msgText));
                    }}
                    className="rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-1.5 text-left text-[11px] font-semibold text-slate-200 hover:border-amber-500/50 hover:text-white transition cursor-pointer"
                  >
                    “{msgText}”
                  </button>
                ))}
              </div>
              {callQuickNote && (
                <p className="mt-2 text-xs font-bold text-emerald-400">
                  ✓ Instrução transmitida ao estafeta: “{callQuickNote}”
                </p>
              )}
            </div>
          </div>
        )}
        {/* Global Status Toast */}
        {toastNotice && (
          <div
            role="status"
            className={`flex items-start justify-between gap-3 rounded-2xl border p-4 shadow-sm ${
              toastNotice.type === 'success'
                ? 'border-[#16A34A] bg-[#16A34A] text-white'
                : 'border-[#DC2626] bg-[#DC2626] text-white'
            }`}
          >
            <div className="flex items-start gap-2.5 text-xs sm:text-sm font-medium">
              {toastNotice.type === 'success' ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 size-5 shrink-0" />
              )}
              <span>{toastNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastNotice(null)}
              className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/25 cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Top 4 Metrics Cards */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* KPI 1: Active Drivers */}
          <div className="rounded-2xl border border-[#16A34A] bg-[#16A34A] p-4 text-white shadow-sm">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase">
                <Bike className="size-4" />
                Estafetas Ativos
              </span>
              <span className="rounded-md bg-white/20 px-2 py-0.5 font-mono text-[11px] font-bold">
                GPS Online
              </span>
            </div>
            <p className="mt-2 font-mono text-3xl font-black tabular-nums">
              {metrics.activeDriversCount}{' '}
              <span className="text-base font-semibold text-white/80">
                / {metrics.totalDriversCount}
              </span>
            </p>
            <p className="mt-1.5 text-xs text-white/90">
              Posicionados na Praça dos Correios & Corredores
            </p>
          </div>

          {/* KPI 2: Deliveries Completed Today */}
          <div className="rounded-2xl border border-[#7C3AED] bg-[#7C3AED] p-4 text-white shadow-sm">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase">
                <PackageCheck className="size-4" />
                Entregas Concluídas Hoje
              </span>
              <span className="rounded-md bg-white/20 px-2 py-0.5 font-mono text-[11px] font-bold">
                Luanda
              </span>
            </div>
            <p className="mt-2 font-mono text-3xl font-black tabular-nums">
              {metrics.deliveriesCompletedToday}
            </p>
            <p className="mt-1.5 text-xs text-white/90">
              Tempo médio de entrega: 27 min
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

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="size-4 text-primary" />
            <span>Parceiro Oficial: <strong className="text-foreground">Expresso Correios Luanda Lda.</strong></span>
          </div>
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
                    <th className="px-3.5 py-3 text-right">Contacto / Voz</th>
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
                      <td className="px-3.5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleStartPartnerCall(driver)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 cursor-pointer whitespace-nowrap"
                        >
                          <PhoneCall className="size-3.5" />
                          <span>Ligar ao Estafeta</span>
                        </button>
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
                      <span>
                        {z.weeklyDeliveries} entregas · Tempo médio {z.avgTime}
                      </span>
                      <strong className="font-mono text-[#16A34A]">
                        {formatKz(z.weeklyTotalKz)}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            </section>

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

        {/* Confirmação de Receção & Avaliação dos Estafetas da Frota e Peças */}
        <KitingoDeliveryRatingCenter
          mode="driver"
          orderCode="CE-650018"
          driverCode={drivers[0]?.driverCode || 'EST-019'}
          driverName={drivers[0]?.fullName || 'Paulo Sebastião'}
        />
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
                      <span>
                        1. Carta de Condução: <strong>{licenseDocName}</strong>
                      </span>
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
                      <span>
                        2. Bilhete de Identidade / NIF: <strong>{idDocName}</strong>
                      </span>
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
                      <span>
                        3. Livrete & Seguro Viatura: <strong>{vehicleDocName}</strong>
                      </span>
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
    </div>
  );
}
