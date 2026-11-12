import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Headphones,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { formatKz } from '@/lib/products';

export interface UnifiedTicketMessage {
  id: string;
  sender: string;
  senderRole: string;
  text: string;
  timestamp: string;
}

export interface UnifiedSupportTicket {
  id?: number;
  ticketCode: string;
  originRole?: 'cliente' | 'estafeta' | 'banca';
  customerName: string;
  customerPhone: string;
  orderCode: string | null;
  matchCode: string | null;
  bancaCode: string;
  bancaName: string;
  subject: string;
  priority: 'urgente' | 'alta' | 'normal';
  status: 'aberto' | 'em_mediacao' | 'resolvido';
  vehicleModel: string;
  clientSamplePhotoUrl: string;
  clientPartDescription: string;
  merchantOfferPhotoUrl: string;
  merchantOfferPartName: string;
  merchantOfferCondition: 'nova' | 'ocasiao';
  merchantOfferPriceKz: number;
  assignedStaffId: string;
  chatMessages: UnifiedTicketMessage[];
}

interface KitingoTicketCenterProps {
  role: 'cliente' | 'estafeta' | 'banca';
  reporterName: string;
  reporterPhone: string;
  defaultOrderCode?: string;
  defaultMatchCode?: string;
  defaultBancaCode?: string;
  defaultBancaName?: string;
  defaultCustomerName?: string;
  defaultCustomerPhone?: string;
  defaultVehicleModel?: string;
}

const ROLE_PRESET_TEMPLATES: Record<
  'cliente' | 'estafeta' | 'banca',
  Array<{
    subject: string;
    priority: 'urgente' | 'alta' | 'normal';
    description: string;
  }>
> = {
  cliente: [
    {
      subject: 'Peça recebida diverge da Amostra / Viatura (Garantia 72h)',
      priority: 'urgente',
      description:
        'A furação / ficha elétrica da peça entregue não coincide com a peça antiga da minha viatura. Solicito mediação Split-View no Back-Office ou substituição imediata ao abrigo da Garantia de 72h.',
    },
    {
      subject: 'Atraso na Entrega ou Estafeta Parado na Rota GPS',
      priority: 'alta',
      description:
        'O estafeta encontra-se parado há mais de 15 minutos no mapa GPS. Solicito verificação da Torre de Controlo Logístico.',
    },
    {
      subject: 'Dúvida com PIN OTP / QR Code ou Libertação de Escrow EMIS',
      priority: 'normal',
      description:
        'Preciso de apoio do Call Center para validar o código de receção de 4 dígitos e confirmar a caução Multicaixa.',
    },
  ],
  estafeta: [
    {
      subject: 'Peça na Banca Diverge da Foto de Amostra do Cliente',
      priority: 'urgente',
      description:
        'Estou na banca para recolha, mas a peça física apresentada tem referência diferente da foto de amostra enviada pelo cliente. Aguardo autorização do Back-Office antes de validar o PIN.',
    },
    {
      subject: 'Cliente Ausente no Ponto de Entrega / Contacto Indisponível',
      priority: 'alta',
      description:
        'Cheguei ao raio de Geofencing (120m) do comprador em Luanda, mas o cliente ainda não apresentou o PIN de 4 dígitos. Solicito apoio do Call Center (+244).',
    },
    {
      subject: 'Banca Fechada ou Atraso na Preparação da Peça na Praça',
      priority: 'alta',
      description:
        'A banca ainda está a desmontar/lacrar a peça de ocasião. Solicito atualização de SLA na Torre de Controlo.',
    },
  ],
  banca: [
    {
      subject: 'Validação Técnica de Compatibilidade (Match por Amostra)',
      priority: 'alta',
      description:
        'Solicito que o Back-Office confirme no Split-View a compatibilidade OEM da nossa peça com a foto enviada pelo cliente para autorizar a recolha pelo estafeta.',
    },
    {
      subject: 'Split Bancário BAI/BCI Pendente após Entrega OTP ao Estafeta',
      priority: 'urgente',
      description:
        'O código OTP do estafeta já foi validado na recolha, mas a transferência automática de 90% via BAI/BCI consta como pendente. Solicito reprocessamento no Back-Office.',
    },
    {
      subject: 'Substituição de Estafeta ou Atraso na Recolha na Banca',
      priority: 'normal',
      description:
        'A peça já está lacrada com selo de garantia 72h pronta para entrega. Solicito prioridade ao estafeta designado.',
    },
  ],
};

