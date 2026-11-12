import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Bike,
  Box,
  Camera,
  CheckCircle2,
  Clock,
  DollarSign,
  FileCheck2,
  ImagePlus,
  KeyRound,
  Layers,
  Link2,
  MessageSquare,
  Mic,
  MicOff,
  PackageCheck,
  PackagePlus,
  PauseCircle,
  Phone,
  PhoneCall,
  PhoneOff,
  Power,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tag,
  Truck,
  Upload,
  Volume2,
  Wallet,
  XCircle,
  Headphones,
} from 'lucide-react';
import { formatKz } from '@/lib/products';
import {
  getSimulatedVoiceReply,
  kitingoCallAudio,
} from '../../lib/kitingo-call-audio.ts';
import { KitingoTicketCenter } from '../support/kitingo-ticket-center';
import { KitingoDeliveryRatingCenter } from '../reviews/kitingo-delivery-rating-center';

export type PartApprovalStatus = 'aprovada' | 'rejeitada' | 'suspensa';

export interface MerchantInventoryItem {
  id: number;
  sku: string;
  bancaCode: string;
  bancaName: string;
  partName: string;
  category: string;
  condition: 'nova' | 'recondicionada';
  grade: string | null;
  brand: string;
  priceKz: number;
  stockQty: number;
  compatibility: string;
  warrantyLabel: string;
  photoUrl: string;
  approvalStatus: PartApprovalStatus;
  createdAt: string;
}

export interface MerchantPayoutItem {
  id: number;
  payoutCode: string;
  orderCode: string;
  bancaCode: string;
  bancaName: string;
  grossAmountKz: number;
  platformFeeKz: number;
  netPayoutKz: number;
  handoverOtp: string;
  driverName: string;
  status: string;
  createdAt: string;
}

export interface SampleMatchVendorQuote {
  bancaCode: string;
  bancaName: string;
  condition: 'nova' | 'recondicionada';
  priceKz: number;
  warrantyLabel: string;
  partName?: string;
  linkedSku?: string;
  etaMinutes: number;
}

export interface IncomingSampleMatch {
  id: number;
  matchCode: string;
  customerPhone: string | null;
  customerName: string | null;
  vehicleModel: string;
  vehicleYear: string;
  partCategory: string;
  preferredCondition: string;
  notes: string | null;
  photos: string[];
  status: string;
  approvalStatus: PartApprovalStatus;
  vendorQuotes: SampleMatchVendorQuote[];
  createdAt: string;
}

export interface MerchantOrderItem {
  id: string;
  name: string;
  brand: string;
  price: number;
  quantity: number;
  condition?: 'nova' | 'recondicionada';
  bancaCode?: string;
  bancaName?: string;
}

export interface MerchantOrderRecord {
  id: number;
  orderCode: string;
  customerPhone: string;
  customerName: string;
  deliveryAddress: string;
  vehicleNote: string | null;
  paymentMethod: string;
  emisReference: string;
  totalAmount: number;
  status: string;
  items: MerchantOrderItem[];
  expectedHandoverOtp: string;
  handoverCompleted: boolean;
  driverName: string;
  driverCode: string;
  driverPhone: string;
  driverVehicle: string;
  payoutRecord: MerchantPayoutItem | null;
  createdAt: string;
}

interface MerchantDashboardProps {
  bancaCode?: string | null;
  bancaName?: string | null;
  vendorName?: string | null;
  vendorPhone?: string | null;
}

const INVENTORY_CATEGORIES = [
  'Motor',
  'Alternador',
  'Arranque',
  'Suspensão',
  'Travões',
  'Injeção & Diesel',
  'Eletrónica',
  'Pneus',
  'Óleos & Lubrificantes',
];

const PRACA_CAMERA_PRESETS = [
  {
    label: 'Alternador Denso 12V (Bancada)',
    url: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?w=600&auto=format&fit=crop&q=80',
  },
  {
    label: 'Motor de Arranque Hilux (Caixa)',
    url: 'https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=600&auto=format&fit=crop&q=80',
  },
  {
    label: 'Bomba Injetora / Turbo Diesel',
    url: 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=600&auto=format&fit=crop&q=80',
  },
];

