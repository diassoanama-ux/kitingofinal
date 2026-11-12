import React, { useEffect, useRef, useState } from 'react';
import {
  Bike,
  CheckCircle2,
  KeyRound,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  Navigation,
  Phone,
  PhoneCall,
  PhoneOff,
  Radio,
  Send,
  Store,
  User,
  Volume2,
} from 'lucide-react';
import {
  getSimulatedVoiceReply,
  kitingoCallAudio,
} from '../../lib/kitingo-call-audio';

export interface KitingoLiveNavigationProps {
  deliveryId: string;
  userRole: 'DRIVER' | 'CUSTOMER';
  initialPickup?: { lat: number; lng: number; label?: string };
  initialDestination?: { lat: number; lng: number; label?: string };
  initialStatus?: string;
  initialDriverLocation?: { lat: number; lng: number };
  initialEta?: string;
  expectedPickupOtp?: string;
  secureDeliveryPin?: string;
  bancaName?: string;
  bancaPhone?: string;
  driverName?: string;
  driverPhone?: string;
  customerName?: string;
  customerPhone?: string;
  onStatusChanged?: (nextStatus: string) => void;
}

export default function KitingoLiveNavigation({
  deliveryId,
  userRole,
  initialPickup = { lat: -8.8147, lng: 13.2302, label: 'Praça dos Correios · Banca #08' },
  initialDestination = { lat: -8.8295, lng: 13.2348, label: 'Largo da Maianga, Luanda' },
  initialStatus = 'GOING_TO_PICKUP',
  initialDriverLocation = { lat: -8.839988, lng: 13.289437 },
  initialEta = '12 min',
  expectedPickupOtp = '0018',
  secureDeliveryPin = '4892',
  bancaName = 'Banca #08 - Peças do Zé',
  bancaPhone = '+244 923 814 008',
  driverName = 'Paulo Sebastião (#EST-019)',
  driverPhone = '+244 931 880 210',
  customerName = 'João Manuel Baptista',
  customerPhone = '+244 924 514 042',
  onStatusChanged,
}: KitingoLiveNavigationProps) {
  const [deliveryStatus, setDeliveryStatus] = useState(initialStatus);
  const [driverLocation, setDriverLocation] = useState(initialDriverLocation);
  const [eta, setEta] = useState(initialEta);
  const [otpInput, setOtpInput] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bannerAlert, setBannerAlert] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
  } | null>(null);

  // Estado da Chamada Telefónica Interativa (Banca, Estafeta ou Cliente)
  const [activeCall, setActiveCall] = useState<{
    target: 'BANCA' | 'ESTAFETA' | 'CLIENTE';
    name: string;
    phone: string;
    roleLabel: string;
  } | null>(null);
  const [callPhase, setCallPhase] = useState<'ringing' | 'connected'>('connected');
  const [callSeconds, setCallSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [quickNoteSent, setQuickNoteSent] = useState<string | null>(null);
  const [partyReply, setPartyReply] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const handleStartCall = (
    target: 'BANCA' | 'ESTAFETA' | 'CLIENTE',
    name: string,
    phone: string,
    roleLabel: string
  ) => {
    setQuickNoteSent(null);
    setPartyReply(null);
    setCallSeconds(0);
    setIsMuted(false);
    setIsSpeakerOn(true);
    setCallPhase('ringing');
    setActiveCall({ target, name, phone, roleLabel });

    kitingoCallAudio.playDialAndConnectSound(() => {
      setCallPhase('connected');
      setPartyReply(getSimulatedVoiceReply(target));
    });
  };

  const handleEndCall = () => {
    kitingoCallAudio.playHangupTone();
    setActiveCall(null);
    setQuickNoteSent(null);
    setPartyReply(null);
  };

  useEffect(() => {
    setDeliveryStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (
      initialDriverLocation &&
      Number.isFinite(initialDriverLocation.lat) &&
      Number.isFinite(initialDriverLocation.lng)
    ) {
      setDriverLocation(initialDriverLocation);
    }
  }, [initialDriverLocation.lat, initialDriverLocation.lng]);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mounted = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Conexão WebSocket para receber posições em tempo real (Estafeta <-> Cliente)
    const ws = new WebSocket(`${protocol}//${window.location.host}/tracking`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mounted) return;
      setWsConnected(true);
      ws.send(
        JSON.stringify({
          action: 'AUTH_TRACKING',
          deliveryId,
          role: userRole, // 'CUSTOMER' ou 'DRIVER'
        })
      );
    };

    ws.onmessage = (msg) => {
      if (!mounted) return;
      try {
        const data = JSON.parse(msg.data);
        if (data.event === 'DRIVER_LOCATION_UPDATE') {
          setDriverLocation({
            lat: Number(data.latitude),
            lng: Number(data.longitude),
          });
        } else if (data.event === 'DELIVERY_STATUS_UPDATE' && data.status) {
          setDeliveryStatus(String(data.status));
        } else if (data.type === 'delivery:completed') {
          setDeliveryStatus('DELIVERY_CONFIRMED');
          setEta('Entregue ✓');
        }
      } catch {
        // Ignorar mensagens não-JSON
      }
    };

    ws.onclose = () => {
      if (mounted) setWsConnected(false);
    };

    return () => {
      mounted = false;
      ws.close();
      wsRef.current = null;
    };
  }, [deliveryId, userRole]);

  // Emitir nova coordenada via WebSocket (UPDATE_DRIVER_LOCATION -> PostGIS ST_MakePoint)
  const handleTransmitDriverGps = () => {
    const target =
      deliveryStatus === 'GOING_TO_PICKUP' ? initialPickup : initialDestination;
    const nextLat = Number(
      (driverLocation.lat + (target.lat - driverLocation.lat) * 0.35).toFixed(6)
    );
    const nextLng = Number(
      (driverLocation.lng + (target.lng - driverLocation.lng) * 0.35).toFixed(6)
    );
    setDriverLocation({ lat: nextLat, lng: nextLng });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: 'UPDATE_DRIVER_LOCATION',
          deliveryId,
          role: 'DRIVER',
          latitude: nextLat,
          longitude: nextLng,
          heading: 145,
          speed: 38,
        })
      );
    }
  };

  // Função de transição automática de estado após confirmação de recolha (Regra 4)
  const handleConfirmPickup = async () => {
    const codeToVerify = otpInput.trim() || expectedPickupOtp;
    setSubmitting(true);
    setBannerAlert(null);
    try {
      const response = await fetch(
        `/api/deliveries/${encodeURIComponent(deliveryId)}/confirm-pickup`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp: codeToVerify }),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setDeliveryStatus('GOING_TO_DESTINATION');
        setEta('8 min');
        setBannerAlert({
          type: 'success',
          title: 'Sucesso',
          message:
            'Recolha confirmada! A rota foi atualizada para a morada do comprador.',
        });
        if (onStatusChanged) {
          onStatusChanged('GOING_TO_DESTINATION');
        }
      } else {
        setBannerAlert({
          type: 'error',
          title: 'Erro',
          message: data.error || `Código OTP inválido. (Dica: ${expectedPickupOtp})`,
        });
      }
    } catch (error) {
      console.error('Erro ao confirmar recolha:', error);
      setBannerAlert({
        type: 'error',
        title: 'Erro',
        message: 'Não foi possível comunicar com o servidor Kitingo.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Função de confirmação final de receção da peça (Comprador ou Estafeta)
  const handleConfirmDeliveryReception = async () => {
    setSubmitting(true);
    setBannerAlert(null);
    try {
      const response = await fetch(
        `/api/deliveries/${encodeURIComponent(deliveryId)}/confirm-delivery`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pinCode: otpInput.trim() || secureDeliveryPin,
            actorRole: userRole === 'CUSTOMER' ? 'cliente' : 'estafeta',
            customerName,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setDeliveryStatus('DELIVERY_CONFIRMED');
        setEta('Entregue ✓');
        setBannerAlert({
          type: 'success',
          title: 'Peça Entregue com Sucesso',
          message:
            'Receção confirmada! O estado foi atualizado em todas as plataformas (Cliente, Estafeta, Banca e Back-Office).',
        });
        if (onStatusChanged) {
          onStatusChanged('DELIVERY_CONFIRMED');
        }
      } else {
        setBannerAlert({
          type: 'error',
          title: 'Erro',
          message: data.error || `PIN de entrega inválido. (Dica: ${secureDeliveryPin})`,
        });
      }
    } catch {
      setBannerAlert({
        type: 'error',
        title: 'Erro',
        message: 'Falha ao confirmar a receção da peça.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formatCallTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const isGoingToPickup =
    deliveryStatus === 'GOING_TO_PICKUP' ||
    deliveryStatus === 'WAITING_FOR_DRIVER' ||
    deliveryStatus === 'DRIVER_ASSIGNED' ||
    deliveryStatus === 'ARRIVED_AT_PICKUP';
  const isDeliveredConfirmed = deliveryStatus === 'DELIVERY_CONFIRMED';

  return (
    <div className="rounded-2xl bg-black p-4 text-white border border-slate-800 shadow-lg space-y-3">
      {/* Cabeçalho de Estado Dinâmico */}
      <div className="rounded-xl bg-[#0F2942] p-4 border border-sky-900/60 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-black/35 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
              <Radio className="w-3 h-3 animate-pulse" />
              {wsConnected ? 'WSS /tracking CONECTADO' : 'A LIGAR SOCKET...'}
            </span>
            <span className="font-mono text-[11px] text-slate-300">
              ID: {deliveryId} · Perfil: {userRole}
            </span>
          </div>
          <p className="text-[#FFD700] text-base font-bold mt-1">
            {isDeliveredConfirmed
              ? '✅ Peça Entregue com Sucesso ao Comprador (Escrow Libertado)'
              : isGoingToPickup
                ? '🛵 A caminho da Banca (Praça dos Correios)'
                : '📦 A caminho do Cliente (Entrega)'}
          </p>
          <p className="text-white text-sm mt-0.5">
            {isDeliveredConfirmed ? (
              <strong className="text-emerald-400">
                Estado Sincronizado em Todas as Plataformas ✓
              </strong>
            ) : (
              <>
                Tempo Estimado (ETA): <strong>{eta}</strong>
              </>
            )}
          </p>
        </div>

        {userRole === 'DRIVER' && (
          <button
            type="button"
            onClick={handleTransmitDriverGps}
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-[#FFD700] border border-[#FFD700]/30 flex items-center gap-1.5 transition cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Transmitir GPS via Socket</span>
          </button>
        )}
      </div>

      {/* Central de Chamadas Rápidas:
          - Estafeta (DRIVER): Pode ligar para a Banca e para o Cliente.
          - Comprador (CUSTOMER): NUNCA tem contacto da Banca nem pode ligar para a Banca; liga apenas ao Estafeta. */}
      {userRole === 'DRIVER' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Card 1 (Apenas Estafeta): Ligar para a Banca */}
          <div className="rounded-xl bg-[#121212] border border-amber-500/40 p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#D97706]/20 border border-[#D97706] flex items-center justify-center text-[#FFD700] shrink-0">
                <Store className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block">
                  Banca · Praça dos Correios
                </span>
                <p className="text-xs font-bold text-white truncate">{bancaName}</p>
                <p className="font-mono text-[11px] text-neutral-400">{bancaPhone}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  handleStartCall(
                    'BANCA',
                    bancaName,
                    bancaPhone,
                    'Vendedor · Praça dos Correios'
                  )
                }
                className="px-3 py-2 rounded-xl bg-[#D97706] hover:bg-amber-600 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Ligar à Banca</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleStartCall(
                    'BANCA',
                    bancaName,
                    bancaPhone,
                    'Vendedor · Praça dos Correios'
                  )
                }
                title={`Ligar para ${bancaName} (${bancaPhone})`}
                className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-neutral-700 cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Card 2 (Apenas Estafeta): Ligar para o Cliente */}
          <div className="rounded-xl bg-[#121212] border border-emerald-500/40 p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#16A34A]/20 border border-[#16A34A] flex items-center justify-center text-emerald-400 shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
                  Cliente · Comprador
                </span>
                <p className="text-xs font-bold text-white truncate">{customerName}</p>
                <p className="font-mono text-[11px] text-neutral-400">{customerPhone}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  handleStartCall(
                    'CLIENTE',
                    customerName,
                    customerPhone,
                    'Comprador · Destino de Entrega'
                  )
                }
                className="px-3 py-2 rounded-xl bg-[#16A34A] hover:bg-emerald-600 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Ligar ao Cliente</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleStartCall(
                    'CLIENTE',
                    customerName,
                    customerPhone,
                    'Comprador · Destino de Entrega'
                  )
                }
                title={`Ligar para ${customerName} (${customerPhone})`}
                className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-emerald-400 border border-neutral-700 cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-[#121212] border border-emerald-500/40 p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#16A34A]/20 border border-[#16A34A] flex items-center justify-center text-emerald-400 shrink-0">
              <Bike className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
                Estafeta Designado · Contacto Direto de Entrega
              </span>
              <p className="text-xs font-bold text-white truncate">{driverName}</p>
              <p className="font-mono text-[11px] text-neutral-400">{driverPhone}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                handleStartCall(
                  'ESTAFETA',
                  driverName,
                  driverPhone,
                  'Estafeta Kitingo · Motorizada LD-44-92-AO'
                )
              }
              className="px-3 py-2 rounded-xl bg-[#16A34A] hover:bg-emerald-600 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Ligar ao Estafeta</span>
            </button>
            <button
              type="button"
              onClick={() =>
                handleStartCall(
                  'ESTAFETA',
                  driverName,
                  driverPhone,
                  'Estafeta Kitingo · Motorizada LD-44-92-AO'
                )
              }
              title={`Ligar para ${driverName} (${driverPhone})`}
              className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-emerald-400 border border-neutral-700 cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Painel Interativo de Chamada Voz Kitingo em Curso (Banca, Estafeta ou Cliente) */}
      {activeCall && (
        <div
          role="dialog"
          aria-label={`Chamada em curso com ${activeCall.name}`}
          className={`rounded-2xl p-4 border-2 shadow-xl space-y-3 ${
            activeCall.target === 'BANCA'
              ? 'bg-slate-950 border-[#D97706]'
              : 'bg-slate-950 border-[#16A34A]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white animate-pulse ${
                  activeCall.target === 'BANCA' ? 'bg-[#D97706]' : 'bg-[#16A34A]'
                }`}
              >
                <PhoneCall className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-white/15 text-[#FFD700]">
                    {callPhase === 'ringing'
                      ? 'A CHAMAR...'
                      : `CHAMADA CONECTADA · ${formatCallTime(callSeconds)}`}
                  </span>
                  <span className="text-xs text-slate-400">{activeCall.roleLabel}</span>
                </div>
                <p className="text-base font-black text-white mt-0.5">{activeCall.name}</p>
                <p className="font-mono text-xs text-emerald-400">{activeCall.phone}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIsMuted((prev) => !prev)}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                  isMuted
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                <span>{isMuted ? 'Microfone Off' : 'Microfone On'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSpeakerOn((prev) => !prev)}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                  isSpeakerOn
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>{isSpeakerOn ? 'Altifalante On' : 'Normal'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCallPhase('ringing');
                  setCallSeconds(0);
                  kitingoCallAudio.playDialAndConnectSound(() => {
                    setCallPhase('connected');
                    setPartyReply(getSimulatedVoiceReply(activeCall.target));
                  });
                }}
                className="px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Rediscar</span>
              </button>

              <button
                type="button"
                onClick={handleEndCall}
                className="px-3.5 py-2 rounded-xl bg-[#DC2626] hover:bg-red-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>Terminar</span>
              </button>
            </div>
          </div>

          {/* Resposta de Voz em Tempo Real do Interlocutor */}
          {partyReply && (
            <div className="rounded-xl bg-slate-900/90 border border-emerald-500/30 p-3 text-xs text-emerald-300 font-medium">
              🔊 {partyReply}
            </div>
          )}

          {/* Avisos Rápidos de Voz / SMS Operacional durante a chamada */}
          <div className="border-t border-slate-800 pt-2.5">
            <p className="text-[11px] font-bold text-slate-400 mb-2 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-[#FFD700]" />
              <span>Enviar aviso rápido operacional para {activeCall.name}:</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(activeCall.target === 'BANCA'
                ? [
                    'Estou na entrada da Praça dos Correios, qual é o corredor?',
                    'Cheguei à banca, tenho o código OTP pronto para recolha',
                    'Prepare a peça para conferência visual com a amostra',
                  ]
                : activeCall.target === 'ESTAFETA'
                  ? [
                      'Estou a aguardar no ponto de entrega com o PIN de 4 dígitos',
                      'Por favor ligue quando estiver a 2 minutos do local',
                      'Confirme se a peça na banca corresponde à amostra enviada',
                    ]
                  : [
                      'Já recolhi a peça na banca, estou a caminho do seu local',
                      'Estou a chegar ao endereço, prepare o PIN de 4 dígitos',
                      'Estou estacionado no ponto de encontro indicado no GPS',
                    ]
              ).map((msgText) => (
                <button
                  key={msgText}
                  type="button"
                  onClick={() => {
                    kitingoCallAudio.playMessageSentBeep();
                    setQuickNoteSent(msgText);
                    setPartyReply(getSimulatedVoiceReply(activeCall.target, msgText));
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] text-slate-200 font-medium transition cursor-pointer"
                >
                  "{msgText}"
                </button>
              ))}
            </div>
            {quickNoteSent && (
              <p className="mt-2 text-xs font-bold text-emerald-400">
                ✓ Aviso transmitido para {activeCall.name}: "{quickNoteSent}"
              </p>
            )}
          </div>
        </div>
      )}

      {/* Notificação In-App (Substitui Alert nativo) */}
      {bannerAlert && (
        <div
          role="alert"
          className={`rounded-xl p-3 text-xs font-bold flex items-center justify-between gap-2 ${
            bannerAlert.type === 'success'
              ? 'bg-[#16A34A] text-white'
              : 'bg-[#DC2626] text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              <strong>{bannerAlert.title}:</strong> {bannerAlert.message}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setBannerAlert(null)}
            className="underline text-[11px] opacity-90 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Telemetria Coordenadas em Tempo Real (Kitingo GPS Container) */}
      <div className="rounded-xl bg-[#1A1A1A] border border-neutral-800 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0F2942] flex items-center justify-center text-[#FFD700]">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-neutral-300">
              [ Mapa Interativo Kitingo GPS · PostGIS SRID 4326 ]
            </p>
            <p className="font-mono text-sm font-black text-[#FFD700]">
              Lat: {driverLocation.lat.toFixed(4)} | Lng: {driverLocation.lng.toFixed(4)}
            </p>
          </div>
        </div>

        <div className="text-xs text-neutral-400 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            {isGoingToPickup
              ? `Destino Etapa 1: ${initialPickup.label || 'Praça dos Correios'}`
              : `Destino Etapa 2: ${initialDestination.label || 'Morada do Comprador'}`}
          </span>
        </div>
      </div>

      {/* Painel de Ações Operacionais do Estafeta */}
      {userRole === 'DRIVER' && isGoingToPickup && (
        <div className="rounded-xl bg-[#121212] border border-neutral-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-white flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-[#FFD700]" />
              <span>Insira o OTP da Banca:</span>
            </label>
            <span className="font-mono text-xs text-neutral-400">
              OTP esperado da Banca: <strong className="text-[#FFD700]">{expectedPickupOtp}</strong>
            </span>
          </div>
          <input
            type="text"
            maxLength={4}
            value={otpInput}
            onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
            placeholder={expectedPickupOtp || '0000'}
            className="w-full p-3 text-lg font-mono font-black text-center rounded-lg bg-[#222222] text-white border border-[#444444] focus:border-[#FFD700] focus:outline-none tracking-widest"
          />
          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirmPickup}
            className="w-full bg-[#FFD700] hover:bg-amber-400 text-black font-black text-sm py-3.5 px-4 rounded-lg transition cursor-pointer disabled:opacity-50"
          >
            {submitting ? 'A Validar OTP na Banca...' : 'Confirmar Recolha da Peça'}
          </button>
        </div>
      )}

      {userRole === 'DRIVER' && !isGoingToPickup && (
        <div className="rounded-xl bg-[#121212] border border-emerald-800/60 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-emerald-400">
              {isDeliveredConfirmed
                ? '✓ Entrega Concluída com Sucesso ao Comprador'
                : 'Recolha na Banca Confirmada · Em Navegação até ao Comprador'}
            </p>
            <p className="text-xs text-neutral-400 mt-0.5">
              {isDeliveredConfirmed
                ? 'A peça foi entregue em mãos e validada com sucesso.'
                : `A rota foi comutada automaticamente para ${initialDestination.label || 'a morada do cliente'}.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isDeliveredConfirmed && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmDeliveryReception}
                className="rounded-lg bg-[#16A34A] px-3 py-2 text-xs font-black text-white hover:bg-emerald-600 cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'A Validar...' : 'Confirmar Entrega ao Cliente'}
              </button>
            )}
            <span className="font-mono text-xs font-black px-3 py-1.5 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-700">
              {isDeliveredConfirmed ? 'DELIVERY_CONFIRMED' : 'GOING_TO_DESTINATION'}
            </span>
          </div>
        </div>
      )}

      {/* Painel do Comprador */}
      {userRole === 'CUSTOMER' && (
        <div className="rounded-xl bg-[#121212] border border-neutral-800 p-4 text-center space-y-2.5">
          <p className="text-white text-sm font-medium">
            {isDeliveredConfirmed
              ? '✅ Receção confirmada! A sua peça auto foi entregue com sucesso.'
              : isGoingToPickup
                ? 'O estafeta está a recolher a sua peça na banca da Praça dos Correios.'
                : 'O seu estafeta está a caminho com a sua peça auto.'}
          </p>
          <p className="text-[#FFD700] text-base font-black tracking-wide">
            PIN de Entrega Segura: <span className="font-mono">{secureDeliveryPin}</span>
          </p>
          {!isDeliveredConfirmed && (
            <div className="pt-1">
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmDeliveryReception}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-5 py-2.5 text-xs font-black text-white hover:bg-emerald-600 transition cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'A Confirmar Receção...'
                    : 'Confirmar Receção da Peça em Mãos'}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
