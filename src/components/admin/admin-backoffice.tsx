import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BatteryCharging,
  Bike,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  Gauge,
  Headphones,
  KeyRound,
  Lock,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  Navigation,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  PhoneCall,
  PhoneOff,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Store,
  UserCheck,
  Users,
  Volume2,
  Wallet,
  X,
} from 'lucide-react';
import { formatKz } from '@/lib/products';
import {
  getSimulatedVoiceReply,
  kitingoCallAudio,
} from '../../lib/kitingo-call-audio.ts';
import {
  DELIVERY_STATE_META,
  type DeliveryMissionDto,
  type DeliveryTrackingEventDto,
} from '../../lib/kitingo-gps.ts';
import { KitingoModularNavigation } from '../logistics/kitingo-modular-navigation';
import { KitingoDeliveryRatingCenter } from '../reviews/kitingo-delivery-rating-center';

export type BackofficeRole = 'super_admin' | 'field_supervisor' | 'call_center';

interface RbacRoleDefinition {
  roleCode: BackofficeRole;
  label: string;
  staffId: string;
  staffName: string;
  permissions: string[];
}

interface FleetDriverTelemetry {
  id: number;
  driverCode: string;
  fullName: string;
  phone: string;
  nif: string | null;
  vehicleType: string;
  vehiclePlate: string;
  zone: string;
  status: 'em_rota' | 'disponivel' | 'offline' | string;
  speedKmh: number;
  batteryLevel: number;
  activeOrderCode: string | null;
  lat: string;
  lng: string;
  currentStreet: string;
  deliveriesToday: number;
  otpSuccessRate: string;
}

interface TicketChatMessage {
  id: string;
  sender: string;
  senderRole: string;
  text: string;
  timestamp: string;
}

interface SupportTicketRecord {
  id: number;
  ticketCode: string;
  customerName: string;
  customerPhone: string;
  orderCode: string | null;
  matchCode: string | null;
  bancaCode: string;
  bancaName: string;
  subject: string;
  priority: 'urgente' | 'alta' | 'normal' | string;
  status: 'aberto' | 'em_mediacao' | 'resolvido' | string;
  vehicleModel: string;
  clientSamplePhotoUrl: string;
  clientPartDescription: string;
  merchantOfferPhotoUrl: string;
  merchantOfferPartName: string;
  merchantOfferCondition: 'nova' | 'ocasiao' | string;
  merchantOfferPriceKz: number;
  chatMessages: TicketChatMessage[];
  assignedStaffId: string;
  createdAt: string;
}

interface BancaGovernanceRecord {
  id: number;
  bancaCode: string;
  ownerUid: string;
  ownerName: string | null;
  ownerPhone: string | null;
  bancaName: string;
  sector: string;
  nif: string | null;
  status: 'ativa' | 'suspensa' | 'bloqueada_fraude' | 'pendente' | string;
  fraudReason: string | null;
  createdAt: string;
}

interface FinancialSplitRecord {
  id: number;
  splitCode: string;
  orderCode: string;
  bancaCode: string;
  bancaName: string;
  bancaNif: string;
  bankName: 'BAI' | 'BCI' | string;
  ibanMasked: string;
  grossAmountKz: number;
  merchantNetKz: number;
  platformFeeKz: number;
  logisticsFeeKz: number;
  agtTaxWithheldKz: number;
  status: 'liquidado' | 'split_pendente' | 'excecao_bancaria' | string;
  failureReason: string | null;
  bankTransactionRef: string;
  reprocessedByStaffId: string | null;
  reprocessedAt: string | null;
  createdAt: string;
}

interface AdminAuditTrailEntry {
  id: number;
  auditCode: string;
  staffId: string;
  staffName: string;
  staffRole: string;
  actionType: string;
  targetEntity: string;
  targetCode: string;
  severity: 'info' | 'warning' | 'critical' | string;
  details: string;
  createdAt: string;
}

interface CustomerLookupEntry {
  customerName: string;
  customerPhone: string;
  verified: boolean;
  orders: Array<{
    orderCode: string;
    amount: number;
    status: string;
    location: string;
    reference: string;
  }>;
  sampleMatches: Array<{
    matchCode: string;
    vehicleModel: string;
    vehicleYear: string;
    status: string;
  }>;
  tickets: string[];
}

interface AdminBackofficeProps {
  initialRole?: BackofficeRole;
  authenticatedStaffName?: string | null;
  authenticatedStaffEmail?: string | null;
}

const PRACA_DOS_CORREIOS_HUB = {
  lat: -8.8147,
  lng: 13.2302,
};

const PRAÇA_SECTORS = [
  'Bloco A · Travagem & Embraiagens',
  'Bloco B · Motor & Alternadores',
  'Bloco C · Filtros & Injeção Diesel',
  'Corredor Central · Suspensão & Direção',
  'Ala Norte · Pneus & Transmissão',
  'Ala Sul · Eletrónica Auto & Baterias',
];

const RBAC_PROFILES: Record<BackofficeRole, RbacRoleDefinition> = {
  super_admin: {
    roleCode: 'super_admin',
    label: 'Super Admin',
    staffId: 'ADM-001',
    staffName: 'Eng.º Diasso Anama',
    permissions: [
      'control_tower.view',
      'control_tower.toggle_driver_status',
      'call_center.view_search',
      'call_center.mediate_match_chat',
      'banca.homologate',
      'banca.toggle_status',
      'banca.block_fraud',
      'finance.view_splits',
      'finance.reprocess_bci_bai_split',
      'finance.export_agt_saft',
      'audit.view_full_trail',
    ],
  },
  field_supervisor: {
    roleCode: 'field_supervisor',
    label: 'Supervisor de Campo',
    staffId: 'SUP-014',
    staffName: 'Paulo Kiala (Praça dos Correios)',
    permissions: [
      'control_tower.view',
      'control_tower.toggle_driver_status',
      'call_center.view_search',
      'call_center.mediate_match_chat',
      'banca.homologate',
      'banca.toggle_status',
      'banca.block_fraud',
      'audit.view_full_trail',
    ],
  },
  call_center: {
    roleCode: 'call_center',
    label: 'Assistente Call Center',
    staffId: 'CCA-029',
    staffName: 'Teresa Neto (Apoio ao Cliente)',
    permissions: [
      'control_tower.view',
      'call_center.view_search',
      'call_center.mediate_match_chat',
    ],
  },
};

type MapPolylineInstance = {
  setMap: (map: unknown) => void;
};

function FleetCorridorOverlay({
  drivers,
  selectedDriver,
}: {
  drivers: FleetDriverTelemetry[];
  selectedDriver: FleetDriverTelemetry | null;
}) {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const linesRef = useRef<MapPolylineInstance[]>([]);

  useEffect(() => {
    if (!map || !mapsLib) return;
    linesRef.current.forEach((l) => l.setMap(null));
    linesRef.current = [];

    const PolylineCtor = (mapsLib as unknown as {
      Polyline: new (opts: Record<string, unknown>) => MapPolylineInstance;
    }).Polyline;

    const activeDrivers = drivers.filter((d) => d.status === 'em_rota');
    const createdLines = activeDrivers.map((d) => {
      const dLat = parseFloat(d.lat) || -8.8234;
      const dLng = parseFloat(d.lng) || 13.2331;
      const isSelected = selectedDriver?.driverCode === d.driverCode;
      return new PolylineCtor({
        path: [PRACA_DOS_CORREIOS_HUB, { lat: dLat, lng: dLng }],
        geodesic: true,
        strokeColor: isSelected ? '#7C3AED' : '#16A34A',
        strokeOpacity: isSelected ? 0.95 : 0.65,
        strokeWeight: isSelected ? 5 : 3,
        map,
      });
    });

    linesRef.current = createdLines;

    return () => {
      linesRef.current.forEach((l) => l.setMap(null));
      linesRef.current = [];
    };
  }, [map, mapsLib, drivers, selectedDriver]);

  useEffect(() => {
    if (!map || !selectedDriver) return;
    const lat = parseFloat(selectedDriver.lat);
    const lng = parseFloat(selectedDriver.lng);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      map.panTo({ lat, lng });
    }
  }, [map, selectedDriver]);

  return null;
}