function renderApprovalBadge(status: PartApprovalStatus) {
  if (status === 'aprovada') {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-[#16A34A] px-2.5 py-1 text-xs font-bold text-white shadow-2xs">
        <CheckCircle2 className="size-3.5" />
        Peça Aprovada
      </span>
    );
  }
  if (status === 'rejeitada') {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-[#DC2626] px-2.5 py-1 text-xs font-bold text-white shadow-2xs">
        <XCircle className="size-3.5" />
        Peça Rejeitada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-[#64748B] px-2.5 py-1 text-xs font-bold text-white shadow-2xs">
      <PauseCircle className="size-3.5" />
      Peça Suspensa
    </span>
  );
}

export function MerchantDashboard({
  bancaCode: propBancaCode,
  bancaName: propBancaName,
  vendorName,
}: MerchantDashboardProps) {
  const activeBancaCode = propBancaCode || 'PC-008';
  const activeBancaName = propBancaName || 'Banca #08 - Peças do Zé';

  // Online / Offline Banca Status
  const [isOnline, setIsOnline] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'queue' | 'handover' | 'inventory' | 'payouts' | 'tickets'
  >('queue');

  // Data from Backend
  const [walletBalanceKz, setWalletBalanceKz] = useState<number>(351000);
  const [pendingEscrowKz, setPendingEscrowKz] = useState<number>(0);
  const [inventory, setInventory] = useState<MerchantInventoryItem[]>([]);
  const [payouts, setPayouts] = useState<MerchantPayoutItem[]>([]);
  const [sampleQueue, setSampleQueue] = useState<IncomingSampleMatch[]>([]);
  const [orders, setOrders] = useState<MerchantOrderRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  // Local status overrides & filter for Peças Aprovadas (#16A34A), Rejeitadas (#DC2626), Suspensas (#64748B)
  const [inventoryStatusBySku, setInventoryStatusBySku] = useState<
    Record<string, PartApprovalStatus>
  >({});
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<
    'todas' | PartApprovalStatus
  >('todas');
  const [matchStatusOverride, setMatchStatusOverride] = useState<
    Record<string, PartApprovalStatus>
  >({});

  // Instant Split Payout Notification Banner
  const [latestSplitAlert, setLatestSplitAlert] = useState<MerchantPayoutItem | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Per-Match Quote Linking State
  const [selectedSkuByMatch, setSelectedSkuByMatch] = useState<Record<string, string>>({});
  const [quotePriceByMatch, setQuotePriceByMatch] = useState<Record<string, string>>({});
  const [quoteConditionByMatch, setQuoteConditionByMatch] = useState<
    Record<string, 'nova' | 'recondicionada'>
  >({});
  const [submittingMatchCode, setSubmittingMatchCode] = useState<string | null>(null);

  // Per-Order OTP Handover Verification State
  const [otpInputByOrder, setOtpInputByOrder] = useState<Record<string, string>>({});
  const [verifyingOrderCode, setVerifyingOrderCode] = useState<string>('');

  // Voice Call State: Banca -> Estafeta que aceitou a recolha
  const [activeDriverCall, setActiveDriverCall] = useState<{
    orderCode: string;
    driverName: string;
    driverCode: string;
    driverPhone: string;
    driverVehicle: string;
  } | null>(null);
  const [callPhase, setCallPhase] = useState<'ringing' | 'connected'>('connected');
  const [callSeconds, setCallSeconds] = useState<number>(0);
  const [isCallMuted, setIsCallMuted] = useState<boolean>(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);
  const [quickDriverNoteSent, setQuickDriverNoteSent] = useState<string | null>(null);
  const [driverCallReply, setDriverCallReply] = useState<string | null>(null);

  useEffect(() => {
    if (!activeDriverCall) {
      setCallSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setCallSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [activeDriverCall]);

  // Inventory Upload Form State
  const [partCondition, setPartCondition] = useState<'nova' | 'recondicionada'>('nova');
  const [partGrade, setPartGrade] = useState<'Grau A' | 'Grau B'>('Grau A');
  const [partCategory, setPartCategory] = useState<string>('Alternador');
  const [partName, setPartName] = useState<string>('');
  const [partBrand, setPartBrand] = useState<string>('');
  const [partPriceKz, setPartPriceKz] = useState<string>('');
  const [partStockQty, setPartStockQty] = useState<string>('3');
  const [partCompatibility, setPartCompatibility] = useState<string>('');
  const [partPhotoUrl, setPartPhotoUrl] = useState<string>(PRACA_CAMERA_PRESETS[0].url);
  const [uploadingPart, setUploadingPart] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setFeedbackToast({ type, message });
    setTimeout(() => {
      setFeedbackToast((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  }, []);

  const handleStartCallToDriver = useCallback(
    (driverInfo: {
      orderCode: string;
      driverName: string;
      driverCode: string;
      driverPhone: string;
      driverVehicle: string;
    }) => {
      setActiveDriverCall(driverInfo);
      setCallSeconds(0);
      setIsCallMuted(false);
      setIsSpeakerOn(true);
      setQuickDriverNoteSent(null);
      setDriverCallReply(null);
      setCallPhase('ringing');

      kitingoCallAudio.playDialAndConnectSound(() => {
        setCallPhase('connected');
        setDriverCallReply(getSimulatedVoiceReply('ESTAFETA'));
      });

      showToast(
        'success',
        `A ligar para o estafeta ${driverInfo.driverName} (${driverInfo.driverPhone}) — Recolha #${driverInfo.orderCode}`
      );
    },
    [showToast]
  );

  const handleEndCallToDriver = useCallback(() => {
    kitingoCallAudio.playHangupTone();
    setActiveDriverCall(null);
    setQuickDriverNoteSent(null);
    setDriverCallReply(null);
  }, []);

  const formatCallTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/merchant/dashboard?bancaCode=${encodeURIComponent(activeBancaCode)}`
      );
      const data = await res.json();
      if (data) {
        if (typeof data.walletBalanceKz === 'number') {
          setWalletBalanceKz(data.walletBalanceKz);
        }
        if (typeof data.pendingEscrowKz === 'number') {
          setPendingEscrowKz(data.pendingEscrowKz);
        }

        const rawInventory: any[] = data.inventory || [];
        const normalizedInventory: MerchantInventoryItem[] = rawInventory.map(
          (row: any, idx: number) => {
            const sku = row.sku || row.partCode || `BZ-080${idx + 1}`;
            const defaultStatus: PartApprovalStatus =
              idx === 2 ? 'suspensa' : idx === 3 ? 'rejeitada' : 'aprovada';
            return {
              id: row.id || idx + 1,
              sku,
              bancaCode: row.bancaCode || activeBancaCode,
              bancaName: row.bancaName || activeBancaName,
              partName: row.partName || row.name || 'Peça Auto Kitingo',
              category: row.category || 'Motor',
              condition:
                row.condition === 'nova' ? 'nova' : 'recondicionada',
              grade: row.grade || row.conditionGrade || 'Grau A',
              brand: row.brand || 'OEM Original',
              priceKz: Number(row.priceKz ?? row.price ?? 65000),
              stockQty: Number(row.stockQty ?? row.inStock ?? 2),
              compatibility: row.compatibility || 'Toyota Hilux / Prado',
              warrantyLabel:
                row.warrantyLabel || 'Garantia de Teste 72h · Peça Lacrada',
              photoUrl:
                row.photoUrl ||
                row.image ||
                PRACA_CAMERA_PRESETS[idx % PRACA_CAMERA_PRESETS.length].url,
              approvalStatus: defaultStatus,
              createdAt: row.createdAt || new Date().toISOString(),
            };
          }
        );
        setInventory(normalizedInventory);

        const rawPayouts: any[] = data.payouts || [];
        const normalizedPayouts: MerchantPayoutItem[] = rawPayouts.map(
          (p: any, idx: number) => ({
            id: p.id || idx + 1,
            payoutCode: p.payoutCode || `SP-880${idx + 1}`,
            orderCode: p.orderCode || `CE-65001${idx}`,
            bancaCode: p.bancaCode || activeBancaCode,
            bancaName: p.bancaName || activeBancaName,
            grossAmountKz: Number(p.grossAmountKz ?? p.grossAmount ?? 95000),
            platformFeeKz: Number(
              p.platformFeeKz ?? p.platformSplitAmount ?? 9500
            ),
            netPayoutKz: Number(p.netPayoutKz ?? p.netBancaAmount ?? 85500),
            handoverOtp: p.handoverOtp || '0018',
            driverName: p.driverName || 'Paulo Sebastião',
            status: p.status || 'liquidado',
            createdAt: p.createdAt || new Date().toISOString(),
          })
        );
        setPayouts(normalizedPayouts);

        const rawMatches: any[] = data.sampleMatches || data.matchQueue || [];
        const normalizedMatches: IncomingSampleMatch[] = rawMatches.map(
          (m: any, idx: number) => {
            const rawStatus = String(m.status || '');
            let approvalStatus: PartApprovalStatus = 'aprovada';
            if (rawStatus.includes('rejeitad')) {
              approvalStatus = 'rejeitada';
            } else if (rawStatus.includes('suspens') || rawStatus.includes('aguarda')) {
              approvalStatus = 'suspensa';
            } else if (idx === 1 && !rawStatus.includes('cotacao')) {
              approvalStatus = 'suspensa';
            }

            const quotes: SampleMatchVendorQuote[] = Array.isArray(m.vendorQuotes)
              ? m.vendorQuotes.map((q: any) => ({
                  bancaCode: q.bancaCode || activeBancaCode,
                  bancaName: q.bancaName || activeBancaName,
                  condition: q.condition === 'nova' ? 'nova' : 'recondicionada',
                  priceKz: Number(q.priceKz ?? q.price ?? 74000),
                  warrantyLabel:
                    q.warrantyLabel || 'Garantia de Teste 72h · Peça Lacrada',
                  partName: q.partName || q.brand,
                  linkedSku: q.linkedSku || q.productId,
                  etaMinutes: q.etaMinutes || 25,
                }))
              : [];

            return {
              id: m.id || idx + 1,
              matchCode: m.matchCode || `MA-841${idx}`,
              customerPhone: m.customerPhone || '+244 924 514 042',
              customerName: m.customerName || 'Cliente Kitingo',
              vehicleModel: m.vehicleModel || 'Toyota Hilux 2.8 GD-6',
              vehicleYear: m.vehicleYear || '2020',
              partCategory: m.partCategory || 'Alternador / Motor',
              preferredCondition: m.preferredCondition || 'Todos',
              notes: m.notes || m.partNotes || null,
              photos: Array.isArray(m.photos) && m.photos.length > 0
                ? m.photos
                : [
                    '/products/bateria.png',
                    '/products/vela-ignicao.png',
                  ],
              status: m.status || 'cotacao_recebida',
              approvalStatus,
              vendorQuotes: quotes,
              createdAt: m.createdAt
                ? new Date(m.createdAt).toISOString()
                : new Date().toISOString(),
            };
          }
        );
        setSampleQueue(normalizedMatches);

        const rawOrders: any[] = data.orders || [];
        const payoutByOrder: Record<string, MerchantPayoutItem> = {};
        for (const p of normalizedPayouts) {
          payoutByOrder[p.orderCode] = p;
        }

        const normalizedOrders: MerchantOrderRecord[] = rawOrders.map(
          (o: any, idx: number) => {
            const orderCode = o.orderCode || o.id || `CE-6500${idx + 10}`;
            const handoverCompleted =
              Boolean(o.handoverCompleted) ||
              o.status === 'entregue_estafeta' ||
              Boolean(payoutByOrder[orderCode]);
            return {
              id: o.id || idx + 1,
              orderCode,
              customerPhone: o.customerPhone || '+244 924 514 042',
              customerName: o.customerName || 'Cliente Kitingo',
              deliveryAddress: o.deliveryAddress || o.location || 'Maianga, Luanda',
              vehicleNote: o.vehicleNote || null,
              paymentMethod: o.paymentMethod || 'EMIS Multicaixa Express',
              emisReference: o.emisReference || o.reference || '904 112 884',
              totalAmount: Number(o.totalAmount ?? o.amount ?? 97900),
              status: o.status || 'pago_escrow',
              items: Array.isArray(o.items)
                ? o.items.map((it: any) => ({
                    id: it.id || 'item-1',
                    name: it.name || 'Peça Auto Praça dos Correios',
                    brand: it.brand || 'OEM Original',
                    price: Number(it.price ?? 48950),
                    quantity: Number(it.quantity ?? 1),
                    condition: it.condition === 'nova' ? 'nova' : 'recondicionada',
                  }))
                : [],
              expectedHandoverOtp: o.expectedHandoverOtp || '0018',
              handoverCompleted,
              driverName: o.driverName || 'Paulo Sebastião',
              driverCode: o.driverCode || 'EST-019',
              driverPhone: o.driverPhone || '+244 931 880 210',
              driverVehicle: o.driverVehicle || 'Motorizada 150cc · Matrícula LD-44-92-AO',
              payoutRecord: o.payoutRecord || payoutByOrder[orderCode] || null,
              createdAt: o.createdAt
                ? new Date(o.createdAt).toISOString()
                : new Date().toISOString(),
            };
          }
        );
        setOrders(normalizedOrders);
      }
    } catch {
      // Keep current state on transient network failure
    } finally {
      setLoading(false);
    }
  }, [activeBancaCode, activeBancaName]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Connect to real-time WebSocket for live customer sample matches, new orders, and split payouts
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(wsUrl);
      socket.onopen = () => {
        setWsConnected(true);
      };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (
            payload.type === 'match:created' ||
            payload.type === 'match:updated' ||
            payload.type === 'inventory:created'
          ) {
            fetchDashboardData();
          } else if (payload.type === 'payout:created' && payload.payout) {
            const p = payload.payout;
            setLatestSplitAlert({
              id: p.id || Date.now(),
              payoutCode: p.payoutCode,
              orderCode: p.orderCode,
              bancaCode: p.bancaCode,
              bancaName: p.bancaName,
              grossAmountKz: Number(p.grossAmount ?? p.grossAmountKz ?? 0),
              platformFeeKz: Number(p.platformSplitAmount ?? p.platformFeeKz ?? 0),
              netPayoutKz: Number(p.netBancaAmount ?? p.netPayoutKz ?? 0),
              handoverOtp: p.handoverOtp,
              driverName: p.driverName,
              status: 'liquidado',
              createdAt: new Date().toISOString(),
            });
            fetchDashboardData();
          } else if (payload.type === 'delivery:completed') {
            setOrders((prev) =>
              prev.map((o) =>
                o.orderCode === (payload.orderCode || 'CE-650018')
                  ? { ...o, status: 'entregue_cliente', handoverCompleted: true }
                  : o
              )
            );
            showToast(
              'success',
              `Peça do Pedido #${payload.orderCode || 'CE-650018'} entregue com sucesso ao comprador ${payload.customerName || 'João Manuel Baptista'}! Escrow libertado.`
            );
            fetchDashboardData();
          }
        } catch {
          // Ignore malformed WS frame
        }
      };
      socket.onclose = () => {
        setWsConnected(false);
      };
    } catch {
      setWsConnected(false);
    }

    return () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [fetchDashboardData]);

  // Initialize default selected inventory SKU for each sample match
  useEffect(() => {
    if (inventory.length === 0 || sampleQueue.length === 0) return;

    setSelectedSkuByMatch((prev) => {
      const next = { ...prev };
      for (const match of sampleQueue) {
        if (!next[match.matchCode]) {
          const matchingCategoryItem =
            inventory.find(
              (item) =>
                item.category.toLowerCase().includes(match.partCategory.toLowerCase()) ||
                match.partCategory.toLowerCase().includes(item.category.toLowerCase())
            ) || inventory[0];

          if (matchingCategoryItem) {
            next[match.matchCode] = matchingCategoryItem.sku;
          }
        }
      }
      return next;
    });

    setQuotePriceByMatch((prev) => {
      const next = { ...prev };
      for (const match of sampleQueue) {
        if (!next[match.matchCode]) {
          const matchingCategoryItem =
            inventory.find(
              (item) =>
                item.category.toLowerCase().includes(match.partCategory.toLowerCase()) ||
                match.partCategory.toLowerCase().includes(item.category.toLowerCase())
            ) || inventory[0];
          if (matchingCategoryItem) {
            next[match.matchCode] = String(matchingCategoryItem.priceKz);
          }
        }
      }
      return next;
    });

    setQuoteConditionByMatch((prev) => {
      const next = { ...prev };
      for (const match of sampleQueue) {
        if (!next[match.matchCode]) {
          const matchingCategoryItem =
            inventory.find(
              (item) =>
                item.category.toLowerCase().includes(match.partCategory.toLowerCase()) ||
                match.partCategory.toLowerCase().includes(item.category.toLowerCase())
            ) || inventory[0];
          next[match.matchCode] = matchingCategoryItem?.condition || 'recondicionada';
        }
      }
      return next;
    });
  }, [inventory, sampleQueue]);

  function handleSelectInventoryForMatch(matchCode: string, sku: string) {
    setSelectedSkuByMatch((prev) => ({ ...prev, [matchCode]: sku }));
    const item = inventory.find((i) => i.sku === sku);
    if (item) {
      setQuotePriceByMatch((prev) => ({ ...prev, [matchCode]: String(item.priceKz) }));
      setQuoteConditionByMatch((prev) => ({ ...prev, [matchCode]: item.condition }));
    }
  }

  async function handleRespondSampleMatch(
    match: IncomingSampleMatch,
    action: 'accept' | 'reject' | 'suspend'
  ) {
    if (!isOnline) {
      showToast('error', 'Ative o estado "Banca Online" no topo para responder a pedidos.');
      return;
    }

    const selectedSku = selectedSkuByMatch[match.matchCode];
    const linkedItem = inventory.find((i) => i.sku === selectedSku);
    const priceNum = Number(quotePriceByMatch[match.matchCode] || linkedItem?.priceKz || 85000);
    const condition =
      quoteConditionByMatch[match.matchCode] || linkedItem?.condition || 'recondicionada';

    setSubmittingMatchCode(match.matchCode);
    try {
      const res = await fetch(
        `/api/merchant/match-amostra/${encodeURIComponent(match.matchCode)}/respond`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: action === 'accept' ? 'link_part' : action,
            bancaCode: activeBancaCode,
            bancaName: activeBancaName,
            partCode: linkedItem?.sku,
            partName: linkedItem?.partName || `${match.partCategory} (${match.vehicleModel})`,
            condition: condition === 'nova' ? 'nova' : 'ocasiao',
            conditionGrade: linkedItem?.grade || 'Grau A',
            brand: linkedItem?.brand || 'Denso Original',
            price: priceNum,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao atualizar pedido Match por Amostra.');
      }

      if (action === 'accept') {
        setMatchStatusOverride((prev) => ({ ...prev, [match.matchCode]: 'aprovada' }));
        showToast(
          'success',
          `Peça Aprovada! Cotação enviada (${formatKz(priceNum)}) para o pedido ${match.matchCode}.`
        );
      } else if (action === 'reject') {
        setMatchStatusOverride((prev) => ({ ...prev, [match.matchCode]: 'rejeitada' }));
        showToast('error', `Peça Rejeitada (Sem Stock) para o pedido ${match.matchCode}.`);
      } else {
        setMatchStatusOverride((prev) => ({ ...prev, [match.matchCode]: 'suspensa' }));
        showToast('success', `Peça Suspensa (Em verificação técnica) para o pedido ${match.matchCode}.`);
      }
      await fetchDashboardData();
    } catch (err: any) {
      showToast('error', err.message || 'Erro ao comunicar com a Praça dos Correios.');
    } finally {
      setSubmittingMatchCode(null);
    }
  }

  async function handleVerifyHandoverOtp(order: MerchantOrderRecord) {
    const rawOtp = (otpInputByOrder[order.orderCode] || '').replace(/\D/g, '').slice(0, 4);
    if (rawOtp.length !== 4) {
      showToast('error', 'Introduza os 4 dígitos do código OTP do estafeta.');
      return;
    }

    setVerifyingOrderCode(order.orderCode);
    try {
      const res = await fetch(
        `/api/merchant/orders/${encodeURIComponent(order.orderCode)}/verify-handover`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            otp: rawOtp,
            bancaCode: activeBancaCode,
            bancaName: activeBancaName,
            driverName: 'Paulo Sebastião (Motorizada LD-44-92-AO)',
            grossAmount: order.totalAmount,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Código OTP incorreto.');
      }

      const p = data.payout;
      const alertObj: MerchantPayoutItem = {
        id: p.id || Date.now(),
        payoutCode: p.payoutCode,
        orderCode: p.orderCode,
        bancaCode: p.bancaCode,
        bancaName: p.bancaName,
        grossAmountKz: Number(p.grossAmount ?? p.grossAmountKz ?? order.totalAmount),
        platformFeeKz: Number(p.platformSplitAmount ?? p.platformFeeKz ?? Math.round(order.totalAmount * 0.1)),
        netPayoutKz: Number(p.netBancaAmount ?? p.netPayoutKz ?? Math.round(order.totalAmount * 0.9)),
        handoverOtp: p.handoverOtp || rawOtp,
        driverName: p.driverName || 'Paulo Sebastião',
        status: 'liquidado',
        createdAt: new Date().toISOString(),
      };

      setLatestSplitAlert(alertObj);
      showToast(
        'success',
        `OTP validado! Split de ${formatKz(alertObj.netPayoutKz)} creditado na carteira da banca.`
      );
      await fetchDashboardData();
    } catch (err: any) {
      showToast('error', err.message || 'Falha ao validar código OTP de recolha.');
    } finally {
      setVerifyingOrderCode('');
    }
  }

  function handleCameraFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPartPhotoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleAddInventorySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!partName.trim()) {
      showToast('error', 'Informe o nome da peça para publicar no catálogo da banca.');
      return;
    }
    const cleanPrice = Number(partPriceKz.replace(/\D/g, ''));
    if (!cleanPrice || cleanPrice <= 0) {
      showToast('error', 'Informe um preço válido em Kwanzas (AOA).');
      return;
    }

    setUploadingPart(true);
    try {
      const res = await fetch('/api/merchant/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bancaCode: activeBancaCode,
          bancaName: activeBancaName,
          name: partName.trim(),
          category: partCategory,
          condition: partCondition === 'nova' ? 'nova' : 'ocasiao',
          conditionGrade: partCondition === 'recondicionada' ? partGrade : 'Na Caixa',
          brand: partBrand.trim() || (partCondition === 'nova' ? 'OEM Genuine' : 'Original Testada'),
          price: cleanPrice,
          inStock: Number(partStockQty) || 1,
          compatibility: partCompatibility.trim() || 'Toyota Hilux / Land Cruiser Prado',
          image: partPhotoUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao publicar peça.');
      }

      const createdPart = data.part || data.item;
      setPartName('');
      setPartBrand('');
      setPartPriceKz('');
      setPartCompatibility('');
      showToast(
        'success',
        `Peça "${createdPart?.name || partName}" publicada como Aprovada no stock da ${activeBancaName}!`
      );
      await fetchDashboardData();
    } catch (err: any) {
      showToast('error', err.message || 'Erro ao carregar peça para o inventário.');
    } finally {
      setUploadingPart(false);
    }
  }

  // Enrich inventory items with any merchant status overrides
  const enrichedInventory = useMemo(() => {
    return inventory.map((item) => ({
      ...item,
      approvalStatus: inventoryStatusBySku[item.sku] || item.approvalStatus || 'aprovada',
    }));
  }, [inventory, inventoryStatusBySku]);

  const filteredInventory = useMemo(() => {
    if (inventoryStatusFilter === 'todas') return enrichedInventory;
    return enrichedInventory.filter((i) => i.approvalStatus === inventoryStatusFilter);
  }, [enrichedInventory, inventoryStatusFilter]);

  const inventoryCounts = useMemo(() => {
    return {
      aprovadas: enrichedInventory.filter((i) => i.approvalStatus === 'aprovada').length,
      rejeitadas: enrichedInventory.filter((i) => i.approvalStatus === 'rejeitada').length,
      suspensas: enrichedInventory.filter((i) => i.approvalStatus === 'suspensa').length,
    };
  }, [enrichedInventory]);

  const pendingMatchesCount = useMemo(
    () => sampleQueue.filter((m) => m.status !== 'rejeitado').length,
    [sampleQueue]
  );

  const pendingHandoverCount = useMemo(
    () => orders.filter((o) => !o.handoverCompleted).length,
    [orders]
  );

  return (
    <div className="min-h-dvh bg-background text-foreground pb-20">
      {/* 1. COMPACT BRAND HEADER (Standardized with AppHeader in App Comprador) */}
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
                  Kitingo <span className="text-brand-accent">Correios</span>
                </p>
                <span className="rounded-md bg-primary-foreground/15 px-2 py-0.5 font-mono text-xs font-bold text-brand-accent">
                  {activeBancaCode}
                </span>
                {wsConnected && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#16A34A] px-2 py-0.5 text-[10px] font-semibold text-white">
                    <span className="size-1.5 rounded-full bg-white animate-pulse" />
                    Praça Live
                  </span>
                )}
              </div>
              <p className="text-xs text-primary-foreground/80">
                {activeBancaName} {vendorName ? `· ${vendorName}` : ''} — O Mercado dos Correios no Telemóvel
              </p>
            </div>
          </div>

          {/* Interactive Online / Offline Status Toggle + Quick Call to Assigned Estafeta */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary-foreground/10 px-3 py-1.5 sm:justify-end">
            <button
              type="button"
              onClick={() =>
                handleStartCallToDriver({
                  orderCode: orders[0]?.orderCode || 'CE-650018',
                  driverName: orders[0]?.driverName || 'Paulo Sebastião',
                  driverCode: `#${orders[0]?.driverCode || 'EST-019'}`,
                  driverPhone: orders[0]?.driverPhone || '+244 931 880 210',
                  driverVehicle:
                    orders[0]?.driverVehicle || 'Motorizada 150cc · Matrícula LD-44-92-AO',
                })
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#D97706] px-3 text-xs font-bold text-white shadow-xs hover:opacity-95 transition active:scale-95 cursor-pointer"
            >
              <PhoneCall className="size-3.5" />
              <span>Ligar ao Estafeta (+244 931 880 210)</span>
            </button>

            <div className="flex items-center gap-2">
              <span
                className={`size-2.5 rounded-full ${
                  isOnline ? 'bg-[#16A34A]' : 'bg-[#DC2626]'
                }`}
              />
              <span className="text-xs font-bold text-primary-foreground">
                {isOnline ? 'Banca Online · Aberta' : 'Banca Offline · Pausada'}
              </span>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={isOnline}
              onClick={() => {
                const next = !isOnline;
                setIsOnline(next);
                showToast(
                  next ? 'success' : 'error',
                  next
                    ? `${activeBancaName} está agora ONLINE para receber pedidos e Match por Amostra.`
                    : `${activeBancaName} colocada em modo OFFLINE temporário.`
                );
              }}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold shadow-xs transition-transform active:scale-95 cursor-pointer ${
                isOnline
                  ? 'bg-brand-accent text-brand-accent-foreground hover:bg-brand-accent/90'
                  : 'bg-card text-foreground hover:bg-secondary'
              }`}
            >
              <Power className="size-3.5" />
              <span>{isOnline ? 'Pausar' : 'Ativar Banca'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT ON CLEAN LIGHT BACKGROUND */}
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-4">
        {/* 3 TOP KPI BANNERS WITH CUSTOM HEX COLORS (#16A34A, #D97706, #7C3AED) */}
        <section
          aria-label="Resumo Financeiro e Fila da Banca"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          {/* 1. Banner de Saldo Disponível -> #16A34A */}
          <div className="rounded-2xl border border-[#16A34A] bg-[#16A34A] p-4 text-white shadow-sm">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-white">
                <Wallet className="size-4 text-white" />
                Saldo Disponível (Carteira)
              </span>
              <span className="rounded-md bg-white/20 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                Split 90% Automático
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black tracking-tight text-white tabular-nums">
              {formatKz(walletBalanceKz)}
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-white/90">
              <span>Liquidação Instantânea Multicaixa / IBAN</span>
              <span className="font-mono font-bold text-white flex items-center gap-0.5">
                AOA <ArrowUpRight className="size-3.5" />
              </span>
            </div>
          </div>

          {/* 2. Banner Cativo em Escrow -> #D97706 */}
          <div className="rounded-2xl border border-[#D97706] bg-[#D97706] p-4 text-white shadow-sm">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-white">
                <ShieldCheck className="size-4 text-white" />
                Cativo em Escrow (Zero Fiado)
              </span>
              <span className="rounded-md bg-white/20 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                {pendingHandoverCount} pendente(s)
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-black tracking-tight text-white tabular-nums">
              {formatKz(pendingEscrowKz)}
            </p>
            <p className="mt-2 text-xs text-white/90">
              Libertado para a carteira assim que validar o OTP do estafeta na recolha.
            </p>
          </div>

          {/* 3. Banner Fila Match -> #7C3AED */}
          <div className="rounded-2xl border border-[#7C3AED] bg-[#7C3AED] p-4 text-white shadow-sm">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-white">
                <Camera className="size-4 text-white" />
                Fila "Match por Amostra" & Stock
              </span>
              <button
                type="button"
                onClick={fetchDashboardData}
                className="inline-flex items-center gap-1 rounded-lg border border-white/30 bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/25 cursor-pointer"
              >
                <RefreshCw className="size-3" />
                Atualizar
              </button>
            </div>
            <div className="mt-2 flex items-baseline gap-5">
              <div>
                <p className="font-mono text-2xl sm:text-3xl font-black text-white tabular-nums">
                  {pendingMatchesCount}
                </p>
                <p className="text-[11px] text-white/85">Amostras na Fila</p>
              </div>
              <div className="h-8 w-px bg-white/25" />
              <div>
                <p className="font-mono text-2xl sm:text-3xl font-black text-white tabular-nums">
                  {inventory.length}
                </p>
                <p className="text-[11px] text-white/85">Peças Registadas</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-white/90">
              Sincronizado com a App Comprador em tempo real.
            </p>
          </div>
        </section>

        {/* PART STATUS SUMMARY BAR: Peças Aprovadas (#16A34A) | Peças Rejeitadas (#DC2626) | Peças Suspensas (#64748B) */}
        <section
          aria-label="Estado das Peças da Banca"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-xs"
        >
          <span className="text-xs font-bold text-foreground">
            Estado das Peças & Amostras na Banca:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A34A] px-3 py-1 text-xs font-bold text-white">
              <CheckCircle2 className="size-3.5" />
              Peças Aprovadas ({inventoryCounts.aprovadas})
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#DC2626] px-3 py-1 text-xs font-bold text-white">
              <XCircle className="size-3.5" />
              Peças Rejeitadas ({inventoryCounts.rejeitadas})
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#64748B] px-3 py-1 text-xs font-bold text-white">
              <PauseCircle className="size-3.5" />
              Peças Suspensas ({inventoryCounts.suspensas})
            </span>
          </div>
        </section>

        {/* Instant Split Payout Notification Banner (when OTP is verified) */}
        {latestSplitAlert && (
          <div className="rounded-2xl border-2 border-[#16A34A] bg-[#16A34A]/10 p-4 text-foreground shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#16A34A] text-white">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-[#16A34A] px-2 py-0.5 font-mono text-[11px] font-bold text-white uppercase">
                      SPLIT PAYOUT AUTOMÁTICO CONCLUÍDO
                    </span>
                    <span className="font-mono text-xs font-semibold text-[#16A34A]">
                      Recibo #{latestSplitAlert.payoutCode} · Encomenda #{latestSplitAlert.orderCode}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    Entrega confirmada via OTP ({latestSplitAlert.handoverOtp}) ao estafeta{' '}
                    {latestSplitAlert.driverName}.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Bruto EMIS: {formatKz(latestSplitAlert.grossAmountKz)} · Retenção Logística/Escrow (10%):{' '}
                    -{formatKz(latestSplitAlert.platformFeeKz)} ·{' '}
                    <strong className="text-[#16A34A] underline">
                      Crédito Líquido na Banca (90%): +{formatKz(latestSplitAlert.netPayoutKz)}
                    </strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLatestSplitAlert(null)}
                className="self-end sm:self-center rounded-lg bg-[#16A34A] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 cursor-pointer"
              >
                Fechar Recibo
              </button>
            </div>
          </div>
        )}

        {/* Feedback Toast */}
        {feedbackToast && (
          <div
            role="status"
            className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs font-bold text-white shadow-xs ${
              feedbackToast.type === 'success' ? 'bg-[#16A34A]' : 'bg-[#DC2626]'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackToast.type === 'success' ? (
                <CheckCircle2 className="size-4 shrink-0 text-white" />
              ) : (
                <AlertCircle className="size-4 shrink-0 text-white" />
              )}
              <span>{feedbackToast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackToast(null)}
              className="text-[11px] underline opacity-90 hover:opacity-100"
            >
              OK
            </button>
          </div>
        )}

        {/* PAINEL DE CHAMADA EM CURSO: BANCA <-> ESTAFETA QUE ACEITOU A RECOLHA */}
        {activeDriverCall && (
          <section
            aria-label="Chamada em Curso com o Estafeta"
            className="rounded-2xl border-2 border-[#D97706] bg-slate-900 p-4 text-white shadow-lg"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#D97706] text-white shadow-md animate-pulse">
                  <PhoneCall className="size-5" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-[#D97706]/25 px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider text-amber-300">
                      {callPhase === 'ringing'
                        ? `A CHAMAR ESTAFETA · RECOLHA #${activeDriverCall.orderCode}...`
                        : `CHAMADA DE VOZ CONECTADA · RECOLHA #${activeDriverCall.orderCode}`}
                    </span>
                    <span className="rounded-md bg-[#16A34A]/25 px-2 py-0.5 font-mono text-xs font-bold text-emerald-300 tabular-nums">
                      {formatCallTime(callSeconds)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-black text-white">
                    Estafeta: {activeDriverCall.driverName} ({activeDriverCall.driverCode})
                  </p>
                  <p className="font-mono text-xs text-slate-300">
                    {activeDriverCall.driverPhone} · {activeDriverCall.driverVehicle}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCallMuted((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition cursor-pointer ${
                    isCallMuted
                      ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                      : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {isCallMuted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                  {isCallMuted ? 'Som Desativado' : 'Microfone Ativo'}
                </button>

                <button
                  type="button"
                  onClick={() => setIsSpeakerOn((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition cursor-pointer ${
                    isSpeakerOn
                      ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                      : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <Volume2 className="size-3.5" />
                  {isSpeakerOn ? 'Altifalante Ativo' : 'Áudio Normal'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCallPhase('ringing');
                    setCallSeconds(0);
                    kitingoCallAudio.playDialAndConnectSound(() => {
                      setCallPhase('connected');
                      setDriverCallReply(getSimulatedVoiceReply('ESTAFETA'));
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3 py-2 text-xs font-bold text-white hover:opacity-90 cursor-pointer"
                >
                  <Phone className="size-3.5" />
                  Rediscar
                </button>

                <button
                  type="button"
                  onClick={handleEndCallToDriver}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#DC2626] px-3.5 py-2 text-xs font-black text-white hover:opacity-90 cursor-pointer"
                >
                  <PhoneOff className="size-3.5" />
                  Terminar
                </button>
              </div>
            </div>

            {driverCallReply && (
              <div className="mt-3 rounded-xl border border-emerald-500/30 bg-slate-950/90 p-3 text-xs font-medium text-emerald-300">
                🔊 {driverCallReply}
              </div>
            )}

            {/* Avisos Rápidos da Banca para o Estafeta */}
            <div className="mt-3 border-t border-slate-800 pt-3">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <MessageSquare className="size-3.5 text-amber-400" />
                Enviar instrução rápida ao estafeta ({activeDriverCall.driverName}):
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  'A peça já está separada e testada no balcão da banca, pode avançar.',
                  `Estamos no Corredor Central da Praça dos Correios (${activeBancaName}).`,
                  'Traga o código OTP de 4 dígitos pronto para libertarmos a recolha.',
                ].map((msg) => (
                  <button
                    key={msg}
                    type="button"
                    onClick={() => {
                      kitingoCallAudio.playMessageSentBeep();
                      setQuickDriverNoteSent(msg);
                      setDriverCallReply(getSimulatedVoiceReply('ESTAFETA', msg));
                      showToast(
                        'success',
                        `Aviso enviado ao estafeta ${activeDriverCall.driverName}: "${msg}"`
                      );
                    }}
                    className="rounded-lg border border-slate-700 bg-slate-800/90 px-2.5 py-1.5 text-left text-[11px] font-semibold text-slate-200 hover:border-amber-500/50 hover:text-white transition cursor-pointer"
                  >
                    “{msg}”
                  </button>
                ))}
              </div>
              {quickDriverNoteSent && (
                <p className="mt-2 text-xs font-semibold text-emerald-400">
                  ✓ Instrução transmitida ao estafeta: “{quickDriverNoteSent}”
                </p>
              )}
            </div>
          </section>
        )}

        {/* MODULE NAVIGATION PILLS */}
        <div
          role="tablist"
          aria-label="Módulos do Painel da Banca"
          className="grid grid-cols-2 gap-2 sm:grid-cols-5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'queue'}
            onClick={() => setActiveTab('queue')}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
              activeTab === 'queue'
                ? 'border-[#7C3AED] bg-[#7C3AED] text-white shadow-xs'
                : 'border-border bg-card text-foreground hover:bg-muted'
            }`}
          >
            <Camera className="size-4 shrink-0" />
            <span>Match por Amostra</span>
            <span
              className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                activeTab === 'queue'
                  ? 'bg-white/20 text-white'
                  : 'bg-[#7C3AED]/15 text-[#7C3AED]'
              }`}
            >
              {sampleQueue.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'handover'}
            onClick={() => setActiveTab('handover')}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
              activeTab === 'handover'
                ? 'border-[#D97706] bg-[#D97706] text-white shadow-xs'
                : 'border-border bg-card text-foreground hover:bg-muted'
            }`}
          >
            <KeyRound className="size-4 shrink-0" />
            <span>Recolha OTP & Split</span>
            <span
              className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                activeTab === 'handover'
                  ? 'bg-white/20 text-white'
                  : 'bg-[#D97706]/15 text-[#D97706]'
              }`}
            >
              {orders.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'inventory'}
            onClick={() => setActiveTab('inventory')}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
              activeTab === 'inventory'
                ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                : 'border-border bg-card text-foreground hover:bg-muted'
            }`}
          >
            <PackagePlus className="size-4 shrink-0" />
            <span>Carregar Peça / Stock</span>
            <span
              className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                activeTab === 'inventory'
                  ? 'bg-brand-accent text-brand-accent-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              {inventory.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'payouts'}
            onClick={() => setActiveTab('payouts')}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
              activeTab === 'payouts'
                ? 'border-[#16A34A] bg-[#16A34A] text-white shadow-xs'
                : 'border-border bg-card text-foreground hover:bg-muted'
            }`}
          >
            <DollarSign className="size-4 shrink-0" />
            <span>Extrato Split (AOA)</span>
            <span
              className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                activeTab === 'payouts'
                  ? 'bg-white/20 text-white'
                  : 'bg-[#16A34A]/15 text-[#16A34A]'
              }`}
            >
              {payouts.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tickets'}
            onClick={() => setActiveTab('tickets')}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
              activeTab === 'tickets'
                ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                : 'border-border bg-card text-foreground hover:bg-muted'
            }`}
          >
            <Headphones className="size-4 shrink-0" />
            <span>Tickets Back-Office</span>
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-xs">
            <RefreshCw className="mx-auto size-7 animate-spin text-primary" />
            <p className="mt-3 text-sm font-bold text-foreground">
              A sincronizar dados da {activeBancaName} na Praça dos Correios...
            </p>
          </div>
        ) : (
          <>
            {/* =====================================================================
                MODULE 2: INCOMING ORDERS & "MATCH POR AMOSTRA" QUEUE
            ===================================================================== */}
            {activeTab === 'queue' && (
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-[#7C3AED] uppercase">
                        <Camera className="size-4 text-[#7C3AED]" />
                        Fila da Praça dos Correios · Match Visual
                      </span>
                      <h2 className="mt-0.5 text-lg font-bold text-foreground">
                        Pedidos "Match por Amostra" (Fotos de Peças Antigas)
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Compare as fotos enviadas pelo cliente com o seu stock na banca e classifique
                        a peça como Aprovada (#16A34A), Rejeitada (#DC2626) ou Suspensa (#64748B).
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 self-start rounded-xl bg-[#7C3AED] px-3 py-1.5 font-mono text-xs font-bold text-white">
                      <Clock className="size-3.5" />
                      SLA Praça: Resposta em &lt; 3 min
                    </span>
                  </div>
                </div>

                {sampleQueue.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-xs">
                    <p className="text-sm font-bold text-muted-foreground">
                      Nenhuma amostra pendente neste momento.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {sampleQueue.map((match) => {
                      const selectedSku = selectedSkuByMatch[match.matchCode] || '';
                      const selectedItem = inventory.find((i) => i.sku === selectedSku);
                      const currentCondition =
                        quoteConditionByMatch[match.matchCode] ||
                        selectedItem?.condition ||
                        'recondicionada';
                      const currentPrice =
                        quotePriceByMatch[match.matchCode] ||
                        String(selectedItem?.priceKz || 85000);

                      const existingBancaQuote = match.vendorQuotes?.find(
                        (q) => q.bancaCode === activeBancaCode
                      );

                      const effectiveApprovalStatus: PartApprovalStatus =
                        matchStatusOverride[match.matchCode] ||
                        (match.status === 'rejeitado'
                          ? 'rejeitada'
                          : match.status === 'suspensa'
                            ? 'suspensa'
                            : existingBancaQuote
                              ? 'aprovada'
                              : match.approvalStatus);

                      return (
                        <article
                          key={match.matchCode}
                          className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs"
                        >
                          {/* Match Top Bar */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-lg bg-[#7C3AED] px-2.5 py-1 font-mono text-xs font-bold text-white">
                                #{match.matchCode}
                              </span>
                              <span className="rounded-lg bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground">
                                {match.vehicleModel} ({match.vehicleYear})
                              </span>
                              <span className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
                                Categoria: {match.partCategory}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {renderApprovalBadge(effectiveApprovalStatus)}
                              {existingBancaQuote && effectiveApprovalStatus === 'aprovada' && (
                                <span className="rounded-lg bg-[#16A34A]/15 px-2.5 py-1 font-mono text-xs font-bold text-[#16A34A]">
                                  {formatKz(existingBancaQuote.priceKz)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-5 p-4 lg:grid-cols-12">
                            {/* Left Column: Customer Old Part Photos + Vehicle & Notes */}
                            <div className="lg:col-span-6 space-y-3">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>
                                  Cliente:{' '}
                                  <strong className="text-foreground">
                                    {match.customerName || 'Oficina / Comprador Kitingo'}
                                  </strong>{' '}
                                  ({match.customerPhone || '+244 924 514 042'})
                                </span>
                                <span className="uppercase font-mono text-[11px] font-bold text-[#7C3AED]">
                                  Preferência: {match.preferredCondition}
                                </span>
                              </div>

                              {/* 2-3 Photos of the Customer's Old Car Part */}
                              <div>
                                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Fotos da Peça Antiga / Amostra ({match.photos.length} fotos):
                                </p>
                                <div className="grid grid-cols-3 gap-2.5">
                                  {match.photos.map((photoUrl, idx) => (
                                    <div
                                      key={idx}
                                      className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
                                    >
                                      <img
                                        src={photoUrl}
                                        alt={`Amostra ${match.matchCode} ângulo ${idx + 1}`}
                                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                      />
                                      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                                        Foto #{idx + 1}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Customer / Mechanic Technical Note */}
                              <div className="rounded-xl border border-border bg-muted/40 p-3">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Observações Técnicas do Cliente / Mecânico:
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-foreground">
                                  {match.notes ||
                                    'Verificar compatibilidade da furação e ficha elétrica antes de enviar para o estafeta.'}
                                </p>
                              </div>
                            </div>

                            {/* Right Column: Merchant Action Controls (Link Inventory Item + Condition + Price + Aprovada / Suspensa / Rejeitada) */}
                            <div className="lg:col-span-6 flex flex-col justify-between rounded-xl border border-border bg-muted/30 p-4 space-y-4">
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                                    <Link2 className="size-4 text-[#7C3AED]" />
                                    Vincular Peça do Inventário da Banca
                                  </span>
                                  <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                                    {activeBancaCode}
                                  </span>
                                </div>

                                {/* Inventory Selector Dropdown */}
                                <div>
                                  <label className="mb-1 block text-xs font-semibold text-foreground">
                                    Selecionar Peça em Stock ({activeBancaName})
                                  </label>
                                  <select
                                    value={selectedSku}
                                    onChange={(e) =>
                                      handleSelectInventoryForMatch(match.matchCode, e.target.value)
                                    }
                                    className="h-11 w-full rounded-xl border border-input bg-card px-3 text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
                                  >
                                    {inventory.map((item) => (
                                      <option key={item.sku} value={item.sku}>
                                        [{item.sku}] {item.partName} —{' '}
                                        {item.condition === 'nova'
                                          ? 'NOVA (Caixa)'
                                          : `OCASIÃO (${item.grade || 'Grau A'})`}{' '}
                                        — {formatKz(item.priceKz)} ({item.stockQty} un.)
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Condition Switch & Custom Price Input */}
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <div>
                                    <label className="mb-1 block text-xs font-semibold text-foreground">
                                      Condição da Peça Cotada
                                    </label>
                                    <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-card p-1">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setQuoteConditionByMatch((prev) => ({
                                            ...prev,
                                            [match.matchCode]: 'nova',
                                          }))
                                        }
                                        className={`rounded-lg py-2 text-xs font-bold transition-colors cursor-pointer ${
                                          currentCondition === 'nova'
                                            ? 'bg-[#16A34A] text-white'
                                            : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                      >
                                        🆕 Nova
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setQuoteConditionByMatch((prev) => ({
                                            ...prev,
                                            [match.matchCode]: 'recondicionada',
                                          }))
                                        }
                                        className={`rounded-lg py-2 text-xs font-bold transition-colors cursor-pointer ${
                                          currentCondition === 'recondicionada'
                                            ? 'bg-[#D97706] text-white'
                                            : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                      >
                                        🔄 Ocasião 72h
                                      </button>
                                    </div>
                                  </div>

                                  <div>
                                    <label className="mb-1 block text-xs font-semibold text-foreground">
                                      Preço da Oferta (Kwanzas - AOA)
                                    </label>
                                    <div className="flex items-center overflow-hidden rounded-xl border border-input bg-card">
                                      <input
                                        type="number"
                                        min={1000}
                                        step={500}
                                        value={currentPrice}
                                        onChange={(e) =>
                                          setQuotePriceByMatch((prev) => ({
                                            ...prev,
                                            [match.matchCode]: e.target.value,
                                          }))
                                        }
                                        className="h-11 w-full bg-transparent px-3 font-mono text-sm font-bold text-foreground tabular-nums focus:outline-none"
                                      />
                                      <span className="border-l border-border bg-muted px-3 font-mono text-xs font-bold text-foreground">
                                        Kz
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Preview of Split Payout for this Quote */}
                                <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-xs">
                                  <span className="text-muted-foreground">
                                    Valor líquido na carteira após recolha (90%):
                                  </span>
                                  <span className="font-mono font-bold text-[#16A34A] tabular-nums">
                                    {formatKz(Math.round((Number(currentPrice) || 0) * 0.9))}
                                  </span>
                                </div>
                              </div>

                              {/* Action Buttons with Exact Requested Hex Colors: Aprovada (#16A34A) | Suspensa (#64748B) | Rejeitada (#DC2626) */}
                              <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-3">
                                <button
                                  type="button"
                                  disabled={submittingMatchCode === match.matchCode}
                                  onClick={() => handleRespondSampleMatch(match, 'accept')}
                                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#16A34A] px-3 py-2.5 text-xs font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                                >
                                  <CheckCircle2 className="size-4 shrink-0" />
                                  <span>Aprovar Peça</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={submittingMatchCode === match.matchCode}
                                  onClick={() => handleRespondSampleMatch(match, 'suspend')}
                                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#64748B] px-3 py-2.5 text-xs font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                                >
                                  <PauseCircle className="size-4 shrink-0" />
                                  <span>Suspender Peça</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={submittingMatchCode === match.matchCode}
                                  onClick={() => handleRespondSampleMatch(match, 'reject')}
                                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#DC2626] px-3 py-2.5 text-xs font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                                >
                                  <XCircle className="size-4 shrink-0" />
                                  <span>Rejeitar Peça</span>
                                </button>
                              </div>

                              {/* Se a peça já foi aprovada, permitir à Banca ligar diretamente ao Estafeta que aceitou a recolha */}
                              {effectiveApprovalStatus === 'aprovada' && (
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#D97706]/40 bg-[#D97706]/10 px-3 py-2.5 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#D97706] text-white">
                                      <Bike className="size-3.5" />
                                    </span>
                                    <div>
                                      <p className="font-bold text-foreground">
                                        Estafeta Designado: Paulo Sebastião (#EST-019)
                                      </p>
                                      <p className="font-mono text-[11px] text-muted-foreground">
                                        +244 931 880 210 · A caminho da {activeBancaName}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleStartCallToDriver({
                                          orderCode: match.matchCode,
                                          driverName: 'Paulo Sebastião',
                                          driverCode: '#EST-019',
                                          driverPhone: '+244 931 880 210',
                                          driverVehicle: 'Motorizada 150cc · Matrícula LD-44-92-AO',
                                        })
                                      }
                                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#D97706] px-2.5 py-1.5 text-xs font-bold text-white hover:opacity-90 cursor-pointer"
                                    >
                                      <PhoneCall className="size-3.5" />
                                      Ligar ao Estafeta
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleStartCallToDriver({
                                          orderCode: match.matchCode,
                                          driverName: 'Paulo Sebastião',
                                          driverCode: '#EST-019',
                                          driverPhone: '+244 931 880 210',
                                          driverVehicle: 'Motorizada 150cc · Matrícula LD-44-92-AO',
                                        })
                                      }
                                      title="Iniciar chamada para o Estafeta"
                                      className="inline-flex items-center justify-center rounded-lg border border-[#D97706]/40 bg-card p-1.5 text-[#D97706] hover:bg-[#D97706]/15 cursor-pointer"
                                    >
                                      <Phone className="size-3.5" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* =====================================================================
                MODULE 3: SECURITY HANDOVER & OTP VERIFICATION
            ===================================================================== */}
            {activeTab === 'handover' && (
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-[#D97706] uppercase">
                        <KeyRound className="size-4 text-[#D97706]" />
                        Custódia & Proteção Zero Fiado
                      </span>
                      <h2 className="mt-0.5 text-lg font-bold text-foreground">
                        Entrega Segura ao Estafeta (OTP) & Libertação de Escrow
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        O pagamento EMIS Multicaixa já está garantido em Escrow (#D97706). Introduza
                        o código OTP de 4 dígitos apresentado pelo estafeta para libertar os 90%
                        diretamente para o Saldo Disponível (#16A34A).
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 self-start rounded-xl bg-[#16A34A] px-3 py-1.5 text-xs font-bold text-white">
                      <ShieldCheck className="size-4" />
                      Escrow EMIS Multicaixa Verificado
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {orders.map((order) => {
                    const currentOtp = otpInputByOrder[order.orderCode] || '';
                    const grossAmount = order.totalAmount;
                    const expectedFee = Math.round(grossAmount * 0.1);
                    const expectedNet = grossAmount - expectedFee;

                    return (
                      <div
                        key={order.orderCode}
                        className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs"
                      >
                        <div>
                          {/* Card Header */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-bold text-primary">
                                  #{order.orderCode}
                                </span>
                                <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
                                  Ref. EMIS: {order.emisReference}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Cliente: <strong className="text-foreground">{order.customerName}</strong>{' '}
                                · Destino: {order.deliveryAddress}
                              </p>
                            </div>

                            {order.handoverCompleted ? (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-[#16A34A] px-2.5 py-1 text-xs font-bold text-white">
                                <CheckCircle2 className="size-3.5" />
                                Peça Aprovada & Entregue
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-[#D97706] px-2.5 py-1 text-xs font-bold text-white">
                                <Truck className="size-3.5" />
                                Cativo em Escrow · Estafeta na Banca
                              </span>
                            )}
                          </div>

                          {/* Order Items */}
                          <div className="mt-3 space-y-2">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                              Peças para Entrega ao Estafeta:
                            </p>
                            {order.items.map((item, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <Box className="size-4 text-primary shrink-0" />
                                  <div>
                                    <p className="font-bold text-foreground">
                                      {item.quantity}x {item.name}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                      Marca: {item.brand} ·{' '}
                                      {item.condition === 'recondicionada'
                                        ? 'Ocasião (Lacrada 72h)'
                                        : 'Nova na Caixa'}
                                    </p>
                                  </div>
                                </div>
                                <span className="font-mono font-bold text-foreground tabular-nums">
                                  {formatKz(item.price * item.quantity)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Assigned Courier Badge with Direct Call Action (Banca -> Estafeta) */}
                          <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3 text-xs space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#D97706] text-white">
                                  <Bike className="size-4" />
                                </span>
                                <div>
                                  <p className="font-bold text-foreground">
                                    Estafeta: {order.driverName} (ID #{order.driverCode})
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {order.driverVehicle}
                                  </p>
                                  <p className="font-mono text-[11px] font-bold text-[#D97706]">
                                    Tel: {order.driverPhone}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                                  OTP do Estafeta
                                </span>
                                <span className="font-mono text-sm font-black text-primary">
                                  {order.expectedHandoverOtp}
                                </span>
                              </div>
                            </div>

                            {/* Botões para a Banca Ligar ao Estafeta que aceitou a recolha */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
                              <span className="text-[11px] font-semibold text-muted-foreground">
                                Estafeta aceitou a recolha desta encomenda:
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStartCallToDriver({
                                      orderCode: order.orderCode,
                                      driverName: order.driverName,
                                      driverCode: `#${order.driverCode}`,
                                      driverPhone: order.driverPhone,
                                      driverVehicle: order.driverVehicle,
                                    })
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#D97706] px-3 py-2 text-xs font-bold text-white shadow-2xs hover:opacity-90 transition cursor-pointer"
                                >
                                  <PhoneCall className="size-3.5" />
                                  Ligar para o Estafeta
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStartCallToDriver({
                                      orderCode: order.orderCode,
                                      driverName: order.driverName,
                                      driverCode: `#${order.driverCode}`,
                                      driverPhone: order.driverPhone,
                                      driverVehicle: order.driverVehicle,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-2.5 py-2 font-mono text-xs font-bold text-foreground hover:bg-muted transition cursor-pointer"
                                  title="Marcar chamada para o Estafeta"
                                >
                                  <Phone className="size-3.5 text-[#16A34A]" />
                                  <span>Marcar</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* OTP Handover Form OR Instant Split Payout Card */}
                        {order.handoverCompleted && order.payoutRecord ? (
                          <div className="mt-4 rounded-xl border border-[#16A34A]/40 bg-[#16A34A]/10 p-3.5">
                            <div className="flex items-center justify-between text-xs font-bold text-[#16A34A]">
                              <span className="flex items-center gap-1.5">
                                <FileCheck2 className="size-4 text-[#16A34A]" />
                                Recibo de Split Automático #{order.payoutRecord.payoutCode}
                              </span>
                              <span className="font-mono">OTP {order.payoutRecord.handoverOtp}</span>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-[#16A34A]/20 pt-2 text-xs">
                              <div>
                                <span className="text-[10px] text-muted-foreground block">Bruto EMIS</span>
                                <span className="font-mono font-bold text-foreground">
                                  {formatKz(order.payoutRecord.grossAmountKz)}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-muted-foreground block">
                                  Taxa Logística (10%)
                                </span>
                                <span className="font-mono font-bold text-[#D97706]">
                                  -{formatKz(order.payoutRecord.platformFeeKz)}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-[#16A34A] block font-semibold">
                                  Líquido Banca (90%)
                                </span>
                                <span className="font-mono font-black text-[#16A34A]">
                                  +{formatKz(order.payoutRecord.netPayoutKz)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 space-y-3 rounded-xl border border-border bg-muted/40 p-3.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-foreground">
                                Introduza o OTP de 4 dígitos do Estafeta:
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setOtpInputByOrder((prev) => ({
                                    ...prev,
                                    [order.orderCode]: order.expectedHandoverOtp,
                                  }))
                                }
                                className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] font-bold text-primary hover:bg-secondary cursor-pointer"
                              >
                                Preencher OTP ({order.expectedHandoverOtp})
                              </button>
                            </div>

                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={4}
                                value={currentOtp}
                                onChange={(e) =>
                                  setOtpInputByOrder((prev) => ({
                                    ...prev,
                                    [order.orderCode]: e.target.value.replace(/\D/g, '').slice(0, 4),
                                  }))
                                }
                                placeholder="0000"
                                aria-label={`Código OTP para encomenda ${order.orderCode}`}
                                className="h-11 w-28 rounded-xl border border-input bg-card text-center font-mono text-lg font-black tracking-[0.3em] text-foreground focus:border-primary focus:outline-none"
                              />

                              <button
                                type="button"
                                disabled={verifyingOrderCode === order.orderCode}
                                onClick={() => handleVerifyHandoverOtp(order)}
                                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-4 text-xs sm:text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                              >
                                <PackageCheck className="size-4 shrink-0" />
                                <span>
                                  {verifyingOrderCode === order.orderCode
                                    ? 'A libertar Split...'
                                    : `Confirmar & Receber ${formatKz(expectedNet)}`}
                                </span>
                              </button>
                            </div>

                            <p className="text-[11px] text-muted-foreground">
                              Ao validar o código OTP, a custódia física passa para o estafeta e{' '}
                              <strong className="text-[#16A34A]">{formatKz(expectedNet)}</strong>{' '}
                              (90%) entram de imediato no saldo da banca.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <KitingoDeliveryRatingCenter
                  mode="merchant"
                  orderCode={orders[0]?.orderCode || 'CE-650018'}
                  customerName={orders[0]?.customerName || 'João Manuel Baptista'}
                  customerPhone={orders[0]?.customerPhone || '+244 924 514 042'}
                  driverCode={orders[0]?.driverCode || 'EST-019'}
                  driverName={orders[0]?.driverName || 'Paulo Sebastião'}
                  bancaCode={activeBancaCode}
                  bancaName={activeBancaName}
                  isDeliveredInitial={orders[0]?.status === 'entregue_cliente'}
                />
              </div>
            )}

            {/* =====================================================================
                MODULE 4: INVENTORY UPLOAD & MANAGEMENT FORM
            ===================================================================== */}
            {activeTab === 'inventory' && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Left Column: Upload New Part Form */}
                <div className="lg:col-span-5">
                  <form
                    onSubmit={handleAddInventorySubmit}
                    className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4"
                  >
                    <div className="border-b border-border pb-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                        Publicação Rápida na Praça dos Correios
                      </span>
                      <h2 className="mt-0.5 text-lg font-bold text-foreground">
                        Adicionar Peça ao Stock da Banca
                      </h2>
                    </div>

                    {/* Toggle Switch for Part Condition: Nova (Na Caixa) vs Ocasião / Recondicionada (Grau A/B) */}
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-foreground">
                        Condição da Peça *
                      </label>
                      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/50 p-1.5">
                        <button
                          type="button"
                          onClick={() => setPartCondition('nova')}
                          className={`flex flex-col items-center justify-center rounded-lg px-3 py-2.5 text-center transition-all cursor-pointer ${
                            partCondition === 'nova'
                              ? 'bg-[#16A34A] text-white font-bold shadow-xs'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <span className="text-xs font-bold">🆕 Nova (Na Caixa)</span>
                          <span className="text-[10px] opacity-90">Selo OEM / Fábrica</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPartCondition('recondicionada')}
                          className={`flex flex-col items-center justify-center rounded-lg px-3 py-2.5 text-center transition-all cursor-pointer ${
                            partCondition === 'recondicionada'
                              ? 'bg-[#D97706] text-white font-bold shadow-xs'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <span className="text-xs font-bold">🔄 Ocasião / Recond.</span>
                          <span className="text-[10px] opacity-90">Grau A/B · Teste 72h</span>
                        </button>
                      </div>
                    </div>

                    {/* Grade Selector when Recondicionada / Ocasião is selected */}
                    {partCondition === 'recondicionada' && (
                      <div className="rounded-xl border border-[#D97706]/30 bg-accent p-3">
                        <label className="mb-1.5 block text-xs font-bold text-accent-foreground">
                          Grau de Conservação & Garantia 72h
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['Grau A', 'Grau B'] as const).map((g) => (
                            <button
                              key={g}
                              type="button"
                              onClick={() => setPartGrade(g)}
                              className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${
                                partGrade === g
                                  ? 'border-[#D97706] bg-[#D97706] text-white'
                                  : 'border-border bg-card text-foreground'
                              }`}
                            >
                              {g === 'Grau A'
                                ? 'Grau A · Semi-Nova Testada'
                                : 'Grau B · Funcional Revisada'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Category Selector */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-foreground">
                          Categoria da Peça *
                        </label>
                        <select
                          value={partCategory}
                          onChange={(e) => setPartCategory(e.target.value)}
                          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
                        >
                          {INVENTORY_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold text-foreground">
                          Marca / Fabricante
                        </label>
                        <input
                          type="text"
                          value={partBrand}
                          onChange={(e) => setPartBrand(e.target.value)}
                          placeholder="Ex: Denso, Bosch, Toyota OEM"
                          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Part Name & Compatibility */}
                    <div>
                      <label className="mb-1 block text-xs font-bold text-foreground">
                        Designação Comercial da Peça *
                      </label>
                      <input
                        type="text"
                        value={partName}
                        onChange={(e) => setPartName(e.target.value)}
                        placeholder="Ex: Alternador 12V 120A Toyota Hilux 2.8 GD-6"
                        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold text-foreground">
                        Modelos / Anos Compatíveis
                      </label>
                      <input
                        type="text"
                        value={partCompatibility}
                        onChange={(e) => setPartCompatibility(e.target.value)}
                        placeholder="Ex: Toyota Hilux (2016–2023), Fortuner"
                        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                    </div>

                    {/* Price in Kwanzas & Stock Quantity */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-foreground">
                          Preço Unitário (AOA) *
                        </label>
                        <div className="flex items-center overflow-hidden rounded-xl border border-input bg-background">
                          <input
                            type="number"
                            min={500}
                            step={500}
                            value={partPriceKz}
                            onChange={(e) => setPartPriceKz(e.target.value)}
                            placeholder="145000"
                            className="h-11 w-full bg-transparent px-3 font-mono text-sm font-bold text-foreground focus:outline-none"
                            required
                          />
                          <span className="border-l border-border bg-muted px-2.5 font-mono text-xs font-bold text-foreground">
                            Kz
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold text-foreground">
                          Qtd. na Banca
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={partStockQty}
                          onChange={(e) => setPartStockQty(e.target.value)}
                          className="h-11 w-full rounded-xl border border-input bg-background px-3 font-mono text-sm font-bold text-foreground focus:border-primary focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Camera Uploader for Real-Time Photo Capture at Praça dos Correios */}
                    <div className="space-y-2.5 rounded-xl border border-border bg-muted/40 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground">
                          <Camera className="size-4 text-[#7C3AED]" />
                          Fotografia Real na Banca
                        </span>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-secondary cursor-pointer"
                        >
                          <Upload className="size-3" />
                          Abrir Câmara / Galeria
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleCameraFileUpload}
                          className="hidden"
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                          <img
                            src={partPhotoUrl}
                            alt="Pré-visualização da peça"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex-1 space-y-1.5">
                          <p className="text-[11px] text-muted-foreground">
                            Ou selecione uma captura rápida de bancada:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {PRACA_CAMERA_PRESETS.map((preset) => (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() => setPartPhotoUrl(preset.url)}
                                className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors cursor-pointer ${
                                  partPhotoUrl === preset.url
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={uploadingPart}
                      className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-4 py-3 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                    >
                      <ImagePlus className="size-4" />
                      <span>
                        {uploadingPart
                          ? 'A publicar peça...'
                          : `Publicar Peça Aprovada na ${activeBancaCode}`}
                      </span>
                    </button>
                  </form>
                </div>

                {/* Right Column: Active Banca Inventory List with Aprovadas (#16A34A), Rejeitadas (#DC2626), Suspensas (#64748B) */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                          <Layers className="size-4 text-primary" />
                          Inventário Ativo da {activeBancaName}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          Filtre ou altere o estado das peças: Aprovadas (#16A34A), Rejeitadas (#DC2626) e Suspensas (#64748B).
                        </p>
                      </div>
                      <span className="rounded-xl bg-muted px-3 py-1.5 font-mono text-xs font-bold text-foreground">
                        {filteredInventory.length} SKU(s)
                      </span>
                    </div>

                    {/* Filter Pills by Approval Status */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                      <button
                        type="button"
                        onClick={() => setInventoryStatusFilter('todas')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                          inventoryStatusFilter === 'todas'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground hover:bg-secondary'
                        }`}
                      >
                        Todas ({enrichedInventory.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setInventoryStatusFilter('aprovada')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-opacity cursor-pointer ${
                          inventoryStatusFilter === 'aprovada'
                            ? 'bg-[#16A34A] ring-2 ring-[#16A34A]/40'
                            : 'bg-[#16A34A]/85 hover:bg-[#16A34A]'
                        }`}
                      >
                        Peças Aprovadas ({inventoryCounts.aprovadas})
                      </button>
                      <button
                        type="button"
                        onClick={() => setInventoryStatusFilter('rejeitada')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-opacity cursor-pointer ${
                          inventoryStatusFilter === 'rejeitada'
                            ? 'bg-[#DC2626] ring-2 ring-[#DC2626]/40'
                            : 'bg-[#DC2626]/85 hover:bg-[#DC2626]'
                        }`}
                      >
                        Peças Rejeitadas ({inventoryCounts.rejeitadas})
                      </button>
                      <button
                        type="button"
                        onClick={() => setInventoryStatusFilter('suspensa')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-opacity cursor-pointer ${
                          inventoryStatusFilter === 'suspensa'
                            ? 'bg-[#64748B] ring-2 ring-[#64748B]/40'
                            : 'bg-[#64748B]/85 hover:bg-[#64748B]'
                        }`}
                      >
                        Peças Suspensas ({inventoryCounts.suspensas})
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    {filteredInventory.map((item) => (
                      <article
                        key={item.sku}
                        className="flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md"
                      >
                        <div>
                          <div className="mb-2.5 flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-muted-foreground">
                              {item.sku}
                            </span>
                            {renderApprovalBadge(item.approvalStatus)}
                          </div>

                          <div className="flex gap-3">
                            <img
                              src={item.photoUrl}
                              alt={item.partName}
                              className="size-20 shrink-0 rounded-xl border border-border object-cover bg-muted"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {item.condition === 'nova' ? (
                                  <span className="rounded-md bg-[#16A34A] px-1.5 py-0.5 text-[10px] font-bold text-white">
                                    🆕 Nova · {item.brand}
                                  </span>
                                ) : (
                                  <span className="rounded-md bg-[#D97706] px-1.5 py-0.5 text-[10px] font-bold text-white">
                                    🔄 Ocasião · {item.grade || 'Grau A'}
                                  </span>
                                )}
                              </div>
                              <h3 className="mt-1 text-sm font-semibold text-foreground line-clamp-2">
                                {item.partName}
                              </h3>
                              <p className="mt-0.5 text-[11px] text-accent-foreground bg-accent inline-block rounded px-1.5 py-0.5 truncate max-w-full">
                                {item.compatibility}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 text-xs">
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Tag className="size-3.5 text-primary" />
                              {item.category}
                            </span>
                            <span className="font-mono text-xs font-semibold text-muted-foreground">
                              Stock: <strong className="text-foreground">{item.stockQty} un.</strong>
                            </span>
                          </div>
                        </div>

                        <div className="mt-2.5 space-y-2">
                          <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2">
                            <span className="text-[11px] text-muted-foreground truncate">
                              {item.warrantyLabel}
                            </span>
                            <span className="font-mono text-sm font-bold text-foreground tabular-nums shrink-0 ml-2">
                              {formatKz(item.priceKz)}
                            </span>
                          </div>

                          {/* Quick Status Switcher per Part: Aprovada (#16A34A) | Suspensa (#64748B) | Rejeitada (#DC2626) */}
                          <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                setInventoryStatusBySku((prev) => ({
                                  ...prev,
                                  [item.sku]: 'aprovada',
                                }))
                              }
                              className={`rounded-lg py-1.5 text-[11px] font-bold text-white transition-opacity cursor-pointer ${
                                item.approvalStatus === 'aprovada'
                                  ? 'bg-[#16A34A]'
                                  : 'bg-[#16A34A]/45 hover:bg-[#16A34A]/80'
                              }`}
                            >
                              Aprovada
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setInventoryStatusBySku((prev) => ({
                                  ...prev,
                                  [item.sku]: 'suspensa',
                                }))
                              }
                              className={`rounded-lg py-1.5 text-[11px] font-bold text-white transition-opacity cursor-pointer ${
                                item.approvalStatus === 'suspensa'
                                  ? 'bg-[#64748B]'
                                  : 'bg-[#64748B]/45 hover:bg-[#64748B]/80'
                              }`}
                            >
                              Suspensa
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setInventoryStatusBySku((prev) => ({
                                  ...prev,
                                  [item.sku]: 'rejeitada',
                                }))
                              }
                              className={`rounded-lg py-1.5 text-[11px] font-bold text-white transition-opacity cursor-pointer ${
                                item.approvalStatus === 'rejeitada'
                                  ? 'bg-[#DC2626]'
                                  : 'bg-[#DC2626]/45 hover:bg-[#DC2626]/80'
                              }`}
                            >
                              Rejeitada
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* =====================================================================
                MODULE 5: AUTOMATED SPLIT PAYOUTS LEDGER (EXTRATO AOA)
            ===================================================================== */}
            {activeTab === 'payouts' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                      <Wallet className="size-5 text-[#16A34A]" />
                      Histórico de Pagamentos Split Automático (90% Banca / 10% Logística)
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Todos os pagamentos liquidados por Referência EMIS Multicaixa após confirmação
                      de recolha OTP pelos estafetas Kitingo.
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#16A34A] px-3.5 py-2 font-mono text-xs font-bold text-white">
                    Total Acumulado: {formatKz(walletBalanceKz)}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {payouts.map((p) => (
                    <div
                      key={p.payoutCode}
                      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-[#16A34A] px-2 py-0.5 font-mono text-xs font-bold text-white">
                            {p.payoutCode}
                          </span>
                          <span className="font-mono text-xs font-bold text-primary">
                            Encomenda #{p.orderCode}
                          </span>
                          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
                            OTP Recolha: {p.handoverOtp}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Estafeta Verificado: <strong className="text-foreground">{p.driverName}</strong>{' '}
                          · Banca: {p.bancaName} ({p.bancaCode})
                        </p>
                      </div>

                      <div className="flex items-center gap-4 border-t border-border pt-2 sm:border-t-0 sm:pt-0">
                        <div className="text-right">
                          <span className="block text-[10px] uppercase text-muted-foreground">
                            Bruto EMIS
                          </span>
                          <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
                            {formatKz(p.grossAmountKz)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="block text-[10px] uppercase text-muted-foreground">
                            Taxa 10%
                          </span>
                          <span className="font-mono text-xs font-semibold text-[#D97706] tabular-nums">
                            -{formatKz(p.platformFeeKz)}
                          </span>
                        </div>
                        <div className="rounded-xl bg-[#16A34A] px-3 py-1.5 text-right text-white">
                          <span className="block text-[10px] font-bold uppercase text-white/90">
                            Crédito Banca (90%)
                          </span>
                          <span className="font-mono text-sm font-black text-white tabular-nums">
                            +{formatKz(p.netPayoutKz)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <KitingoDeliveryRatingCenter
                  mode="merchant"
                  orderCode={orders[0]?.orderCode || 'CE-650018'}
                  customerName={orders[0]?.customerName || 'João Manuel Baptista'}
                  customerPhone={orders[0]?.customerPhone || '+244 924 514 042'}
                  driverCode={orders[0]?.driverCode || 'EST-019'}
                  driverName={orders[0]?.driverName || 'Paulo Sebastião'}
                  bancaCode={activeBancaCode}
                  bancaName={activeBancaName}
                  isDeliveredInitial={orders[0]?.status === 'entregue_cliente'}
                />
              </div>
            )}

            {/* =====================================================================
                MODULE 5: TICKETS & SUPORTE BACK-OFFICE DA BANCA
            ===================================================================== */}
            {activeTab === 'tickets' && (
              <div className="space-y-5">
                <KitingoDeliveryRatingCenter
                  mode="merchant"
                  orderCode={orders[0]?.orderCode || 'CE-650018'}
                  customerName={orders[0]?.customerName || 'João Manuel Baptista'}
                  customerPhone={orders[0]?.customerPhone || '+244 924 514 042'}
                  driverCode={orders[0]?.driverCode || 'EST-019'}
                  driverName={orders[0]?.driverName || 'Paulo Sebastião'}
                  bancaCode={activeBancaCode}
                  bancaName={activeBancaName}
                  isDeliveredInitial={orders[0]?.status === 'entregue_cliente'}
                />
                <KitingoTicketCenter
                  role="banca"
                  reporterName={`${activeBancaCode} · ${activeBancaName} (${vendorName || 'José Baptista'})`}
                  reporterPhone="+244 923 814 008"
                  defaultOrderCode={orders[0]?.orderCode || 'CE-650018'}
                  defaultMatchCode={sampleQueue[0]?.matchCode || 'MA-904'}
                  defaultBancaCode={activeBancaCode}
                  defaultBancaName={activeBancaName}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
