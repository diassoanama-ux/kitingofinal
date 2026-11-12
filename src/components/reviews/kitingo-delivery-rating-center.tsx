import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  Bike,
  CheckCircle2,
  KeyRound,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  ThumbsUp,
  UserCheck,
} from 'lucide-react';

export interface KitingoReviewRecord {
  id: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  driverCode: string;
  driverName: string;
  driverRating: number;
  driverTags: string[];
  driverComment: string;
  bancaCode: string;
  bancaName: string;
  partName: string;
  partRating: number;
  partTags: string[];
  partComment: string;
  verifiedEscrowDelivery: boolean;
  createdAt: string;
}

export interface CompletedDeliverySummary {
  orderCode: string;
  bancaCode: string;
  bancaName: string;
  driverCode: string;
  driverName: string;
  customerName: string;
  customerPhone: string;
  partName: string;
  deliveredAt: string;
  verificationMethod: string;
}

interface KitingoDeliveryRatingCenterProps {
  mode: 'customer' | 'driver' | 'merchant' | 'admin';
  orderCode?: string;
  customerName?: string;
  customerPhone?: string;
  driverCode?: string;
  driverName?: string;
  bancaCode?: string;
  bancaName?: string;
  partName?: string;
  deliveryPin?: string;
  isDeliveredInitial?: boolean;
  onReceptionConfirmed?: (summary: CompletedDeliverySummary) => void;
}

const DRIVER_PRAISE_TAGS = [
  'Pontual no GPS',
  'Cuidado com a peça',
  'Educado e profissional',
  'Validou PIN com segurança',
  'Rápido no trânsito de Luanda',
];

const PART_QUALITY_TAGS = [
  'Peça 100% igual à amostra',
  'Funcionamento impecável',
  'Garantia cumprida',
  'Bom preço na Praça',
  'Selada / Bem acondicionada',
];