export function AdminBackoffice({
  initialRole = 'super_admin',
}: AdminBackofficeProps) {
  const [activeRole, setActiveRole] = useState<BackofficeRole>(initialRole);
  const [activeSection, setActiveSection] = useState<
    'control_tower' | 'call_center' | 'banca_governance' | 'financial_splits' | 'rbac_audit'
  >('control_tower');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  const [mapsApiKey, setMapsApiKey] = useState<string>(
    () => (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || ''
  );

  // Back-Office Data State
  const [drivers, setDrivers] = useState<FleetDriverTelemetry[]>([]);
  const [selectedDriverCode, setSelectedDriverCode] = useState<string>('EST-019');
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [bancas, setBancas] = useState<BancaGovernanceRecord[]>([]);
  const [nextAvailableBancaCode, setNextAvailableBancaCode] = useState<string>('PC-043');
  const [financialSplits, setFinancialSplits] = useState<FinancialSplitRecord[]>([]);
  const [auditTrails, setAuditTrails] = useState<AdminAuditTrailEntry[]>([]);
  const [customersDirectory, setCustomersDirectory] = useState<CustomerLookupEntry[]>([]);
  const [gpsMissions, setGpsMissions] = useState<DeliveryMissionDto[]>([]);
  const [gpsEvents, setGpsEvents] = useState<DeliveryTrackingEventDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Call Center Search & Split-View Modal State
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [ticketFilterStatus, setTicketFilterStatus] = useState<string>('todos');
  const [ticketOriginFilter, setTicketOriginFilter] = useState<'todos' | 'cliente' | 'estafeta' | 'banca'>('todos');
  const [splitViewTicket, setSplitViewTicket] = useState<SupportTicketRecord | null>(null);
  const [chatInputText, setChatInputText] = useState<string>('');
  const [sendingChat, setSendingChat] = useState<boolean>(false);

  // Banca Homologation Form State
  const [newBancaName, setNewBancaName] = useState<string>('');
  const [newBancaOwner, setNewBancaOwner] = useState<string>('');
  const [newBancaPhone, setNewBancaPhone] = useState<string>('');
  const [newBancaNif, setNewBancaNif] = useState<string>('');
  const [newBancaSector, setNewBancaSector] = useState<string>(PRAÇA_SECTORS[1]);
  const [bancaStatusFilter, setBancaStatusFilter] = useState<string>('todos');
  const [homologatingBanca, setHomologatingBanca] = useState<boolean>(false);

  // Financial Split Audit Filter State
  const [splitFilter, setSplitFilter] = useState<'todos' | 'excecoes' | 'liquidados'>('todos');
  const [reprocessingCode, setReprocessingCode] = useState<string | null>(null);
  const [exportingAgt, setExportingAgt] = useState<boolean>(false);

  // Feedback Banner State
  const [feedbackNotice, setFeedbackNotice] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  // Interactive Voice Call State in Control Tower & Call Center (Banca | Estafeta | Cliente)
  const [adminCall, setAdminCall] = useState<{
    target: 'BANCA' | 'ESTAFETA' | 'CLIENTE';
    name: string;
    phone: string;
    subtitle: string;
  } | null>(null);
  const [callPhase, setCallPhase] = useState<'ringing' | 'connected'>('connected');
  const [callSeconds, setCallSeconds] = useState(0);
  const [callMuted, setCallMuted] = useState(false);
  const [callSpeaker, setCallSpeaker] = useState(true);
  const [callReply, setCallReply] = useState<string | null>(null);

  useEffect(() => {
    if (!adminCall) {
      setCallSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setCallSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [adminCall]);

  const handleStartAdminCall = (
    target: 'BANCA' | 'ESTAFETA' | 'CLIENTE',
    name: string,
    phone: string,
    subtitle: string
  ) => {
    setCallReply(null);
    setCallSeconds(0);
    setCallMuted(false);
    setCallSpeaker(true);
    setCallPhase('ringing');
    setAdminCall({ target, name, phone, subtitle });

    kitingoCallAudio.playDialAndConnectSound(() => {
      setCallPhase('connected');
      setCallReply(getSimulatedVoiceReply(target));
    });
  };

  const handleEndAdminCall = () => {
    kitingoCallAudio.playHangupTone();
    setAdminCall(null);
    setCallReply(null);
  };

  const formatCallDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const currentStaffProfile = RBAC_PROFILES[activeRole];

  const hasPermission = useCallback(
    (perm: string) => currentStaffProfile.permissions.includes(perm),
    [currentStaffProfile]
  );

  useEffect(() => {
    if (!mapsApiKey) {
      fetch('/api/config/maps')
        .then((r) => r.json())
        .then((d) => {
          if (d?.apiKey) setMapsApiKey(d.apiKey);
        })
        .catch(() => {});
    }
  }, [mapsApiKey]);

  const fetchBackofficeData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/backoffice');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.drivers)) setDrivers(data.drivers);
        if (Array.isArray(data.tickets)) {
          setTickets(data.tickets);
          setSplitViewTicket((prev) =>
            prev ? data.tickets.find((t: SupportTicketRecord) => t.ticketCode === prev.ticketCode) || prev : null
          );
        }
        if (Array.isArray(data.bancas)) setBancas(data.bancas);
        if (data.nextAvailableBancaCode) setNextAvailableBancaCode(data.nextAvailableBancaCode);
        if (Array.isArray(data.financialSplits)) setFinancialSplits(data.financialSplits);
        if (Array.isArray(data.auditTrails)) setAuditTrails(data.auditTrails);
        if (Array.isArray(data.customersDirectory)) setCustomersDirectory(data.customersDirectory);
      }
      const gpsRes = await fetch('/api/gps/missions?role=admin');
      if (gpsRes.ok) {
        const gpsData = await gpsRes.json();
        if (Array.isArray(gpsData.missions)) setGpsMissions(gpsData.missions);
        if (Array.isArray(gpsData.events)) setGpsEvents(gpsData.events);
      }
    } catch {
      // Non-blocking fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBackofficeData();
  }, [fetchBackofficeData]);

  // Real-time WebSocket listener for incoming tickets from Clientes, Estafetas, and Bancas
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'ticket:created' && msg.ticket) {
          setTickets((prev) => {
            if (prev.some((t) => t.ticketCode === msg.ticket.ticketCode)) return prev;
            return [msg.ticket, ...prev];
          });
          if (msg.auditTrail) {
            setAuditTrails((prev) => [msg.auditTrail, ...prev]);
          }
          setFeedbackNotice({
            type: 'warning',
            message: `Novo Ticket encaminhado para o Back-Office: ${msg.ticket.ticketCode} — ${msg.ticket.subject}`,
          });
        } else if (msg.type === 'ticket:updated' && msg.ticket) {
          setTickets((prev) =>
            prev.map((t) => (t.ticketCode === msg.ticket.ticketCode ? { ...t, ...msg.ticket } : t))
          );
          setSplitViewTicket((prev) =>
            prev && prev.ticketCode === msg.ticket.ticketCode ? { ...prev, ...msg.ticket } : prev
          );
          if (msg.auditTrail) {
            setAuditTrails((prev) => [msg.auditTrail, ...prev]);
          }
        } else if (msg.type === 'delivery:completed') {
          setGpsMissions((prev) =>
            prev.map((m) =>
              m.orderCode === (msg.orderCode || 'CE-650018')
                ? { ...m, missionState: 'DELIVERY_CONFIRMED', etaSeconds: 0, distanceKm: 0 }
                : m
            )
          );
          if (msg.auditTrail) {
            setAuditTrails((prev) => [msg.auditTrail, ...prev]);
          }
          setFeedbackNotice({
            type: 'success',
            message: `Peça Entregue com Sucesso (${msg.orderCode || 'CE-650018'}) confirmada por ${msg.customerName || 'João Manuel Baptista'}! Escrow libertado para ${msg.bancaName || 'Banca #08'}.`,
          });
        } else if (msg.type === 'review:created' && msg.review) {
          if (msg.auditTrail) {
            setAuditTrails((prev) => [msg.auditTrail, ...prev]);
          }
          setFeedbackNotice({
            type: 'success',
            message: `Nova Avaliação Registada (${msg.review.orderCode}): Estafeta ${msg.review.driverName} (${msg.review.driverRating}★) | ${msg.review.bancaName} (${msg.review.partRating}★).`,
          });
        }
      } catch {
        // ignore invalid WS frames
      }
    };
    return () => ws.close();
  }, []);

  // Simulate realistic live GPS movement across Luanda corridors every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setDrivers((prev) =>
        prev.map((d) => {
          if (d.status !== 'em_rota') return d;
          const baseLat = parseFloat(d.lat) || -8.8234;
          const baseLng = parseFloat(d.lng) || 13.2331;
          const jitterLat = (Math.random() - 0.48) * 0.0009;
          const jitterLng = (Math.random() - 0.48) * 0.0009;
          const nextSpeed = Math.max(24, Math.min(58, d.speedKmh + Math.round((Math.random() - 0.5) * 6)));
          return {
            ...d,
            lat: (baseLat + jitterLat).toFixed(5),
            lng: (baseLng + jitterLng).toFixed(5),
            speedKmh: nextSpeed,
          };
        })
      );
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const selectedDriver = useMemo(
    () => drivers.find((d) => d.driverCode === selectedDriverCode) || drivers[0] || null,
    [drivers, selectedDriverCode]
  );

  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return customersDirectory;
    const q = customerSearchQuery.toLowerCase();
    return customersDirectory.filter(
      (c) =>
        c.customerName.toLowerCase().includes(q) ||
        c.customerPhone.toLowerCase().includes(q) ||
        c.orders.some((o) => o.orderCode.toLowerCase().includes(q)) ||
        c.sampleMatches.some((m) => m.matchCode.toLowerCase().includes(q))
    );
  }, [customersDirectory, customerSearchQuery]);

  const getTicketOrigin = (tk: SupportTicketRecord): 'cliente' | 'estafeta' | 'banca' => {
    const subj = (tk.subject || '').toUpperCase();
    if (subj.startsWith('[ESTAFETA]')) return 'estafeta';
    if (subj.startsWith('[BANCA]')) return 'banca';
    return 'cliente';
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (ticketFilterStatus !== 'todos' && t.status !== ticketFilterStatus) return false;
      if (ticketOriginFilter !== 'todos' && getTicketOrigin(t) !== ticketOriginFilter) return false;
      if (!customerSearchQuery.trim()) return true;
      const q = customerSearchQuery.toLowerCase();
      return (
        t.customerName.toLowerCase().includes(q) ||
        t.customerPhone.toLowerCase().includes(q) ||
        t.ticketCode.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        (t.orderCode || '').toLowerCase().includes(q) ||
        (t.matchCode || '').toLowerCase().includes(q)
      );
    });
  }, [tickets, ticketFilterStatus, ticketOriginFilter, customerSearchQuery]);

  const filteredBancas = useMemo(() => {
    if (bancaStatusFilter === 'todos') return bancas;
    return bancas.filter((b) => b.status === bancaStatusFilter);
  }, [bancas, bancaStatusFilter]);

  const filteredSplits = useMemo(() => {
    if (splitFilter === 'excecoes') {
      return financialSplits.filter(
        (s) => s.status === 'excecao_bancaria' || s.status === 'split_pendente'
      );
    }
    if (splitFilter === 'liquidados') {
      return financialSplits.filter((s) => s.status === 'liquidado');
    }
    return financialSplits;
  }, [financialSplits, splitFilter]);

  // 1. Toggle Driver Status on Live GPS Control Tower
  async function handleToggleDriverStatus(
    driverCode: string,
    nextStatus: 'em_rota' | 'disponivel' | 'offline'
  ) {
    setFeedbackNotice(null);
    try {
      const res = await fetch(`/api/admin/drivers/${driverCode}/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          staffRole: activeRole,
          staffId: currentStaffProfile.staffId,
          staffName: currentStaffProfile.staffName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.auditTrail) {
          setAuditTrails((prev) => [data.auditTrail, ...prev]);
        }
        setFeedbackNotice({
          type: 'error',
          message: data.error || 'Acesso RBAC negado ao alterar estado do estafeta.',
        });
        return;
      }

      if (data.driver) {
        setDrivers((prev) =>
          prev.map((d) => (d.driverCode === driverCode ? { ...d, ...data.driver } : d))
        );
      }
      if (data.auditTrail) {
        setAuditTrails((prev) => [data.auditTrail, ...prev]);
      }
      setFeedbackNotice({
        type: 'success',
        message: `Estafeta ${driverCode} atualizado para [${nextStatus.toUpperCase()}] e registado no Audit Trail.`,
      });
    } catch {
      setFeedbackNotice({
        type: 'error',
        message: 'Erro de comunicação com a Torre de Controlo.',
      });
    }
  }

  // 2. Send Chat Message or Resolve Ticket in Split-View "Match por Amostra" Modal
  async function handleSendTicketChat(
    e?: React.FormEvent,
    customText?: string,
    nextStatus?: 'aberto' | 'em_mediacao' | 'resolvido'
  ) {
    if (e) e.preventDefault();
    if (!splitViewTicket) return;

    const textToSend = customText !== undefined ? customText : chatInputText;
    if (!textToSend.trim() && !nextStatus) return;

    setSendingChat(true);
    try {
      const res = await fetch(`/api/admin/tickets/${splitViewTicket.ticketCode}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageText: textToSend,
          nextStatus,
          staffRole: activeRole,
          staffId: currentStaffProfile.staffId,
          staffName: currentStaffProfile.staffName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedbackNotice({
          type: 'error',
          message: data.error || 'Falha ao enviar mensagem no Call Center.',
        });
        return;
      }

      if (data.ticket) {
        setSplitViewTicket(data.ticket);
        setTickets((prev) =>
          prev.map((tk) => (tk.ticketCode === data.ticket.ticketCode ? data.ticket : tk))
        );
      }
      if (data.auditTrail) {
        setAuditTrails((prev) => [data.auditTrail, ...prev]);
      }
      setChatInputText('');
      if (nextStatus === 'resolvido') {
        setFeedbackNotice({
          type: 'success',
          message: `Ticket ${splitViewTicket.ticketCode} concluído e validado no Split-View Match por Amostra!`,
        });
      }
    } catch {
      setFeedbackNotice({
        type: 'error',
        message: 'Erro ao atualizar conversa de suporte.',
      });
    } finally {
      setSendingChat(false);
    }
  }

  // 2B. Quick Resolve Ticket directly from Queue Table
  async function handleQuickResolveTicket(tk: SupportTicketRecord) {
    try {
      const res = await fetch(`/api/admin/tickets/${tk.ticketCode}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageText:
            'Resolução concluída pela Supervisão Back-Office Kitingo. Obrigado pelo contacto; o seu processo encontra-se regularizado.',
          nextStatus: 'resolvido',
          staffRole: activeRole,
          staffId: currentStaffProfile.staffId,
          staffName: currentStaffProfile.staffName,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ticket) {
        setTickets((prev) =>
          prev.map((item) => (item.ticketCode === data.ticket.ticketCode ? data.ticket : item))
        );
        if (splitViewTicket?.ticketCode === data.ticket.ticketCode) {
          setSplitViewTicket(data.ticket);
        }
        if (data.auditTrail) {
          setAuditTrails((prev) => [data.auditTrail, ...prev]);
        }
        setFeedbackNotice({
          type: 'success',
          message: `Ticket ${tk.ticketCode} resolvido com sucesso pelo Back-Office e notificado ao emissor.`,
        });
      }
    } catch {
      setFeedbackNotice({
        type: 'error',
        message: 'Falha ao concluir resolução rápida do ticket.',
      });
    }
  }

  // 3. Homologate New Banca with Automatic PC-XXX ID
  async function handleHomologateNewBanca(e: React.FormEvent) {
    e.preventDefault();
    setFeedbackNotice(null);
    setHomologatingBanca(true);

    try {
      const res = await fetch('/api/admin/bancas/homologate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bancaCode: nextAvailableBancaCode,
          bancaName: newBancaName,
          ownerName: newBancaOwner,
          ownerPhone: newBancaPhone,
          nif: newBancaNif,
          sector: newBancaSector,
          staffRole: activeRole,
          staffId: currentStaffProfile.staffId,
          staffName: currentStaffProfile.staffName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.auditTrail) {
          setAuditTrails((prev) => [data.auditTrail, ...prev]);
        }
        setFeedbackNotice({
          type: 'error',
          message: data.error || 'Não foi possível homologar a banca.',
        });
        return;
      }

      if (data.banca) {
        setBancas((prev) => [data.banca, ...prev.filter((b) => b.bancaCode !== data.banca.bancaCode)]);
      }
      if (data.nextAvailableBancaCode) {
        setNextAvailableBancaCode(data.nextAvailableBancaCode);
      }
      if (data.auditTrail) {
        setAuditTrails((prev) => [data.auditTrail, ...prev]);
      }

      setNewBancaName('');
      setNewBancaOwner('');
      setNewBancaPhone('');
      setNewBancaNif('');
      setFeedbackNotice({
        type: 'success',
        message: `Banca ${data.banca?.bancaCode} homologada oficialmente na Praça dos Correios!`,
      });
    } catch {
      setFeedbackNotice({
        type: 'error',
        message: 'Erro ao homologar banca.',
      });
    } finally {
      setHomologatingBanca(false);
    }
  }

  // 4. Instant Banca Status Toggle: [Ativa] | [Suspensa] | [Bloqueada por Fraude]
  async function handleChangeBancaStatus(
    bancaCode: string,
    nextStatus: 'ativa' | 'suspensa' | 'bloqueada_fraude'
  ) {
    setFeedbackNotice(null);
    try {
      const res = await fetch(`/api/admin/bancas/${bancaCode}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          fraudReason:
            nextStatus === 'bloqueada_fraude'
              ? 'Bloqueio imediato por divergência na peça enviada vs. Amostra aprovada'
              : nextStatus === 'suspensa'
                ? 'Suspensão temporária para auditoria física de stock na Praça dos Correios'
                : null,
          staffRole: activeRole,
          staffId: currentStaffProfile.staffId,
          staffName: currentStaffProfile.staffName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.auditTrail) {
          setAuditTrails((prev) => [data.auditTrail, ...prev]);
        }
        setFeedbackNotice({
          type: 'error',
          message: data.error || 'Permissão RBAC insuficiente para alterar estado da banca.',
        });
        return;
      }

      if (data.banca) {
        setBancas((prev) =>
          prev.map((b) => (b.bancaCode === bancaCode ? { ...b, ...data.banca } : b))
        );
      }
      if (data.auditTrail) {
        setAuditTrails((prev) => [data.auditTrail, ...prev]);
      }

      setFeedbackNotice({
        type: nextStatus === 'bloqueada_fraude' ? 'warning' : 'success',
        message: `Banca ${bancaCode} atualizada para [${
          nextStatus === 'bloqueada_fraude'
            ? 'BLOQUEADA POR FRAUDE'
            : nextStatus === 'suspensa'
              ? 'SUSPENSA'
              : 'ATIVA'
        }]. Ação registada no Audit Trail.`,
      });
    } catch {
      setFeedbackNotice({
        type: 'error',
        message: 'Erro ao atualizar estado da banca.',
      });
    }
  }

  // 5. Reprocess Pending / Exception BAI & BCI Split
  async function handleReprocessSplit(splitCode: string) {
    setFeedbackNotice(null);
    setReprocessingCode(splitCode);
    try {
      const res = await fetch(`/api/admin/splits/${splitCode}/reprocess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffRole: activeRole,
          staffId: currentStaffProfile.staffId,
          staffName: currentStaffProfile.staffName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.auditTrail) {
          setAuditTrails((prev) => [data.auditTrail, ...prev]);
        }
        setFeedbackNotice({
          type: 'error',
          message: data.error || 'Apenas o Super Admin pode reprocessar Splits bancários BAI/BCI.',
        });
        return;
      }

      if (data.split) {
        setFinancialSplits((prev) =>
          prev.map((s) => (s.splitCode === splitCode ? data.split : s))
        );
      }
      if (data.auditTrail) {
        setAuditTrails((prev) => [data.auditTrail, ...prev]);
      }
      setFeedbackNotice({
        type: 'success',
        message: `Split ${splitCode} reprocessado com sucesso via ${data.split?.bankName}! Nova referência: ${data.split?.bankTransactionRef}.`,
      });
    } catch {
      setFeedbackNotice({
        type: 'error',
        message: 'Erro ao reprocessar split bancário.',
      });
    } finally {
      setReprocessingCode(null);
    }
  }

  // 6. Export AGT Fiscal Report (SAF-T AO / CSV)
  async function handleExportAgtReport() {
    setFeedbackNotice(null);
    setExportingAgt(true);
    try {
      const res = await fetch('/api/admin/splits/export-agt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffRole: activeRole,
          staffId: currentStaffProfile.staffId,
          staffName: currentStaffProfile.staffName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.auditTrail) {
          setAuditTrails((prev) => [data.auditTrail, ...prev]);
        }
        setFeedbackNotice({
          type: 'error',
          message: data.error || 'Acesso RBAC restrito para exportação fiscal AGT.',
        });
        return;
      }

      if (data.auditTrail) {
        setAuditTrails((prev) => [data.auditTrail, ...prev]);
      }

      // Trigger real CSV download in browser
      const blob = new Blob([data.csvContent || ''], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || 'Kitingo_Relatorio_Fiscal_AGT.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setFeedbackNotice({
        type: 'success',
        message: `Relatório Fiscal AGT (${data.filename}) exportado com ${data.totalRecords} transações BAI/BCI!`,
      });
    } catch {
      setFeedbackNotice({
        type: 'error',
        message: 'Erro ao gerar ficheiro de exportação AGT.',
      });
    } finally {
      setExportingAgt(false);
    }
  }

  // Summary metrics
  const activeFleetCount = drivers.filter((d) => d.status === 'em_rota').length;
  const pendingSplitsCount = financialSplits.filter(
    (s) => s.status === 'excecao_bancaria' || s.status === 'split_pendente'
  ).length;
  const openTicketsCount = tickets.filter((t) => t.status !== 'resolvido').length;
  const activeBancasCount = bancas.filter((b) => b.status === 'ativa').length;

  const navGroups: Array<{
    groupLabel: string;
    items: Array<{
      id: 'control_tower' | 'call_center' | 'banca_governance' | 'financial_splits' | 'rbac_audit';
      label: string;
      subtitle: string;
      icon: React.ComponentType<{ className?: string }>;
      metric: string;
      accentColor: string;
    }>;
  }> = [
    {
      groupLabel: 'Operações em Tempo Real',
      items: [
        {
          id: 'control_tower',
          label: 'Torre de Controlo GPS',
          subtitle: 'Mapa Luanda & Geofence 120m',
          icon: Navigation,
          metric: `${activeFleetCount}/${drivers.length}`,
          accentColor: 'text-emerald-400',
        },
        {
          id: 'call_center',
          label: 'Call Center & Amostras',
          subtitle: 'Balcão +244 & Split-View',
          icon: Headphones,
          metric: `${openTicketsCount}`,
          accentColor: 'text-amber-400',
        },
      ],
    },
    {
      groupLabel: 'Governação & Finanças',
      items: [
        {
          id: 'banca_governance',
          label: 'Homologação de Bancas',
          subtitle: 'Registo Oficial PC-XXX',
          icon: Store,
          metric: `${bancas.length}`,
          accentColor: 'text-sky-400',
        },
        {
          id: 'financial_splits',
          label: 'Splits Bancários BAI/BCI',
          subtitle: 'Escrow EMIS & Export AGT',
          icon: Wallet,
          metric: `${pendingSplitsCount} pend.`,
          accentColor: 'text-amber-400',
        },
      ],
    },
    {
      groupLabel: 'Segurança & Conformidade',
      items: [
        {
          id: 'rbac_audit',
          label: 'Matriz RBAC & Audit Trail',
          subtitle: 'Permissões & Logs Imutáveis',
          icon: Shield,
          metric: `${auditTrails.length}`,
          accentColor: 'text-purple-400',
        },
      ],
    },
  ];

  const allNavItems = navGroups.flatMap((g) => g.items);
  const activeNavMeta =
    allNavItems.find((item) => item.id === activeSection) || allNavItems[0];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col lg:flex-row">
      {/* ===================================================================== */}
      {/* MODERN LEFT SIDEBAR NAVIGATION (DESKTOP STICKY RAIL + COLLAPSIBLE)    */}
      {/* ===================================================================== */}
      <aside
        aria-label="Menu Lateral do Back-Office Kitingo"
        className={`hidden lg:flex lg:flex-col lg:sticky lg:top-12 lg:h-[calc(100vh-3rem)] shrink-0 border-r border-slate-800/80 bg-[#0B0F17] text-slate-100 transition-all duration-300 select-none ${
          sidebarCollapsed ? 'lg:w-20' : 'lg:w-72'
        }`}
      >
        {/* Sidebar Brand Header */}
        <div className="flex items-center justify-between gap-2.5 border-b border-slate-800/80 px-4 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#D97706] to-amber-600 font-mono text-sm font-black text-white shadow-md shadow-amber-950/50">
              KT
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold tracking-tight text-white">
                  Kitingo Back-Office
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  Praça dos Correios · Luanda
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            title={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/90 text-slate-400 hover:border-slate-700 hover:text-white transition-colors cursor-pointer"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>

        {/* Categorized Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {navGroups.map((group) => (
            <div key={group.groupLabel} className="space-y-1.5">
              {!sidebarCollapsed && (
                <p className="px-2.5 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                  {group.groupLabel}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSection(item.id)}
                      title={sidebarCollapsed ? `${item.label} (${item.metric})` : undefined}
                      className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-[#D97706] to-amber-600 text-white shadow-md shadow-amber-950/40'
                          : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
                      }`}
                    >
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-900 text-slate-300 group-hover:bg-slate-800 group-hover:text-white'
                        }`}
                      >
                        <Icon className="size-4" />
                      </span>

                      {!sidebarCollapsed && (
                        <>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`truncate text-xs font-bold ${
                                isActive ? 'text-white' : 'text-slate-200 group-hover:text-white'
                              }`}
                            >
                              {item.label}
                            </p>
                            <p
                              className={`truncate text-[10px] ${
                                isActive ? 'text-amber-100/90' : 'text-slate-500 group-hover:text-slate-400'
                              }`}
                            >
                              {item.subtitle}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 font-mono text-[11px] font-bold tabular-nums ${
                              isActive ? 'text-white' : item.accentColor
                            }`}
                          >
                            {item.metric}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Footer: Quick Voice Dispatch & Active RBAC Operator */}
        <div className="border-t border-slate-800/80 p-3 space-y-3 bg-slate-950/60">
          {!sidebarCollapsed ? (
            <>
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-400">Operador RBAC</span>
                  <span className="font-mono font-bold text-amber-400">
                    {currentStaffProfile.staffId}
                  </span>
                </div>
                <p className="truncate text-xs font-bold text-white">
                  {currentStaffProfile.staffName}
                </p>
                <p className="text-[11px] text-emerald-400 font-medium">
                  {currentStaffProfile.label} · {currentStaffProfile.permissions.length} permissões
                </p>

                <div className="grid grid-cols-3 gap-1 pt-1">
                  {(Object.keys(RBAC_PROFILES) as BackofficeRole[]).map((roleKey) => {
                    const prof = RBAC_PROFILES[roleKey];
                    const active = activeRole === roleKey;
                    const shortLabel =
                      roleKey === 'super_admin'
                        ? 'Admin'
                        : roleKey === 'field_supervisor'
                          ? 'Campo'
                          : 'Suporte';
                    return (
                      <button
                        key={roleKey}
                        type="button"
                        onClick={() => {
                          setActiveRole(roleKey);
                          setFeedbackNotice({
                            type: 'success',
                            message: `Sessão RBAC alterada para ${prof.label} (${prof.staffId} · ${prof.staffName}). Hierarquia de permissões aplicada.`,
                          });
                        }}
                        className={`rounded-lg px-2 py-1.5 text-[10px] font-bold transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#D97706] text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        {shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleStartAdminCall(
                      'ESTAFETA',
                      'Paulo Sebastião (EST-019)',
                      '+244 931 880 210',
                      'Estafeta em Rota · LD-44-92-AO'
                    )
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#16A34A] px-2.5 py-2 text-[11px] font-bold text-white hover:opacity-90 cursor-pointer"
                >
                  <PhoneCall className="size-3.5" />
                  <span>Ligar Estafeta</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleStartAdminCall(
                      'BANCA',
                      'PC-008 · Banca #08 - Peças do Zé',
                      '+244 923 814 008',
                      'Praça dos Correios · Setor B'
                    )
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#D97706] px-2.5 py-2 text-[11px] font-bold text-white hover:opacity-90 cursor-pointer"
                >
                  <PhoneCall className="size-3.5" />
                  <span>Ligar Banca</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                title="Ligar ao Estafeta (Paulo Sebastião)"
                onClick={() =>
                  handleStartAdminCall(
                    'ESTAFETA',
                    'Paulo Sebastião (EST-019)',
                    '+244 931 880 210',
                    'Estafeta em Rota · LD-44-92-AO'
                  )
                }
                className="flex size-10 items-center justify-center rounded-xl bg-[#16A34A] text-white hover:opacity-90 cursor-pointer"
              >
                <PhoneCall className="size-4" />
              </button>
              <button
                type="button"
                title="Ligar à Banca (PC-008)"
                onClick={() =>
                  handleStartAdminCall(
                    'BANCA',
                    'PC-008 · Banca #08 - Peças do Zé',
                    '+244 923 814 008',
                    'Praça dos Correios · Setor B'
                  )
                }
                className="flex size-10 items-center justify-center rounded-xl bg-[#D97706] text-white hover:opacity-90 cursor-pointer"
              >
                <Store className="size-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ===================================================================== */}
      {/* RIGHT CONTENT WORKSPACE (CONTEXTUAL HEADER + MODULES)                 */}
      {/* ===================================================================== */}
      <div className="flex-1 min-w-0 pb-16">
        {/* Contextual Top Bar with Active Section & RBAC Role Switcher */}
        <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur shadow-2xs">
          <div className="mx-auto max-w-7xl px-4 py-3.5 md:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {React.createElement(activeNavMeta.icon, { className: 'size-5' })}
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-base font-extrabold tracking-tight text-foreground sm:text-lg">
                      {activeNavMeta.label}
                    </h1>
                    <span className="font-mono text-xs font-semibold text-muted-foreground">
                      · {currentStaffProfile.staffId} ({currentStaffProfile.staffName})
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {activeNavMeta.subtitle} · Perfil RBAC:{' '}
                    <strong className="text-foreground">{currentStaffProfile.label}</strong>
                  </p>
                </div>
              </div>

              {/* RBAC Role Switcher & Refresh */}
              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="group"
                  aria-label="Seletor de Perfil RBAC"
                  className="flex items-center gap-1 rounded-xl border border-border bg-muted/60 p-1"
                >
                  {(Object.keys(RBAC_PROFILES) as BackofficeRole[]).map((roleKey) => {
                    const prof = RBAC_PROFILES[roleKey];
                    const active = activeRole === roleKey;
                    return (
                      <button
                        key={roleKey}
                        type="button"
                        onClick={() => {
                          setActiveRole(roleKey);
                          setFeedbackNotice({
                            type: 'success',
                            message: `Sessão RBAC alterada para ${prof.label} (${prof.staffId} · ${prof.staffName}). Hierarquia de permissões aplicada.`,
                          });
                        }}
                        className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                          active
                            ? 'bg-primary text-primary-foreground shadow-2xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {prof.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={fetchBackofficeData}
                  disabled={loading}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Sincronizar</span>
                </button>
              </div>
            </div>

            {/* Mobile/Tablet Quick Navigation Bar (Hidden on Desktop where Left Sidebar is active) */}
            <div className="mt-3 flex items-center gap-2 overflow-x-auto border-t border-border pt-2.5 lg:hidden">
              {navGroups
                .flatMap((g) => g.items)
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSection(item.id)}
                      className={`inline-flex min-h-[36px] items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/60 text-foreground hover:bg-secondary'
                      }`}
                    >
                      <Icon className="size-3.5" />
                      <span>{item.label}</span>
                      <span className="font-mono text-[10px] opacity-80">({item.metric})</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pt-5 md:px-6 space-y-5">
        {/* Global Feedback Toast */}
        {feedbackNotice && (
          <div
            role="alert"
            className={`flex items-start justify-between gap-3 rounded-2xl border p-4 shadow-xs ${
              feedbackNotice.type === 'success'
                ? 'border-[#16A34A] bg-[#16A34A] text-white'
                : feedbackNotice.type === 'warning'
                  ? 'border-[#D97706] bg-[#D97706] text-white'
                  : 'border-[#DC2626] bg-[#DC2626] text-white'
            }`}
          >
            <div className="flex items-start gap-2.5 text-xs sm:text-sm font-medium">
              {feedbackNotice.type === 'success' ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              ) : feedbackNotice.type === 'warning' ? (
                <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 size-5 shrink-0" />
              )}
              <span>{feedbackNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackNotice(null)}
              className="rounded-lg bg-white/15 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/25 cursor-pointer shrink-0"
            >
              Fechar
            </button>
          </div>
        )}

        {/* PAINEL DE CHAMADA DE VOZ ATIVA NA TORRE DE CONTROLO / CALL CENTER */}
        {adminCall && (
          <section
            aria-label={`Chamada em curso com ${adminCall.name}`}
            className={`rounded-2xl border-2 p-4 text-white shadow-xl space-y-3 ${
              adminCall.target === 'BANCA'
                ? 'border-[#D97706] bg-slate-900'
                : 'border-[#16A34A] bg-slate-900'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-11 shrink-0 items-center justify-center rounded-2xl text-white animate-pulse ${
                    adminCall.target === 'BANCA' ? 'bg-[#D97706]' : 'bg-[#16A34A]'
                  }`}
                >
                  <PhoneCall className="size-5" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-white/15 px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider text-amber-300">
                      {callPhase === 'ringing'
                        ? 'A CHAMAR...'
                        : `LINHA DE VOZ CONECTADA · ${formatCallDuration(callSeconds)}`}
                    </span>
                    <span className="text-xs text-slate-300">{adminCall.subtitle}</span>
                  </div>
                  <p className="mt-1 text-sm font-black text-white">{adminCall.name}</p>
                  <p className="font-mono text-xs text-emerald-400">{adminCall.phone}</p>
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
                      setCallReply(getSimulatedVoiceReply(adminCall.target));
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3 py-2 text-xs font-bold text-white hover:opacity-90 cursor-pointer"
                >
                  <Phone className="size-3.5" />
                  <span>Rediscar</span>
                </button>

                <button
                  type="button"
                  onClick={handleEndAdminCall}
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
          </section>
        )}

        {/* Executive KPI Strip */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#16A34A] bg-[#16A34A] p-4 text-white">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>Estafetas em Rota GPS</span>
              <Bike className="size-4" />
            </div>
            <p className="mt-2 font-mono text-3xl font-black tabular-nums">
              {activeFleetCount} / {drivers.length}
            </p>
            <p className="mt-1 text-xs text-white/90">
              Praça dos Correios · Maianga · Alvalade · Samba
            </p>
          </div>

          <div className="rounded-2xl border border-[#7C3AED] bg-[#7C3AED] p-4 text-white">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>Tickets Call Center & Amostras</span>
              <Headphones className="size-4" />
            </div>
            <p className="mt-2 font-mono text-3xl font-black tabular-nums">
              {openTicketsCount} abertos
            </p>
            <p className="mt-1 text-xs text-white/90">
              Inspeção Split-View +244 ativa
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between text-xs font-bold text-foreground">
              <span>Bancas Homologadas (PC-XXX)</span>
              <Store className="size-4 text-[#16A34A]" />
            </div>
            <p className="mt-2 font-mono text-3xl font-black text-foreground tabular-nums">
              {activeBancasCount} ativas
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Próximo ID sequencial: <strong className="font-mono text-foreground">{nextAvailableBancaCode}</strong>
            </p>
          </div>

          <div className="rounded-2xl border border-[#D97706] bg-[#D97706] p-4 text-white">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>Splits Pendentes BAI / BCI</span>
              <Wallet className="size-4" />
            </div>
            <p className="mt-2 font-mono text-3xl font-black tabular-nums">
              {pendingSplitsCount} exceções
            </p>
            <p className="mt-1 text-xs text-white/90">
              Monitorização Escrow & Exportação AGT
            </p>
          </div>
        </section>

        {/* =================================================================== */}
        {/* MODULE 1: TORRE DE CONTROLO LOGÍSTICO (LIVE GPS MAP + SIDEBAR)      */}
        {/* =================================================================== */}
        {activeSection === 'control_tower' && (
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
            {/* Left / Center Map Viewport (7 cols on Desktop) */}
            <div className="lg:col-span-7 rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-sm font-bold text-foreground">
                    Torre de Controlo Logístico · Mapa GPS em Tempo Real (Luanda)
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Origem: Praça dos Correios (Ingombota) · Clique num estafeta para focar telemetria
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
                  {drivers.length} viaturas monitorizadas
                </span>
              </div>

              <div className="relative h-[460px] w-full bg-muted">
                {mapsApiKey ? (
                  <APIProvider apiKey={mapsApiKey} language="pt-PT" region="AO">
                    <GoogleMap
                      defaultCenter={{ lat: -8.8245, lng: 13.2355 }}
                      defaultZoom={13}
                      mapId="DEMO_MAP_ID"
                      gestureHandling="greedy"
                      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                      className="h-full w-full"
                    >
                      <FleetCorridorOverlay
                        drivers={drivers}
                        selectedDriver={selectedDriver}
                      />

                      {/* Central Hub Pin: Praça dos Correios */}
                      <AdvancedMarker position={PRACA_DOS_CORREIOS_HUB}>
                        <div className="rounded-xl border-2 border-white bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground shadow-md">
                          Praça dos Correios (Hub Central)
                        </div>
                      </AdvancedMarker>

                      {/* Live Delivery Drivers Markers */}
                      {drivers.map((driver) => {
                        const lat = parseFloat(driver.lat) || -8.8234;
                        const lng = parseFloat(driver.lng) || 13.2331;
                        const isSelected = selectedDriver?.driverCode === driver.driverCode;
                        const bgColor =
                          driver.status === 'em_rota'
                            ? 'bg-[#16A34A]'
                            : driver.status === 'disponivel'
                              ? 'bg-[#D97706]'
                              : 'bg-[#64748B]';
                        return (
                          <AdvancedMarker
                            key={driver.driverCode}
                            position={{ lat, lng }}
                            onClick={() => setSelectedDriverCode(driver.driverCode)}
                          >
                            <div
                              className={`flex items-center gap-1.5 rounded-xl border-2 px-2.5 py-1 text-white shadow-md transition-transform cursor-pointer ${bgColor} ${
                                isSelected ? 'border-yellow-300 scale-110' : 'border-white'
                              }`}
                            >
                              <Bike className="size-3.5 shrink-0" />
                              <span className="font-mono text-[11px] font-bold whitespace-nowrap tabular-nums">
                                {driver.driverCode} · {driver.speedKmh}km/h
                              </span>
                            </div>
                          </AdvancedMarker>
                        );
                      })}
                    </GoogleMap>
                  </APIProvider>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                    <MapPin className="size-8 text-primary mb-2" />
                    <p className="text-sm font-bold text-foreground">
                      Mapa da Torre de Controlo GPS · Luanda
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Coordenadas ativas: Praça dos Correios (-8.8147, 13.2302) → Maianga, Alvalade e Samba.
                    </p>
                  </div>
                )}
              </div>

              {/* Selected Driver Telemetry Strip */}
              {selectedDriver && (
                <div className="border-t border-border bg-muted/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-mono font-bold text-primary">
                      {selectedDriver.driverCode}
                    </span>
                    <span className="mx-1.5 text-muted-foreground">·</span>
                    <strong className="text-foreground">{selectedDriver.fullName}</strong>
                    <span className="mx-1.5 text-muted-foreground">·</span>
                    <span className="font-mono text-muted-foreground">
                      {selectedDriver.vehiclePlate}
                    </span>
                    <p className="mt-0.5 text-muted-foreground">
                      Localização atual: <strong className="text-foreground">{selectedDriver.currentStreet}</strong> ({selectedDriver.lat}, {selectedDriver.lng})
                    </p>
                  </div>
                  <div className="flex items-center gap-4 font-mono tabular-nums">
                    <span>
                      Velocidade: <strong>{selectedDriver.speedKmh} km/h</strong>
                    </span>
                    <span>
                      Bateria: <strong>{selectedDriver.batteryLevel}%</strong>
                    </span>
                    <span>
                      Pedido: <strong>{selectedDriver.activeOrderCode || 'Sem pedido'}</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Right Sidebar: Driver Status Sidebar (speed, battery, active order ID, and status toggles) */}
            <div className="lg:col-span-5 rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h2 className="text-sm font-bold text-foreground">
                    Painel Lateral de Telemetria da Frota
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Velocidade, bateria do telemóvel, encomenda ativa e controlo de estado
                  </p>
                </div>
                {!hasPermission('control_tower.toggle_driver_status') && (
                  <span className="text-[11px] font-semibold text-[#D97706]">
                    Modo Leitura ({currentStaffProfile.label})
                  </span>
                )}
              </div>

              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {drivers.map((driver) => {
                  const isSelected = selectedDriver?.driverCode === driver.driverCode;
                  return (
                    <div
                      key={driver.driverCode}
                      onClick={() => setSelectedDriverCode(driver.driverCode)}
                      className={`rounded-xl border p-3.5 transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-background hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-primary tabular-nums">
                              {driver.driverCode}
                            </span>
                            <h3 className="text-sm font-bold text-foreground">
                              {driver.fullName}
                            </h3>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {driver.vehicleType} ·{' '}
                            <span className="font-mono font-semibold text-foreground">
                              {driver.vehiclePlate}
                            </span>{' '}
                            · {driver.phone}
                          </p>
                        </div>

                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-bold text-white whitespace-nowrap ${
                            driver.status === 'em_rota'
                              ? 'bg-[#16A34A]'
                              : driver.status === 'disponivel'
                                ? 'bg-[#D97706]'
                                : 'bg-[#64748B]'
                          }`}
                        >
                          {driver.status === 'em_rota'
                            ? 'Em Rota'
                            : driver.status === 'disponivel'
                              ? 'Disponível'
                              : 'Offline'}
                        </span>
                      </div>

                      {/* Telemetry Metrics Row: Speed, Battery, Active Order ID */}
                      <div className="mt-3 grid grid-cols-3 gap-2 border-y border-border py-2 text-xs font-mono tabular-nums">
                        <div className="flex items-center gap-1.5">
                          <Gauge className="size-3.5 text-primary shrink-0" />
                          <span>{driver.speedKmh} km/h</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <BatteryCharging
                            className={`size-3.5 shrink-0 ${
                              driver.batteryLevel < 40 ? 'text-[#DC2626]' : 'text-[#16A34A]'
                            }`}
                          />
                          <span>{driver.batteryLevel}% bat</span>
                        </div>
                        <div className="truncate text-right">
                          <span className="text-muted-foreground">ID: </span>
                          <strong className="text-foreground">
                            {driver.activeOrderCode || 'Livre'}
                          </strong>
                        </div>
                      </div>

                      <p className="mt-2 text-[11px] text-muted-foreground truncate">
                        Avenida/Rua: <span className="text-foreground font-medium">{driver.currentStreet}</span>
                      </p>

                      {/* Instant Driver Status Toggles + Direct Call Button */}
                      <div
                        className="mt-2.5 flex flex-wrap items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleDriverStatus(driver.driverCode, 'em_rota')}
                          className={`flex-1 min-h-[34px] rounded-lg px-2 py-1 text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                            driver.status === 'em_rota'
                              ? 'bg-[#16A34A] text-white'
                              : 'border border-border bg-card text-foreground hover:bg-muted'
                          }`}
                        >
                          Em Rota
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleDriverStatus(driver.driverCode, 'disponivel')}
                          className={`flex-1 min-h-[34px] rounded-lg px-2 py-1 text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                            driver.status === 'disponivel'
                              ? 'bg-[#D97706] text-white'
                              : 'border border-border bg-card text-foreground hover:bg-muted'
                          }`}
                        >
                          Disponível
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleDriverStatus(driver.driverCode, 'offline')}
                          className={`flex-1 min-h-[34px] rounded-lg px-2 py-1 text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                            driver.status === 'offline'
                              ? 'bg-[#64748B] text-white'
                              : 'border border-border bg-card text-foreground hover:bg-muted'
                          }`}
                        >
                          Offline
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleStartAdminCall(
                              'ESTAFETA',
                              `${driver.fullName} (${driver.driverCode})`,
                              driver.phone,
                              `${driver.vehicleType} · ${driver.vehiclePlate}`
                            )
                          }
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground hover:opacity-90 cursor-pointer"
                        >
                          <PhoneCall className="size-3" />
                          <span>Ligar</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Full-Width Fleet Supervision: 10-State GPS Missions, Geofencing & Route History */}
            <div className="lg:col-span-12 rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Supervisão de Missões GPS, Geofencing (120m) & Histórico de Percursos
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Monitorização em tempo real do fluxo operacional de 10 estados (Pickup Navigation → Confirmação PIN/QR → Destination Navigation).
                  </p>
                </div>
                <span className="rounded-lg bg-[#7C3AED] px-2.5 py-1 font-mono text-xs font-bold text-white">
                  {gpsMissions.length} Missões Ativas · {gpsEvents.length} Eventos GPS
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {gpsMissions.map((m) => {
                  const meta =
                    DELIVERY_STATE_META[m.missionState] ||
                    DELIVERY_STATE_META.GOING_TO_PICKUP;
                  return (
                    <div
                      key={m.orderCode}
                      className="rounded-xl border border-border bg-background p-3.5 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-black text-foreground">
                          #{m.orderCode} · {m.driverCode}
                        </span>
                        <span
                          className="rounded-md px-2 py-0.5 font-mono text-[10px] font-bold text-white"
                          style={{ backgroundColor: meta.colorHex }}
                        >
                          {m.missionState}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-foreground">
                        {m.activeLeg === 'PICKUP'
                          ? `Etapa 1 (Recolha): → ${m.bancaCode} (${m.bancaName})`
                          : `Etapa 2 (Entrega): → ${m.customerName} (${m.destinationAddress})`}
                      </p>

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 font-mono text-[11px] text-muted-foreground">
                        <span>
                          Dist: <strong className="text-foreground">{m.distanceToTargetMeters}m</strong>
                        </span>
                        <span>
                          ETA: <strong className="text-foreground">{Math.max(1, Math.round(m.etaSeconds / 60))} min</strong>
                        </span>
                        <span>
                          Rasto: <strong className="text-[#7C3AED]">{m.routeHistory.length} pts</strong>
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleStartAdminCall(
                              'ESTAFETA',
                              `${m.driverName} (${m.driverCode})`,
                              m.driverPhone || '+244 931 880 210',
                              `Missão #${m.orderCode} · ${m.vehiclePlate}`
                            )
                          }
                          className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-bold text-primary-foreground hover:opacity-90 cursor-pointer"
                        >
                          <PhoneCall className="size-3" />
                          <span>Ligar Estafeta</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleStartAdminCall(
                              'BANCA',
                              `${m.bancaCode} · ${m.bancaName}`,
                              '+244 923 814 008',
                              `Recolha #${m.orderCode} · Praça dos Correios`
                            )
                          }
                          className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#D97706] px-2 py-1.5 text-[11px] font-bold text-white hover:opacity-90 cursor-pointer"
                        >
                          <PhoneCall className="size-3" />
                          <span>Ligar Banca</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Modular PostGIS Navigation Inspector in Admin Control Tower */}
              {gpsMissions[0] && (
                <div className="pt-2">
                  <KitingoModularNavigation
                    mode="admin"
                    apiKey={mapsApiKey}
                    mission={gpsMissions[0]}
                    onSimulateStep={async () => {
                      await fetch(
                        `/api/gps/missions/${encodeURIComponent(gpsMissions[0].orderCode)}/telemetry`,
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ stepTowardTarget: true, actorRole: 'admin' }),
                        }
                      );
                      await fetchBackofficeData();
                    }}
                    onStateChange={async (nextState) => {
                      await fetch(
                        `/api/gps/missions/${encodeURIComponent(gpsMissions[0].orderCode)}/state`,
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ nextState, actorRole: 'admin' }),
                        }
                      );
                      await fetchBackofficeData();
                    }}
                  />
                </div>
              )}

              {/* Confirmação de Receção & Avaliação de Estafetas e Peças nas Bancas (Torre de Controlo) */}
              <div className="pt-2">
                <KitingoDeliveryRatingCenter
                  mode="admin"
                  orderCode={gpsMissions[0]?.orderCode || 'CE-650018'}
                  customerName={gpsMissions[0]?.customerName || 'João Manuel Baptista'}
                  customerPhone={gpsMissions[0]?.customerPhone || '+244 924 514 042'}
                  driverCode={gpsMissions[0]?.driverCode || 'EST-019'}
                  driverName={gpsMissions[0]?.driverName || 'Paulo Sebastião'}
                  bancaCode={gpsMissions[0]?.bancaCode || 'PC-008'}
                  bancaName={gpsMissions[0]?.bancaName || 'Banca #08 - Peças do Zé'}
                  deliveryPin={gpsMissions[0]?.deliveryPin || '2437'}
                  isDeliveredInitial={gpsMissions[0]?.missionState === 'DELIVERY_CONFIRMED'}
                />
              </div>
            </div>
          </section>
        )}

        {/* =================================================================== */}
        {/* MODULE 2: CALL CENTER & CUSTOMER IDENTIFICATION DESK (+244)         */}
        {/* =================================================================== */}
        {activeSection === 'call_center' && (
          <div className="space-y-5">
            {/* Customer Identification & Search Bar (+244 Phone or Name) */}
            <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Balcão de Identificação do Cliente & Call Center (+244)
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Pesquise por número de telemóvel angolano (+244 9XX XXX XXX), nome do comprador, código de encomenda ou Match por Amostra.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-80">
                    <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      placeholder="Ex: +244 924 514 042 ou João Baptista…"
                      className="h-10 w-full rounded-xl border border-input bg-background pr-3 pl-10 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                  <select
                    value={ticketFilterStatus}
                    onChange={(e) => setTicketFilterStatus(e.target.value)}
                    className="h-10 rounded-xl border border-input bg-background px-3 text-xs font-bold text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="todos">Todos os Tickets ({tickets.length})</option>
                    <option value="aberto">Abertos</option>
                    <option value="em_mediacao">Em Mediação</option>
                    <option value="resolvido">Resolvidos</option>
                  </select>
                </div>
              </div>

              {/* Identified Customers Directory Cards */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {filteredCustomers.map((cust) => (
                  <div
                    key={cust.customerPhone}
                    className="rounded-xl border border-border bg-background p-3.5 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-foreground">{cust.customerName}</p>
                        <p className="font-mono text-xs font-semibold text-primary tabular-nums">
                          {cust.customerPhone}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold text-[#16A34A]">
                        Identidade +244 Verificada
                      </span>
                    </div>

                    <div className="border-t border-border pt-2 text-xs text-muted-foreground space-y-1">
                      <p>
                        Pedidos ({cust.orders.length}):{' '}
                        <strong className="font-mono text-foreground">
                          {cust.orders.map((o) => o.orderCode).join(', ') || 'Nenhum'}
                        </strong>
                      </p>
                      <p>
                        Amostras ({cust.sampleMatches.length}):{' '}
                        <strong className="font-mono text-foreground">
                          {cust.sampleMatches.map((m) => m.matchCode).join(', ') || 'Nenhuma'}
                        </strong>
                      </p>
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          handleStartAdminCall(
                            'CLIENTE',
                            cust.customerName,
                            cust.customerPhone,
                            `Cliente Verificado · ${cust.orders.length} Pedido(s)`
                          )
                        }
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#16A34A] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 cursor-pointer"
                      >
                        <PhoneCall className="size-3.5" />
                        <span>Ligar ao Cliente ({cust.customerPhone})</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Ticket Management Queue with Split-View Trigger */}
            <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Central de Resolução de Tickets (Clientes · Estafetas · Bancas) & Split-View
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Todos os tickets abertos na App do Comprador, App do Estafeta e Painel da Banca são encaminhados em tempo real para esta fila de resolução.
                  </p>
                </div>

                {/* Origin Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'todos', label: `Todos (${tickets.length})` },
                      {
                        id: 'cliente',
                        label: `Clientes (${tickets.filter((t) => getTicketOrigin(t) === 'cliente').length})`,
                      },
                      {
                        id: 'estafeta',
                        label: `Estafetas (${tickets.filter((t) => getTicketOrigin(t) === 'estafeta').length})`,
                      },
                      {
                        id: 'banca',
                        label: `Bancas (${tickets.filter((t) => getTicketOrigin(t) === 'banca').length})`,
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setTicketOriginFilter(tab.id)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                        ticketOriginFilter === tab.id
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'border border-border bg-background text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/60 text-[11px] font-bold text-muted-foreground">
                    <tr>
                      <th className="px-3.5 py-3">Ticket / Origem</th>
                      <th className="px-3.5 py-3">Emissor / Contacto (+244)</th>
                      <th className="px-3.5 py-3">Viatura & Assunto</th>
                      <th className="px-3.5 py-3">Banca & Oferta</th>
                      <th className="px-3.5 py-3">Estado</th>
                      <th className="px-3.5 py-3 text-right">Resolução Back-Office</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredTickets.map((tk) => {
                      const origin = getTicketOrigin(tk);
                      return (
                        <tr key={tk.ticketCode} className="hover:bg-muted/30">
                          <td className="px-3.5 py-3 font-mono tabular-nums">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-foreground">{tk.ticketCode}</span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white ${
                                  origin === 'estafeta'
                                    ? 'bg-[#0284C7]'
                                    : origin === 'banca'
                                      ? 'bg-[#D97706]'
                                      : 'bg-[#16A34A]'
                                }`}
                              >
                                {origin}
                              </span>
                            </div>
                            <div
                              className={`mt-0.5 text-[11px] font-semibold ${
                                tk.priority === 'urgente'
                                  ? 'text-[#DC2626]'
                                  : tk.priority === 'alta'
                                    ? 'text-[#D97706]'
                                    : 'text-muted-foreground'
                              }`}
                            >
                              Prioridade {tk.priority.toUpperCase()}
                            </div>
                          </td>
                          <td className="px-3.5 py-3">
                            <p className="font-bold text-foreground">{tk.customerName}</p>
                            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                              {tk.customerPhone}
                            </p>
                          </td>
                          <td className="px-3.5 py-3">
                            <p className="font-bold text-foreground">{tk.vehicleModel}</p>
                            <p className="text-muted-foreground line-clamp-1">{tk.subject}</p>
                            <p className="font-mono text-[11px] text-primary tabular-nums">
                              Pedido: {tk.orderCode || 'N/A'} · Amostra: {tk.matchCode || 'N/A'}
                            </p>
                          </td>
                          <td className="px-3.5 py-3">
                            <p className="font-semibold text-foreground">
                              {tk.bancaCode} · {tk.bancaName}
                            </p>
                            <p className="font-mono text-xs font-bold text-[#16A34A] tabular-nums">
                              {formatKz(tk.merchantOfferPriceKz)} (
                              {tk.merchantOfferCondition === 'nova' ? 'Nova' : 'Ocasião 72h'})
                            </p>
                          </td>
                          <td className="px-3.5 py-3">
                            <span
                              className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold text-white whitespace-nowrap ${
                                tk.status === 'resolvido'
                                  ? 'bg-[#16A34A]'
                                  : tk.status === 'em_mediacao'
                                    ? 'bg-[#7C3AED]'
                                    : 'bg-[#D97706]'
                              }`}
                            >
                              {tk.status === 'resolvido'
                                ? 'Resolvido'
                                : tk.status === 'em_mediacao'
                                  ? 'Em Mediação'
                                  : 'Aberto'}
                            </span>
                          </td>
                          <td className="px-3.5 py-3 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  handleStartAdminCall(
                                    origin === 'estafeta' ? 'ESTAFETA' : 'CLIENTE',
                                    tk.customerName,
                                    tk.customerPhone,
                                    `Ticket ${tk.ticketCode} · ${tk.vehicleModel}`
                                  )
                                }
                                className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-[#16A34A] px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-90 cursor-pointer whitespace-nowrap"
                              >
                                <PhoneCall className="size-3.5" />
                                <span>
                                  {origin === 'estafeta' ? 'Ligar Estafeta' : 'Ligar Cliente'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleStartAdminCall(
                                    'BANCA',
                                    `${tk.bancaCode} · ${tk.bancaName}`,
                                    '+244 923 814 008',
                                    `Ticket ${tk.ticketCode} · ${tk.vehicleModel}`
                                  )
                                }
                                className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-[#D97706] px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-90 cursor-pointer whitespace-nowrap"
                              >
                                <PhoneCall className="size-3.5" />
                                <span>Ligar Banca</span>
                              </button>

                              {tk.status !== 'resolvido' && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickResolveTicket(tk)}
                                  className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-[#0284C7] px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-90 cursor-pointer whitespace-nowrap"
                                >
                                  <CheckCircle2 className="size-3.5" />
                                  <span>Resolver</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setSplitViewTicket(tk)}
                                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 cursor-pointer whitespace-nowrap"
                              >
                                <Eye className="size-3.5" />
                                <span>Responder / Split-View</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* =================================================================== */}
        {/* MODULE 3: BANCA HOMOLOGATION & GOVERNANCE (PC-XXX)                  */}
        {/* =================================================================== */}
        {activeSection === 'banca_governance' && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
            {/* Left Column: Homologate New Banca Form with Auto PC-XXX Generator */}
            <section className="lg:col-span-4 rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="border-b border-border pb-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-foreground">
                    Homologar Nova Banca
                  </h2>
                  <span className="rounded-lg bg-primary px-2.5 py-1 font-mono text-xs font-bold text-primary-foreground tabular-nums">
                    {nextAvailableBancaCode}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Geração automática de identificador sequencial único para a Praça dos Correios.
                </p>
              </div>

              <form onSubmit={handleHomologateNewBanca} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">
                    Código Oficial Atribuído (Automático)
                  </label>
                  <input
                    type="text"
                    value={nextAvailableBancaCode}
                    readOnly
                    className="h-10 w-full rounded-xl border border-input bg-muted px-3 font-mono text-xs font-bold text-foreground tabular-nums"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">
                    Nome Comercial da Banca *
                  </label>
                  <input
                    type="text"
                    value={newBancaName}
                    onChange={(e) => setNewBancaName(e.target.value)}
                    placeholder="Ex: Banca #43 · Travões & Discos Luanda"
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">
                    Nome do Proprietário / Responsável *
                  </label>
                  <input
                    type="text"
                    value={newBancaOwner}
                    onChange={(e) => setNewBancaOwner(e.target.value)}
                    placeholder="Ex: Domingos Neto Kiala"
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-foreground">
                      Telemóvel (+244) *
                    </label>
                    <input
                      type="tel"
                      value={newBancaPhone}
                      onChange={(e) => setNewBancaPhone(e.target.value)}
                      placeholder="+244 923 456 789"
                      className="h-10 w-full rounded-xl border border-input bg-background px-3 font-mono text-xs text-foreground tabular-nums focus:border-primary focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-foreground">
                      NIF Angolano (AGT) *
                    </label>
                    <input
                      type="text"
                      value={newBancaNif}
                      onChange={(e) => setNewBancaNif(e.target.value)}
                      placeholder="5417043910"
                      className="h-10 w-full rounded-xl border border-input bg-background px-3 font-mono text-xs text-foreground tabular-nums focus:border-primary focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-foreground">
                    Setor na Praça dos Correios
                  </label>
                  <select
                    value={newBancaSector}
                    onChange={(e) => setNewBancaSector(e.target.value)}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
                  >
                    {PRAÇA_SECTORS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={homologatingBanca}
                  className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="size-4" />
                  <span>
                    {homologatingBanca
                      ? 'A homologar banca...'
                      : `Aprovar & Homologar ${nextAvailableBancaCode}`}
                  </span>
                </button>
              </form>
            </section>

            {/* Right Column: Banca Governance Queue & Instant Status Toggles */}
            <section className="lg:col-span-8 rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3">
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Governação de Bancas · Praça dos Correios
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Controlo instantâneo de estado operacional: [Ativa] | [Suspensa] | [Bloqueada por Fraude]
                  </p>
                </div>

                <select
                  value={bancaStatusFilter}
                  onChange={(e) => setBancaStatusFilter(e.target.value)}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-xs font-bold text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="todos">Todas as Bancas ({bancas.length})</option>
                  <option value="ativa">Ativas (#16A34A)</option>
                  <option value="pendente">Aguardando Homologação</option>
                  <option value="suspensa">Suspensas (#64748B)</option>
                  <option value="bloqueada_fraude">Bloqueadas por Fraude (#DC2626)</option>
                </select>
              </div>

              <div className="space-y-3">
                {filteredBancas.map((banca) => (
                  <div
                    key={banca.bancaCode}
                    className="rounded-xl border border-border bg-background p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-primary px-2 py-0.5 font-mono text-xs font-bold text-primary-foreground tabular-nums">
                          {banca.bancaCode}
                        </span>
                        <h3 className="text-sm font-bold text-foreground">{banca.bancaName}</h3>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-bold text-white ${
                            banca.status === 'ativa'
                              ? 'bg-[#16A34A]'
                              : banca.status === 'suspensa'
                                ? 'bg-[#64748B]'
                                : banca.status === 'bloqueada_fraude'
                                  ? 'bg-[#DC2626]'
                                  : 'bg-[#D97706]'
                          }`}
                        >
                          {banca.status === 'ativa'
                            ? 'Ativa'
                            : banca.status === 'suspensa'
                              ? 'Suspensa'
                              : banca.status === 'bloqueada_fraude'
                                ? 'Bloqueada por Fraude'
                                : 'Pendente Homologação'}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Titular: <strong className="text-foreground">{banca.ownerName || 'Registado'}</strong> ·{' '}
                        <span className="font-mono tabular-nums">{banca.ownerPhone || '+244 924 514 008'}</span> · NIF:{' '}
                        <span className="font-mono font-semibold text-foreground tabular-nums">
                          {banca.nif || '5417008912'}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">Setor: {banca.sector}</p>

                      {banca.fraudReason && (
                        <p className="mt-1 text-xs font-semibold text-[#DC2626]">
                          Motivo de Auditoria: {banca.fraudReason}
                        </p>
                      )}
                    </div>

                    {/* Instant Status Toggles + Ligar à Banca */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          handleStartAdminCall(
                            'BANCA',
                            `${banca.bancaCode} · ${banca.bancaName}`,
                            banca.ownerPhone || '+244 924 514 008',
                            `Titular: ${banca.ownerName || 'Comerciante'} · ${banca.sector}`
                          )
                        }
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#D97706] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 cursor-pointer whitespace-nowrap"
                      >
                        <PhoneCall className="size-3.5" />
                        <span>Ligar à Banca</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChangeBancaStatus(banca.bancaCode, 'ativa')}
                        className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                          banca.status === 'ativa'
                            ? 'bg-[#16A34A] text-white'
                            : 'border border-border bg-card text-foreground hover:bg-muted'
                        }`}
                      >
                        Ativa
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChangeBancaStatus(banca.bancaCode, 'suspensa')}
                        className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                          banca.status === 'suspensa'
                            ? 'bg-[#64748B] text-white'
                            : 'border border-border bg-card text-foreground hover:bg-muted'
                        }`}
                      >
                        Suspensa
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChangeBancaStatus(banca.bancaCode, 'bloqueada_fraude')}
                        className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                          banca.status === 'bloqueada_fraude'
                            ? 'bg-[#DC2626] text-white'
                            : 'border border-border bg-card text-foreground hover:bg-muted'
                        }`}
                      >
                        Bloqueada por Fraude
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* =================================================================== */}
        {/* MODULE 4: FINANCIAL SPLIT AUDIT & EXCEPTION MONITOR (BAI / BCI)     */}
        {/* =================================================================== */}
        {activeSection === 'financial_splits' && (
          <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-4">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Monitor de Auditoria de Splits Bancários (BAI / BCI / EMIS Escrow)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Supervisão em tempo real das transferências automáticas 90/10, tratamento de "Splits Pendentes" e exportação fiscal AGT.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/50 p-1">
                  <button
                    type="button"
                    onClick={() => setSplitFilter('todos')}
                    className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-bold cursor-pointer ${
                      splitFilter === 'todos'
                        ? 'bg-card text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Todos ({financialSplits.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitFilter('excecoes')}
                    className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-bold cursor-pointer ${
                      splitFilter === 'excecoes'
                        ? 'bg-[#D97706] text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Splits Pendentes / Exceções ({pendingSplitsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitFilter('liquidados')}
                    className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-bold cursor-pointer ${
                      splitFilter === 'liquidados'
                        ? 'bg-[#16A34A] text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Liquidados
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleExportAgtReport}
                  disabled={exportingAgt}
                  className="inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  <Download className="size-4" />
                  <span>
                    {exportingAgt ? 'A gerar CSV AGT...' : 'Exportar Relatório AGT (CSV / SAF-T)'}
                  </span>
                </button>
              </div>
            </div>

            {!hasPermission('finance.reprocess_bci_bai_split') && (
              <div className="rounded-xl border border-[#D97706]/40 bg-[#D97706]/10 p-3 text-xs text-foreground flex items-center justify-between gap-2">
                <span>
                  Nota RBAC: Está autenticado como <strong>{currentStaffProfile.label}</strong>. As ações de{' '}
                  <strong>Reprocessamento Manual BAI/BCI</strong> e <strong>Exportação Fiscal AGT</strong> requerem credencial de{' '}
                  <strong>Super Admin</strong> (clique num botão abaixo para testar o bloqueio RBAC auditado).
                </span>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/60 text-[11px] font-bold text-muted-foreground">
                  <tr>
                    <th className="px-3.5 py-3">Split / Pedido</th>
                    <th className="px-3.5 py-3">Banca & NIF AGT</th>
                    <th className="px-3.5 py-3">Banco & IBAN</th>
                    <th className="px-3.5 py-3 text-right">Bruto (AOA)</th>
                    <th className="px-3.5 py-3 text-right">Líquido Banca</th>
                    <th className="px-3.5 py-3 text-right">Retenção AGT</th>
                    <th className="px-3.5 py-3">Estado & Referência</th>
                    <th className="px-3.5 py-3 text-right">Controlo Bancário</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono tabular-nums">
                  {filteredSplits.map((sp) => {
                    const isException =
                      sp.status === 'excecao_bancaria' || sp.status === 'split_pendente';
                    return (
                      <tr key={sp.splitCode} className="hover:bg-muted/30">
                        <td className="px-3.5 py-3">
                          <div className="font-bold text-foreground">{sp.splitCode}</div>
                          <div className="text-[11px] text-muted-foreground">
                            Pedido {sp.orderCode}
                          </div>
                        </td>
                        <td className="px-3.5 py-3 font-sans">
                          <div className="font-bold text-foreground">
                            {sp.bancaCode} · {sp.bancaName}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            NIF: {sp.bancaNif}
                          </div>
                        </td>
                        <td className="px-3.5 py-3">
                          <span className="font-bold text-primary">{sp.bankName}</span>
                          <div className="text-[11px] text-muted-foreground">{sp.ibanMasked}</div>
                        </td>
                        <td className="px-3.5 py-3 text-right font-bold text-foreground">
                          {formatKz(sp.grossAmountKz)}
                        </td>
                        <td className="px-3.5 py-3 text-right font-bold text-[#16A34A]">
                          {formatKz(sp.merchantNetKz)}
                        </td>
                        <td className="px-3.5 py-3 text-right text-muted-foreground">
                          {formatKz(sp.agtTaxWithheldKz)}
                        </td>
                        <td className="px-3.5 py-3 font-sans">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold text-white ${
                              sp.status === 'liquidado'
                                ? 'bg-[#16A34A]'
                                : sp.status === 'excecao_bancaria'
                                  ? 'bg-[#DC2626]'
                                  : 'bg-[#D97706]'
                            }`}
                          >
                            {sp.status === 'liquidado'
                              ? 'Liquidado'
                              : sp.status === 'excecao_bancaria'
                                ? 'Exceção Bancária'
                                : 'Split Pendente'}
                          </span>
                          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                            {sp.bankTransactionRef}
                          </div>
                          {sp.failureReason && (
                            <p className="mt-0.5 text-[11px] font-semibold text-[#DC2626]">
                              {sp.failureReason}
                            </p>
                          )}
                        </td>
                        <td className="px-3.5 py-3 text-right font-sans">
                          {isException ? (
                            <button
                              type="button"
                              disabled={reprocessingCode === sp.splitCode}
                              onClick={() => handleReprocessSplit(sp.splitCode)}
                              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#D97706] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                            >
                              <RefreshCw
                                className={`size-3.5 ${
                                  reprocessingCode === sp.splitCode ? 'animate-spin' : ''
                                }`}
                              />
                              <span>Reprocessar Split</span>
                            </button>
                          ) : (
                            <span className="text-[11px] font-semibold text-[#16A34A]">
                              Conciliado {sp.reprocessedByStaffId ? `(${sp.reprocessedByStaffId})` : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* =================================================================== */}
        {/* MODULE 5: RBAC PERMISSION HIERARCHY & AUDIT TRAIL LOGGING TABLE     */}
        {/* =================================================================== */}
        {activeSection === 'rbac_audit' && (
          <div className="space-y-5">
            {/* Strict RBAC Permission Hierarchy Table */}
            <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Hierarquia de Controlo de Acesso Baseado em Funções (RBAC)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Matriz de governação de segurança para Super Admin, Supervisor de Campo e Assistente de Call Center.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {(Object.keys(RBAC_PROFILES) as BackofficeRole[]).map((roleKey) => {
                  const prof = RBAC_PROFILES[roleKey];
                  const isCurrent = activeRole === roleKey;
                  return (
                    <div
                      key={roleKey}
                      className={`rounded-xl border p-4 space-y-3 ${
                        isCurrent ? 'border-primary bg-primary/5' : 'border-border bg-background'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-mono text-xs font-bold text-primary">
                            {prof.staffId}
                          </span>
                          <h3 className="text-sm font-bold text-foreground">{prof.label}</h3>
                          <p className="text-xs text-muted-foreground">{prof.staffName}</p>
                        </div>
                        {isCurrent && (
                          <span className="rounded-md bg-[#16A34A] px-2 py-0.5 text-[11px] font-bold text-white">
                            Ativo
                          </span>
                        )}
                      </div>

                      <ul className="space-y-1.5 border-t border-border pt-3 text-xs">
                        {prof.permissions.map((perm) => (
                          <li key={perm} className="flex items-center gap-2 font-mono text-[11px]">
                            <CheckCircle2 className="size-3.5 text-[#16A34A] shrink-0" />
                            <span>{perm}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Immutable Audit Trail Logging Table */}
            <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Registo Imutável de Auditoria Administrativa (Audit Trail)
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Rastreio de todas as ações administrativas, carimbos de data/hora, IDs de staff e bloqueios RBAC.
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-muted-foreground tabular-nums">
                  {auditTrails.length} eventos registados
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/60 text-[11px] font-bold text-muted-foreground">
                    <tr>
                      <th className="px-3.5 py-3">Código / Data-Hora</th>
                      <th className="px-3.5 py-3">Staff ID & Função RBAC</th>
                      <th className="px-3.5 py-3">Ação Executada</th>
                      <th className="px-3.5 py-3">Entidade Alvo</th>
                      <th className="px-3.5 py-3">Detalhes da Operação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {auditTrails.map((log) => (
                      <tr key={log.auditCode} className="hover:bg-muted/30">
                        <td className="px-3.5 py-3 font-mono tabular-nums whitespace-nowrap">
                          <div className="font-bold text-foreground">{log.auditCode}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {log.createdAt
                              ? new Date(log.createdAt).toLocaleString('pt-AO')
                              : 'Agora'}
                          </div>
                        </td>
                        <td className="px-3.5 py-3">
                          <div className="font-bold text-foreground">
                            <span className="font-mono text-primary">{log.staffId}</span> ·{' '}
                            {log.staffName}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground uppercase">
                            {log.staffRole}
                          </div>
                        </td>
                        <td className="px-3.5 py-3 font-mono text-[11px] font-bold">
                          <span
                            className={
                              log.severity === 'critical'
                                ? 'text-[#DC2626]'
                                : log.severity === 'warning'
                                  ? 'text-[#D97706]'
                                  : 'text-[#16A34A]'
                            }
                          >
                            {log.actionType}
                          </span>
                        </td>
                        <td className="px-3.5 py-3 font-mono text-xs font-bold text-foreground tabular-nums">
                          {log.targetEntity} · {log.targetCode}
                        </td>
                        <td className="px-3.5 py-3 text-muted-foreground">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
        </main>
      </div>

      {/* ===================================================================== */}
      {/* SPLIT-VIEW MODAL FOR "MATCH POR AMOSTRA" + INTEGRATED CHAT SUPPORT    */}
      {/* ===================================================================== */}
      {splitViewTicket && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="split-view-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
        >
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-primary px-2.5 py-0.5 font-mono text-xs font-bold text-primary-foreground">
                    {splitViewTicket.ticketCode}
                  </span>
                  <h2 id="split-view-modal-title" className="text-base font-extrabold text-foreground sm:text-lg">
                    Inspeção Split-View "Match por Amostra" · {splitViewTicket.vehicleModel}
                  </h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cliente: <strong className="text-foreground">{splitViewTicket.customerName}</strong> (
                  <span className="font-mono">{splitViewTicket.customerPhone}</span>) · Pedido:{' '}
                  <strong className="font-mono text-foreground">{splitViewTicket.orderCode}</strong> · Amostra:{' '}
                  <strong className="font-mono text-foreground">{splitViewTicket.matchCode}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSplitViewTicket(null)}
                className="flex size-8 items-center justify-center rounded-full bg-muted text-foreground hover:bg-secondary cursor-pointer"
                aria-label="Fechar janela Split-View"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Side-by-Side Split-View Comparison: Client Old Part vs Merchant Offered Part */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Left Pane: Client's Old Part Photo */}
              <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase text-muted-foreground">
                    1. Foto da Peça Antiga do Cliente (Amostra)
                  </span>
                  <span className="font-mono text-xs font-bold text-primary">
                    {splitViewTicket.matchCode}
                  </span>
                </div>
                <div className="flex h-52 items-center justify-center overflow-hidden rounded-xl border border-border bg-card p-3">
                  <img
                    src={splitViewTicket.clientSamplePhotoUrl}
                    alt="Amostra da peça antiga do cliente"
                    referrerPolicy="no-referrer"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="text-xs space-y-1">
                  <p className="font-bold text-foreground">
                    Viatura: {splitViewTicket.vehicleModel}
                  </p>
                  <p className="text-muted-foreground">
                    {splitViewTicket.clientPartDescription}
                  </p>
                </div>
              </div>

              {/* Right Pane: Merchant's Offered Part */}
              <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase text-muted-foreground">
                    2. Peça Proposta pela Banca ({splitViewTicket.bancaCode})
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-bold text-white ${
                      splitViewTicket.merchantOfferCondition === 'nova'
                        ? 'bg-[#16A34A]'
                        : 'bg-[#D97706]'
                    }`}
                  >
                    {splitViewTicket.merchantOfferCondition === 'nova'
                      ? 'Peça Nova (Na Caixa)'
                      : 'Ocasião · Garantia 72h'}
                  </span>
                </div>
                <div className="flex h-52 items-center justify-center overflow-hidden rounded-xl border border-border bg-card p-3">
                  <img
                    src={splitViewTicket.merchantOfferPhotoUrl}
                    alt="Peça proposta pela banca na Praça dos Correios"
                    referrerPolicy="no-referrer"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-foreground">
                      {splitViewTicket.merchantOfferPartName}
                    </p>
                    <span className="font-mono text-sm font-black text-[#16A34A] tabular-nums">
                      {formatKz(splitViewTicket.merchantOfferPriceKz)}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    Fornecedor: <strong className="text-foreground">{splitViewTicket.bancaName}</strong> ({splitViewTicket.bancaCode})
                  </p>
                </div>
              </div>
            </div>

            {/* Integrated Call Center Chat Support */}
            <div className="rounded-xl border border-border bg-background p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-primary" />
                  <h3 className="text-xs font-bold text-foreground">
                    Chat de Mediação Tripartida (Cliente ↔ Call Center ↔ {splitViewTicket.bancaName})
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleStartAdminCall(
                        'CLIENTE',
                        splitViewTicket.customerName,
                        splitViewTicket.customerPhone,
                        `Comprador · Ticket ${splitViewTicket.ticketCode}`
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A34A] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 cursor-pointer"
                  >
                    <PhoneCall className="size-3.5" />
                    <span>Ligar ao Cliente</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleStartAdminCall(
                        'BANCA',
                        `${splitViewTicket.bancaCode} · ${splitViewTicket.bancaName}`,
                        '+244 923 814 008',
                        'Fornecedor · Praça dos Correios'
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#D97706] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 cursor-pointer"
                  >
                    <PhoneCall className="size-3.5" />
                    <span>Ligar à Banca</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleStartAdminCall(
                        'ESTAFETA',
                        'Paulo Sebastião (#EST-019)',
                        '+244 931 880 210',
                        `Estafeta Designado · Pedido ${splitViewTicket.orderCode}`
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 cursor-pointer"
                  >
                    <PhoneCall className="size-3.5" />
                    <span>Ligar ao Estafeta</span>
                  </button>

                  <button
                    type="button"
                    disabled={sendingChat}
                    onClick={() =>
                      handleSendTicketChat(
                        undefined,
                        'Compatibilidade técnica homologada a 100% pelo Call Center no Split-View. Estafeta autorizado a recolher na banca.',
                        'resolvido'
                      )
                    }
                    className="rounded-lg bg-[#16A34A] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 cursor-pointer"
                  >
                    Aprovar Match & Resolver Ticket
                  </button>
                </div>
              </div>

              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                {splitViewTicket.chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-xl p-2.5 text-xs ${
                      msg.senderRole === 'suporte' ||
                      msg.senderRole === 'call_center' ||
                      msg.senderRole === 'super_admin' ||
                      msg.senderRole === 'field_supervisor'
                        ? 'border border-primary/25 bg-primary/5'
                        : 'border border-border bg-card'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <strong className="text-foreground">{msg.sender}</strong>
                      <span className="font-mono tabular-nums">{msg.timestamp}</span>
                    </div>
                    <p className="mt-1 text-foreground">{msg.text}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={(e) => handleSendTicketChat(e)} className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInputText}
                  onChange={(e) => setChatInputText(e.target.value)}
                  placeholder="Escreva uma mensagem para o cliente e para a banca..."
                  className="h-10 flex-1 rounded-xl border border-input bg-card px-3.5 text-xs text-foreground focus:border-primary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sendingChat}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="size-3.5" />
                  <span>Enviar</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