export function KitingoTicketCenter({
  role,
  reporterName,
  reporterPhone,
  defaultOrderCode = 'CE-650018',
  defaultMatchCode = 'MA-904',
  defaultBancaCode = 'PC-008',
  defaultBancaName = 'Banca #08 - Peças do Zé',
  defaultCustomerName = 'João Manuel Baptista',
  defaultCustomerPhone = '+244 924 514 042',
  defaultVehicleModel = 'Toyota Hilux 2.8 GD-6 (2021)',
}: KitingoTicketCenterProps) {
  const [tickets, setTickets] = useState<UnifiedSupportTicket[]>([]);
  const [selectedTicketCode, setSelectedTicketCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);

  // New Ticket Form Fields
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState<'urgente' | 'alta' | 'normal'>('alta');
  const [orderCode, setOrderCode] = useState(defaultOrderCode);
  const [vehicleModel, setVehicleModel] = useState(defaultVehicleModel);
  const [description, setDescription] = useState('');

  // Reply Input
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tickets');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tickets)) {
          setTickets(data.tickets);
          setSelectedTicketCode((prev) => prev || data.tickets[0]?.ticketCode || null);
        }
      }
    } catch {
      // ignore network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Real-time WebSocket listener for Back-Office responses & new tickets
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'ticket:created' && payload.ticket) {
          setTickets((prev) => {
            const exists = prev.some((t) => t.ticketCode === payload.ticket.ticketCode);
            if (exists) return prev;
            return [payload.ticket, ...prev];
          });
        } else if (payload.type === 'ticket:updated' && payload.ticket) {
          setTickets((prev) =>
            prev.map((t) =>
              t.ticketCode === payload.ticket.ticketCode ? payload.ticket : t
            )
          );
        }
      } catch {
        // ignore invalid message
      }
    };

    return () => ws.close();
  }, []);

  const handleApplyPreset = (preset: {
    subject: string;
    priority: 'urgente' | 'alta' | 'normal';
    description: string;
  }) => {
    setSubject(preset.subject);
    setPriority(preset.priority);
    setDescription(preset.description);
    setShowNewTicketForm(true);
  };

  const handleCreateTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;

    setCreatingTicket(true);
    setFeedbackBanner(null);

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originRole: role,
          reporterName,
          customerName: role === 'cliente' ? reporterName : defaultCustomerName,
          customerPhone: role === 'cliente' ? reporterPhone : defaultCustomerPhone,
          orderCode: orderCode || defaultOrderCode,
          matchCode: defaultMatchCode,
          bancaCode: defaultBancaCode,
          bancaName: defaultBancaName,
          subject: subject.trim(),
          priority,
          vehicleModel: vehicleModel || defaultVehicleModel,
          description: description.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.ticket) {
        setTickets((prev) => {
          const filtered = prev.filter((t) => t.ticketCode !== data.ticket.ticketCode);
          return [data.ticket, ...filtered];
        });
        setSelectedTicketCode(data.ticket.ticketCode);
        setShowNewTicketForm(false);
        setSubject('');
        setDescription('');
        setFeedbackBanner(
          `Ticket ${data.ticket.ticketCode} aberto e encaminhado imediatamente para o Back-Office (Call Center & Supervisão)!`
        );
      }
    } catch {
      // ignore
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleSendReply = async (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const activeTicket = tickets.find((t) => t.ticketCode === selectedTicketCode);
    const textToSend = (customText ?? replyText).trim();
    if (!activeTicket || !textToSend) return;

    setSendingReply(true);
    try {
      const roleLabel =
        role === 'estafeta' ? 'Estafeta' : role === 'banca' ? 'Banca' : 'Cliente';
      const res = await fetch(`/api/tickets/${activeTicket.ticketCode}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderName: `${reporterName} (${roleLabel})`,
          senderRole: role === 'banca' ? 'vendedor' : role,
          messageText: textToSend,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ticket) {
        setTickets((prev) =>
          prev.map((t) => (t.ticketCode === data.ticket.ticketCode ? data.ticket : t))
        );
        setReplyText('');
      }
    } catch {
      // ignore
    } finally {
      setSendingReply(false);
    }
  };

  const activeTicket =
    tickets.find((t) => t.ticketCode === selectedTicketCode) || tickets[0] || null;

  const roleHeaderLabel =
    role === 'estafeta'
      ? 'Central de Ocorrências do Estafeta → Back-Office'
      : role === 'banca'
        ? 'Suporte & Mediação da Banca → Back-Office'
        : 'Suporte & Reclamações do Comprador → Back-Office';

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3.5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Headphones className="size-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-extrabold text-foreground">
                {roleHeaderLabel}
              </h2>
              <span className="rounded-md bg-[#16A34A]/15 px-2 py-0.5 font-mono text-[11px] font-bold text-[#16A34A]">
                Ligação Direta Call Center (+244)
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Abra um ticket para encaminhar qualquer problema diretamente à equipa de resolução do Back-Office Kitingo.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNewTicketForm((prev) => !prev)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#D97706] px-3.5 py-2 text-xs font-bold text-white hover:opacity-90 cursor-pointer"
          >
            <Plus className="size-4" />
            <span>{showNewTicketForm ? 'Fechar Formulário' : 'Abrir Novo Ticket p/ Back-Office'}</span>
          </button>

          <button
            type="button"
            onClick={loadTickets}
            disabled={loading}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl bg-[#16A34A] px-4 py-3 text-xs font-bold text-white"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{feedbackBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="rounded-lg bg-white/20 px-2 py-1 text-[11px] hover:bg-white/30 cursor-pointer"
          >
            OK
          </button>
        </div>
      )}

      {/* Quick 1-Click Incident Presets */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-foreground">
          Encaminhamento Rápido — Selecione o tipo de problema para abrir ticket:
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {ROLE_PRESET_TEMPLATES[role].map((preset) => (
            <button
              key={preset.subject}
              type="button"
              onClick={() => handleApplyPreset(preset)}
              className="flex flex-col justify-between gap-2 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary hover:bg-primary/5 cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`font-mono text-[10px] font-bold uppercase ${
                      preset.priority === 'urgente'
                        ? 'text-[#DC2626]'
                        : preset.priority === 'alta'
                          ? 'text-[#D97706]'
                          : 'text-primary'
                    }`}
                  >
                    Prioridade {preset.priority}
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                </div>
                <p className="mt-1 text-xs font-bold text-foreground line-clamp-2">
                  {preset.subject}
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-2">
                {preset.description}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* New Ticket Submission Form */}
      {showNewTicketForm && (
        <form
          onSubmit={handleCreateTicketSubmit}
          className="rounded-2xl border-2 border-[#D97706]/50 bg-muted/30 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-foreground">
              Novo Ticket para Resolução no Back-Office
            </h3>
            <span className="font-mono text-xs font-semibold text-muted-foreground">
              Origem: {role.toUpperCase()} · {reporterName}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-foreground">
                Assunto / Problema *
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Descreva resumidamente o problema..."
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-foreground">
                Nível de Prioridade
              </label>
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as 'urgente' | 'alta' | 'normal')
                }
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-bold text-foreground focus:border-primary focus:outline-none"
              >
                <option value="urgente">Urgente (Escrow / Peça Divergente)</option>
                <option value="alta">Alta (Rota GPS / Recolha)</option>
                <option value="normal">Normal (Dúvida / Suporte)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-foreground">
                Código do Pedido Associado
              </label>
              <input
                type="text"
                value={orderCode}
                onChange={(e) => setOrderCode(e.target.value)}
                placeholder="Ex: CE-650018"
                className="h-10 w-full rounded-xl border border-input bg-background px-3 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-foreground">
                Viatura / Peça em Questão
              </label>
              <input
                type="text"
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                placeholder="Ex: Toyota Hilux 2.8 GD-6 (2021)"
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-foreground">
              Descrição Detalhada para o Back-Office *
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explique o que aconteceu para que o Back-Office (Call Center / Supervisor) possa resolver..."
              className="w-full rounded-xl border border-input bg-background p-3 text-xs text-foreground focus:border-primary focus:outline-none"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewTicketForm(false)}
              className="rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={creatingTicket}
              className="inline-flex items-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              <Send className="size-3.5" />
              <span>
                {creatingTicket
                  ? 'A encaminhar ao Back-Office...'
                  : 'Submeter & Encaminhar ao Back-Office'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Split Layout: Left Ticket List + Right Active Resolution Chat */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Tickets List */}
        <div className="lg:col-span-5 space-y-2 max-h-96 overflow-y-auto pr-1">
          <p className="text-xs font-bold text-muted-foreground">
            Tickets Encaminhados ao Back-Office ({tickets.length}):
          </p>
          {tickets.map((tk) => {
            const isSelected = activeTicket?.ticketCode === tk.ticketCode;
            return (
              <button
                key={tk.ticketCode}
                type="button"
                onClick={() => setSelectedTicketCode(tk.ticketCode)}
                className={`w-full rounded-xl border p-3 text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-2xs'
                    : 'border-border bg-background hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-black text-foreground">
                    {tk.ticketCode} · Pedido {tk.orderCode || 'CE-650018'}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold text-white ${
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
                </div>
                <p className="mt-1 text-xs font-bold text-foreground line-clamp-1">
                  {tk.subject}
                </p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{tk.vehicleModel}</span>
                  <span className="font-mono tabular-nums">
                    {tk.chatMessages?.length || 0} msgs
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: Active Ticket Resolution Thread with Back-Office */}
        <div className="lg:col-span-7">
          {activeTicket ? (
            <div className="rounded-xl border border-border bg-background p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-black text-primary">
                      {activeTicket.ticketCode}
                    </span>
                    <span className="text-xs font-bold text-foreground">
                      {activeTicket.subject}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Atribuído ao Back-Office: <strong className="text-foreground">{activeTicket.assignedStaffId}</strong> ·{' '}
                    Viatura: {activeTicket.vehicleModel} · Valor Escrow:{' '}
                    <strong className="font-mono text-[#16A34A]">
                      {formatKz(activeTicket.merchantOfferPriceKz)}
                    </strong>
                  </p>
                </div>

                <span
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold text-white ${
                    activeTicket.status === 'resolvido'
                      ? 'bg-[#16A34A]'
                      : activeTicket.status === 'em_mediacao'
                        ? 'bg-[#7C3AED]'
                        : 'bg-[#D97706]'
                  }`}
                >
                  {activeTicket.status === 'resolvido'
                    ? 'Resolvido pelo Back-Office'
                    : activeTicket.status === 'em_mediacao'
                      ? 'Em Análise no Back-Office'
                      : 'Encaminhado ao Back-Office'}
                </span>
              </div>

              {/* Chat Messages */}
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {(activeTicket.chatMessages || []).map((msg) => {
                  const isBackoffice =
                    msg.senderRole === 'call_center' ||
                    msg.senderRole === 'super_admin' ||
                    msg.senderRole === 'field_supervisor' ||
                    msg.senderRole === 'suporte';
                  return (
                    <div
                      key={msg.id}
                      className={`rounded-xl p-2.5 text-xs ${
                        isBackoffice
                          ? 'border border-primary/30 bg-primary/5'
                          : 'border border-border bg-card'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <strong className="text-foreground">
                          {msg.sender}
                          {isBackoffice ? ' · Back-Office Kitingo' : ''}
                        </strong>
                        <span className="font-mono tabular-nums">{msg.timestamp}</span>
                      </div>
                      <p className="mt-1 text-foreground">{msg.text}</p>
                    </div>
                  );
                })}
              </div>

              {/* Reply Input */}
              <form onSubmit={(e) => handleSendReply(e)} className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Enviar mensagem ou evidência adicional para o Back-Office..."
                  className="h-10 flex-1 rounded-xl border border-input bg-card px-3 text-xs text-foreground focus:border-primary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sendingReply || !replyText.trim()}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="size-3.5" />
                  <span>Enviar</span>
                </button>
              </form>
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
              Selecione um ticket ou clique em "Abrir Novo Ticket p/ Back-Office".
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