export const KitingoDeliveryRatingCenter: React.FC<KitingoDeliveryRatingCenterProps> = ({
  mode,
  orderCode = 'CE-650018',
  customerName = 'João Manuel Baptista',
  customerPhone = '+244 924 514 042',
  driverCode = 'EST-019',
  driverName = 'Paulo Sebastião',
  bancaCode = 'PC-008',
  bancaName = 'Banca #08 - Peças do Zé',
  partName = 'Alternador Denso 12V 90A (Toyota Hilux / Prado)',
  deliveryPin = '2437',
  isDeliveredInitial = false,
  onReceptionConfirmed,
}) => {
  const [reviews, setReviews] = useState<KitingoReviewRecord[]>([]);
  const [completedDeliveries, setCompletedDeliveries] = useState<CompletedDeliverySummary[]>([]);
  const [isDelivered, setIsDelivered] = useState<boolean>(isDeliveredInitial);
  const [confirmingReception, setConfirmingReception] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>(deliveryPin);

  // Rating Form State
  const [driverRating, setDriverRating] = useState<number>(5);
  const [selectedDriverTags, setSelectedDriverTags] = useState<string[]>([
    'Pontual no GPS',
    'Validou PIN com segurança',
  ]);
  const [driverComment, setDriverComment] = useState<string>('');

  const [partRating, setPartRating] = useState<number>(5);
  const [selectedPartTags, setSelectedPartTags] = useState<string[]>([
    'Peça 100% igual à amostra',
    'Funcionamento impecável',
  ]);
  const [partComment, setPartComment] = useState<string>('');
  const [customPartName, setCustomPartName] = useState<string>(partName);

  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [showReviewForm, setShowReviewForm] = useState<boolean>(mode === 'customer');
  const [filterView, setFilterView] = useState<'all' | 'drivers' | 'parts'>('all');
  const [bannerFeedback, setBannerFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (isDeliveredInitial) {
      setIsDelivered(true);
    }
  }, [isDeliveredInitial]);

  useEffect(() => {
    setCustomPartName(partName);
  }, [partName]);

  const fetchReviewsAndDeliveries = useCallback(async () => {
    try {
      const res = await fetch('/api/reviews');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.reviews)) {
        setReviews(data.reviews);
      }
      if (Array.isArray(data?.completedDeliveries)) {
        setCompletedDeliveries(data.completedDeliveries);
        if (
          data.completedDeliveries.some(
            (d: CompletedDeliverySummary) => d.orderCode === orderCode
          )
        ) {
          setIsDelivered(true);
        }
      }
    } catch {
      // ignore offline
    }
  }, [orderCode]);

  useEffect(() => {
    fetchReviewsAndDeliveries();
  }, [fetchReviewsAndDeliveries]);

  // Real-time WebSocket synchronization across Customer, Driver, Merchant, and Admin Back-Office
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'delivery:completed') {
          const summary: CompletedDeliverySummary = {
            orderCode: msg.orderCode || orderCode,
            bancaCode: msg.bancaCode || bancaCode,
            bancaName: msg.bancaName || bancaName,
            driverCode: msg.driverCode || driverCode,
            driverName: msg.driverName || driverName,
            customerName: msg.customerName || customerName,
            customerPhone: msg.customerPhone || customerPhone,
            partName: msg.partName || partName,
            deliveredAt:
              msg.deliveredAt ||
              new Date().toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' }),
            verificationMethod: msg.verificationMethod || 'PIN_OTP',
          };
          setCompletedDeliveries((prev) => {
            const filtered = prev.filter((d) => d.orderCode !== summary.orderCode);
            return [summary, ...filtered];
          });
          setIsDelivered(true);
          setBannerFeedback({
            type: 'success',
            text: `Peça do Pedido ${summary.orderCode} entregue com sucesso a ${summary.customerName}! Estado atualizado em todas as plataformas.`,
          });
        } else if (
          msg.type === 'gps:mission_updated' &&
          msg.mission?.missionState === 'DELIVERY_CONFIRMED'
        ) {
          setIsDelivered(true);
        } else if (msg.type === 'review:created' && msg.review) {
          setReviews((prev) => {
            if (prev.some((r) => r.id === msg.review.id)) return prev;
            return [msg.review, ...prev];
          });
          if (mode !== 'customer') {
            setBannerFeedback({
              type: 'success',
              text: `Nova avaliação de cliente recebida (${msg.review.orderCode}): Estafeta ${msg.review.driverRating}★ · Peça/Banca ${msg.review.partRating}★!`,
            });
          }
        }
      } catch {
        // ignore invalid JSON
      }
    };

    return () => ws.close();
  }, [orderCode, bancaCode, bancaName, driverCode, driverName, customerName, customerPhone, partName, mode]);

  const handleConfirmReception = async () => {
    setConfirmingReception(true);
    setBannerFeedback(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderCode)}/confirm-reception`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pinCode: pinInput.trim() || deliveryPin,
          actorRole: mode === 'customer' ? 'cliente' : mode,
          customerName,
          partName: customPartName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerFeedback({
          type: 'error',
          text: data.error || 'Não foi possível confirmar a receção da peça.',
        });
        return;
      }

      setIsDelivered(true);
      setShowReviewForm(true);
      if (data.delivery) {
        setCompletedDeliveries((prev) => [
          data.delivery,
          ...prev.filter((d) => d.orderCode !== data.delivery.orderCode),
        ]);
        if (onReceptionConfirmed) {
          onReceptionConfirmed(data.delivery);
        }
      }
      setBannerFeedback({
        type: 'success',
        text: `Receção da peça confirmada! O pedido ${orderCode} está agora identificado como "ENTREGUE COM SUCESSO" no App do Cliente, App do Estafeta, Painel da Banca e Back-Office.`,
      });
    } catch {
      setBannerFeedback({
        type: 'error',
        text: 'Erro de comunicação ao confirmar receção da peça.',
      });
    } finally {
      setConfirmingReception(false);
    }
  };

  const toggleDriverTag = (tag: string) => {
    setSelectedDriverTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const togglePartTag = (tag: string) => {
    setSelectedPartTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReview(true);
    setBannerFeedback(null);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderCode,
          customerName,
          customerPhone,
          driverCode,
          driverName,
          driverRating,
          driverTags: selectedDriverTags,
          driverComment,
          bancaCode,
          bancaName,
          partName: customPartName,
          partRating,
          partTags: selectedPartTags,
          partComment,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerFeedback({
          type: 'error',
          text: data.error || 'Erro ao publicar avaliação.',
        });
        return;
      }

      if (data.review) {
        setReviews((prev) => {
          if (prev.some((r) => r.id === data.review.id)) return prev;
          return [data.review, ...prev];
        });
      }
      setDriverComment('');
      setPartComment('');
      setBannerFeedback({
        type: 'success',
        text: `Avaliação publicada com sucesso! Estafeta ${driverName} (${driverRating}★) e ${bancaName} (${partRating}★) foram atualizados em todas as plataformas.`,
      });
    } catch {
      setBannerFeedback({
        type: 'error',
        text: 'Falha de rede ao submeter avaliação.',
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  const stats = useMemo(() => {
    if (reviews.length === 0) {
      return { avgDriver: 5.0, avgPart: 4.9, total: 0 };
    }
    const sumDriver = reviews.reduce((acc, r) => acc + r.driverRating, 0);
    const sumPart = reviews.reduce((acc, r) => acc + r.partRating, 0);
    return {
      avgDriver: Number((sumDriver / reviews.length).toFixed(1)),
      avgPart: Number((sumPart / reviews.length).toFixed(1)),
      total: reviews.length,
    };
  }, [reviews]);

  const renderStars = (
    current: number,
    onSelect?: (val: number) => void,
    sizeClass = 'size-5'
  ) => {
    return (
      <div className="inline-flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((starVal) => {
          const filled = starVal <= current;
          return (
            <button
              key={starVal}
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect && onSelect(starVal)}
              className={`${
                onSelect ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'
              }`}
              aria-label={`${starVal} estrelas`}
            >
              <Star
                className={`${sizeClass} ${
                  filled
                    ? 'fill-[#F59E0B] text-[#F59E0B]'
                    : 'fill-transparent text-slate-300 dark:text-slate-600'
                }`}
              />
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <section
      aria-label="Confirmação de Receção da Peça e Avaliação de Estafetas e Bancas"
      className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-5"
    >
      {/* 1. Cross-Platform Reception Status Header */}
      <div
        className={`rounded-2xl border-2 p-4 transition-all ${
          isDelivered
            ? 'border-[#16A34A] bg-emerald-500/10'
            : 'border-amber-500/50 bg-amber-500/10'
        }`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3.5">
            <span
              className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-md ${
                isDelivered ? 'bg-[#16A34A]' : 'bg-[#D97706]'
              }`}
            >
              <PackageCheck className="size-6" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-white ${
                    isDelivered ? 'bg-[#16A34A]' : 'bg-[#D97706]'
                  }`}
                >
                  {isDelivered
                    ? '✓ PEÇA ENTREGUE COM SUCESSO'
                    : 'AGUARDA CONFIRMAÇÃO DE RECEÇÃO PELO CLIENTE'}
                </span>
                <span className="font-mono text-xs font-bold text-foreground">
                  Pedido {orderCode}
                </span>
              </div>

              <h3 className="mt-1 text-base font-black text-foreground">
                {isDelivered
                  ? `Entrega Concluída e Validada · ${customPartName}`
                  : `Receção da Peça Auto · ${customPartName}`}
              </h3>

              <p className="mt-0.5 text-xs text-muted-foreground">
                {isDelivered
                  ? `O comprador ${customerName} confirmou a receção em mãos. O pagamento Escrow foi libertado para ${bancaName} e o registo foi sincronizado em todas as plataformas.`
                  : `Assim que receber a peça das mãos do estafeta ${driverName} (${driverCode}), confirme a receção abaixo para atualizar todas as plataformas e libertar o Escrow.`}
              </p>

              {/* Cross-Platform Synchronization Pills */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {[
                  { label: 'App Comprador', status: isDelivered ? 'Peça Recebida ✓' : 'Em Curso' },
                  { label: 'App Estafeta', status: isDelivered ? 'Missão Concluída ✓' : 'Em Rota' },
                  { label: 'Painel da Banca', status: isDelivered ? 'Escrow Libertado ✓' : 'Em Caução' },
                  { label: 'Back-Office & Torre', status: isDelivered ? 'Entrega Auditada ✓' : 'Monitorizado' },
                ].map((plat) => (
                  <span
                    key={plat.label}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                      isDelivered
                        ? 'border-[#16A34A]/40 bg-[#16A34A]/15 text-emerald-800 dark:text-emerald-200'
                        : 'border-border bg-background text-muted-foreground'
                    }`}
                  >
                    <CheckCircle2
                      className={`size-3.5 ${
                        isDelivered ? 'text-[#16A34A]' : 'text-amber-500'
                      }`}
                    />
                    <span>
                      {plat.label}: <strong>{plat.status}</strong>
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Action Controls for Customer Reception Confirmation */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            {!isDelivered ? (
              <div className="flex flex-wrap items-center gap-2 bg-background/90 p-2.5 rounded-xl border border-border">
                <div className="flex items-center gap-1.5">
                  <KeyRound className="size-4 text-[#D97706]" />
                  <input
                    type="text"
                    maxLength={4}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder={deliveryPin}
                    aria-label="PIN de 4 dígitos de receção"
                    className="w-20 rounded-lg border border-input bg-card px-2.5 py-1.5 text-center font-mono text-sm font-black text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={confirmingReception}
                  onClick={handleConfirmReception}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2.5 text-xs font-black text-white shadow-sm hover:opacity-95 cursor-pointer disabled:opacity-50"
                >
                  <PackageCheck className="size-4" />
                  <span>
                    {confirmingReception
                      ? 'A Sincronizar Plataformas...'
                      : 'Confirmar Receção da Peça'}
                  </span>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-3.5 py-2 text-xs font-black text-white shadow-xs">
                  <ShieldCheck className="size-4" />
                  <span>Entregue com Sucesso ({orderCode})</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowReviewForm((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-primary bg-primary/10 px-3.5 py-2 text-xs font-black text-primary hover:bg-primary/20 cursor-pointer"
                >
                  <Star className="size-4 fill-[#F59E0B] text-[#F59E0B]" />
                  <span>{showReviewForm ? 'Ocultar Formulário' : 'Avaliar Estafeta e Peça'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Feedback Toast Banner */}
      {bannerFeedback && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs font-bold text-white ${
            bannerFeedback.type === 'success' ? 'bg-[#16A34A]' : 'bg-[#DC2626]'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{bannerFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerFeedback(null)}
            className="underline text-[11px] opacity-90 hover:opacity-100 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* 2. KPI Summary Cards for Estafeta & Banca Ratings */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-muted/30 p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
              <Bike className="size-3.5 text-[#0284C7]" />
              <span>Média dos Estafetas</span>
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-2xl font-black text-foreground tabular-nums">
                {stats.avgDriver.toFixed(1)}
              </span>
              {renderStars(Math.round(stats.avgDriver), undefined, 'size-4')}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Frota Kitingo · Validação PIN/QR 100%
            </p>
          </div>
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#0284C7]/15 text-[#0284C7]">
            <UserCheck className="size-5" />
          </span>
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
              <Store className="size-3.5 text-[#D97706]" />
              <span>Média das Peças nas Bancas</span>
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-2xl font-black text-foreground tabular-nums">
                {stats.avgPart.toFixed(1)}
              </span>
              {renderStars(Math.round(stats.avgPart), undefined, 'size-4')}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Praça dos Correios · Compatibilidade & Garantia
            </p>
          </div>
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#D97706]/15 text-[#D97706]">
            <Award className="size-5" />
          </span>
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-3.5 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-[#16A34A]" />
              <span>Avaliações Verificadas</span>
            </p>
            <p className="mt-1 font-mono text-2xl font-black text-foreground tabular-nums">
              {stats.total}
            </p>
            <p className="mt-0.5 text-[11px] text-[#16A34A] font-semibold">
              100% Compradores com Entrega Confirmada
            </p>
          </div>
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#16A34A]/15 text-[#16A34A]">
            <ThumbsUp className="size-5" />
          </span>
        </div>
      </div>

      {/* 3. Dual Rating Submission Form (Estafeta + Peça na Banca) */}
      {showReviewForm && (
        <form
          onSubmit={handleSubmitReview}
          className="rounded-2xl border border-primary/30 bg-muted/20 p-4 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <h4 className="text-sm font-black text-foreground flex items-center gap-1.5">
                <Sparkles className="size-4 text-[#F59E0B]" />
                <span>Avaliar Entrega do Estafeta & Qualidade da Peça na Banca</span>
              </h4>
              <p className="text-xs text-muted-foreground">
                A sua avaliação fica visível no App do Comprador, App do Estafeta, Painel da Banca e Back-Office.
              </p>
            </div>
            <span className="font-mono text-xs font-bold text-primary">
              Pedido {orderCode} · Cliente: {customerName}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Left Column: Avaliar Estafeta */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-[#0284C7]/15 text-[#0284C7]">
                    <Bike className="size-5" />
                  </span>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#0284C7]">
                      1. Avaliação do Estafeta Kitingo
                    </span>
                    <p className="text-sm font-bold text-foreground">
                      {driverName} ({driverCode})
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {renderStars(driverRating, setDriverRating, 'size-5')}
                  <span className="ml-1 font-mono text-sm font-black text-[#F59E0B]">
                    {driverRating}.0★
                  </span>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">
                  Destaques do serviço do estafeta:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {DRIVER_PRAISE_TAGS.map((tag) => {
                    const active = selectedDriverTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleDriverTag(tag)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                          active
                            ? 'bg-[#0284C7] text-white'
                            : 'border border-border bg-background text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {active ? `✓ ${tag}` : tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold text-muted-foreground">
                  Comentário sobre o estafeta (opcional):
                </label>
                <textarea
                  rows={2}
                  value={driverComment}
                  onChange={(e) => setDriverComment(e.target.value)}
                  placeholder="Ex: Muito educado, chegou rápido pela Maianga e validou o PIN de 4 dígitos..."
                  className="w-full rounded-xl border border-input bg-background p-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            {/* Right Column: Avaliar Peça e Banca */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-[#D97706]/15 text-[#D97706]">
                    <Store className="size-5" />
                  </span>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#D97706]">
                      2. Avaliação da Peça & Banca ({bancaCode})
                    </span>
                    <p className="text-sm font-bold text-foreground">{bancaName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {renderStars(partRating, setPartRating, 'size-5')}
                  <span className="ml-1 font-mono text-sm font-black text-[#F59E0B]">
                    {partRating}.0★
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold text-muted-foreground">
                  Peça recebida:
                </label>
                <input
                  type="text"
                  value={customPartName}
                  onChange={(e) => setCustomPartName(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">
                  Qualidade da peça e atendimento da banca:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PART_QUALITY_TAGS.map((tag) => {
                    const active = selectedPartTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => togglePartTag(tag)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                          active
                            ? 'bg-[#D97706] text-white'
                            : 'border border-border bg-background text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {active ? `✓ ${tag}` : tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-bold text-muted-foreground">
                  Comentário sobre a peça / banca (opcional):
                </label>
                <textarea
                  rows={2}
                  value={partComment}
                  onChange={(e) => setPartComment(e.target.value)}
                  placeholder="Ex: Peça 100% compatível com a amostra enviada, já instalada e a funcionar perfeitamente..."
                  className="w-full rounded-xl border border-input bg-background p-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submittingReview}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-black text-primary-foreground shadow-sm hover:opacity-95 cursor-pointer disabled:opacity-50"
            >
              <Star className="size-4 fill-[#F59E0B] text-[#F59E0B]" />
              <span>
                {submittingReview
                  ? 'A Publicar Avaliação...'
                  : 'Publicar Avaliação do Estafeta e da Peça na Banca'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* 4. Live Feed of Verified Reviews (Estafetas & Peças nas Bancas) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-foreground">
            Histórico de Entregas Confirmadas & Avaliações ({reviews.length})
          </h4>
          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'Estafetas + Peças' },
                { id: 'drivers', label: 'Só Estafetas' },
                { id: 'parts', label: 'Só Peças nas Bancas' },
              ] as const
            ).map((tabItem) => (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => setFilterView(tabItem.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                  filterView === tabItem.id
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                {tabItem.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {reviews.map((rev) => (
            <div
              key={rev.id}
              className="rounded-xl border border-border bg-background p-3.5 space-y-2.5 shadow-2xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-black text-primary">
                      {rev.orderCode}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-[#16A34A]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#16A34A]">
                      <CheckCircle2 className="size-3" />
                      Peça Entregue com Sucesso
                    </span>
                  </div>
                  <p className="text-xs font-bold text-foreground mt-0.5">
                    Comprador: {rev.customerName}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground">{rev.createdAt}</span>
              </div>

              {/* Driver Evaluation Block */}
              {(filterView === 'all' || filterView === 'drivers') && (
                <div className="rounded-lg bg-sky-500/5 border border-sky-500/20 p-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Bike className="size-3.5 text-[#0284C7]" />
                      <span>
                        Estafeta: {rev.driverName} ({rev.driverCode})
                      </span>
                    </span>
                    {renderStars(rev.driverRating, undefined, 'size-3.5')}
                  </div>
                  {rev.driverTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {rev.driverTags.map((tg) => (
                        <span
                          key={tg}
                          className="rounded bg-[#0284C7]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#0284C7]"
                        >
                          {tg}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">“{rev.driverComment}”</p>
                </div>
              )}

              {/* Part & Banca Evaluation Block */}
              {(filterView === 'all' || filterView === 'parts') && (
                <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Store className="size-3.5 text-[#D97706]" />
                      <span>
                        {rev.bancaCode} · {rev.bancaName}
                      </span>
                    </span>
                    {renderStars(rev.partRating, undefined, 'size-3.5')}
                  </div>
                  <p className="text-[11px] font-semibold text-foreground">{rev.partName}</p>
                  {rev.partTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {rev.partTags.map((tg) => (
                        <span
                          key={tg}
                          className="rounded bg-[#D97706]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#D97706]"
                        >
                          {tg}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">“{rev.partComment}”</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
